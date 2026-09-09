/**
 * scripts/walkthrough.ts
 *
 * Runs Marcus through the full authorization cycle and logs, at every step:
 *   - cycle phase (the discriminated-union status)
 *   - blocking packet-item count
 *   - signature validity (derived from the SignatureRequest -> PlanVersion link)
 *
 *   draft → finalize → request signature → sign → submit
 *         → payer requests revisions (v2 created, v1 signature goes stale)
 *         → finalize v2 → re-request signature → sign → resubmit → approved
 *
 * Run:  npm run walkthrough
 */

import {
  applyEvent,
  buildPacket,
  blockingItemCount,
  canApply,
  canSubmit,
  currentVersion,
  elapsed,
  isReady,
  isSignatureStale,
  isSignatureValid,
  newCycle,
  pendingSignature,
  signatureForCurrentVersion,
  versionNumberOf,
  versionsNewestFirst,
  type Client,
  type CycleAggregate,
  type CycleEventInput,
  type InsuranceCard,
} from "../src/domain";

/* ----------------------------- fixtures ----------------------------- */

const client: Client = { id: "cl-marcus", name: "Marcus Turner", dateOfBirth: "2017-11-20" };
const card: InsuranceCard = {
  id: "ins-marcus",
  clientId: "cl-marcus",
  payerName: "Aetna",
  memberId: "W5561402",
  isPrimary: true,
  networkStatus: "in_network",
  planType: "PPO",
  planStartDate: "2026-01-01",
};

// A fresh cycle. Marcus is past his assessment auth, so the gather items
// (NPI, referral letter, benefit check, diagnosis) are already on file — the
// flow below exercises the produce (plan) and await (signature) items.
let agg: CycleAggregate = newCycle({
  id: "cyc-marcus-run",
  client,
  card,
  authType: "first_treatment_authorization",
  createdAt: "2026-06-01T09:00:00.000Z",
  requestedStartDate: "2026-06-15",
  requestedEndDate: "2026-12-14",
  expectedStartOfTreatment: "2026-06-15",
  file: {
    supervisingClinicianNpi: "1043219876",
    referralLetterDate: "2026-05-20",
    benefitCheckStatus: "complete",
    diagnosisVerified: true,
  },
});

/* ------------------------------ steps ------------------------------- */

type Step = { label: string; at: string; event: CycleEventInput | null };

const steps: Step[] = [
  { label: "cycle created", at: "2026-06-01T09:00:00.000Z", event: null },
  {
    label: "draft generated in Alpaca (v1)",
    at: "2026-06-02T10:00:00.000Z",
    event: { type: "start_draft", at: "2026-06-02T10:00:00.000Z", origin: "generated_in_alpaca", auditWarningCount: 6 },
  },
  { label: "finalize v1", at: "2026-06-04T16:00:00.000Z", event: { type: "finalize", at: "2026-06-04T16:00:00.000Z" } },
  {
    label: "request parent signature",
    at: "2026-06-04T16:30:00.000Z",
    event: { type: "request_signature", at: "2026-06-04T16:30:00.000Z" },
  },
  {
    label: "parent signs v1",
    at: "2026-06-09T14:00:00.000Z",
    event: { type: "parent_signs", at: "2026-06-09T14:00:00.000Z" },
  },
  {
    label: "submit to Aetna",
    at: "2026-06-09T15:00:00.000Z",
    event: { type: "submit_request", at: "2026-06-09T15:00:00.000Z" },
  },
  {
    label: "Aetna requests revisions — v2 created, v1 signature goes stale",
    at: "2026-06-21T11:00:00.000Z",
    event: {
      type: "payer_requests_revisions",
      at: "2026-06-21T11:00:00.000Z",
      note: "Goals section: targets 3 & 4 need measurable mastery criteria; the aggression goal needs baseline data.",
      auditWarningCount: 2,
    },
  },
  { label: "finalize v2", at: "2026-06-24T16:00:00.000Z", event: { type: "finalize", at: "2026-06-24T16:00:00.000Z" } },
  {
    label: "re-request parent signature",
    at: "2026-06-24T16:30:00.000Z",
    event: { type: "request_signature", at: "2026-06-24T16:30:00.000Z" },
  },
  {
    label: "parent signs v2",
    at: "2026-06-28T14:00:00.000Z",
    event: { type: "parent_signs", at: "2026-06-28T14:00:00.000Z" },
  },
  {
    label: "resubmit to Aetna",
    at: "2026-06-28T15:00:00.000Z",
    event: { type: "submit_request", at: "2026-06-28T15:00:00.000Z" },
  },
  {
    label: "Aetna approves",
    at: "2026-07-10T12:00:00.000Z",
    event: {
      type: "payer_approves",
      at: "2026-07-10T12:00:00.000Z",
      approvedStartDate: "2026-06-15",
      approvedEndDate: "2026-12-14",
    },
  },
];

/* ---------------------------- formatting --------------------------- */

function signatureCell(a: CycleAggregate): string {
  if (isSignatureValid(a)) {
    const s = signatureForCurrentVersion(a)!;
    return `valid · v${versionNumberOf(a, s.planVersionId)}`;
  }
  const pending = pendingSignature(a);
  if (pending) return `pending · v${versionNumberOf(a, pending.planVersionId)}`;
  if (isSignatureStale(a)) {
    const lastSigned = [...a.signatures]
      .filter((s) => s.status === "signed")
      .sort((x, y) => (y.signedAt ?? "").localeCompare(x.signedAt ?? ""))[0];
    return `STALE · signed v${versionNumberOf(a, lastSigned.planVersionId)}`;
  }
  return "—";
}

function table(headers: string[], rows: string[][]): void {
  const all = [headers, ...rows];
  const widths = headers.map((_, c) => Math.max(...all.map((r) => r[c].length)));
  const render = (r: string[]) => r.map((cell, c) => cell.padEnd(widths[c])).join("   ");
  console.log(render(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("---"));
  rows.forEach((r) => console.log(render(r)));
}

/* ------------------------------ run ------------------------------- */

console.log(`\nMarcus Turner · first treatment authorization · ${card.payerName}\n`);

const rows: string[][] = [];
let draftingSnapshot: CycleAggregate | null = null;
let previous = agg;

steps.forEach((step, i) => {
  const waited = elapsed(previous, step.at).days; // time the prior phase actually took
  if (step.event) agg = applyEvent(agg, step.event);
  if (agg.cycle.status.phase === "drafting" && !draftingSnapshot) draftingSnapshot = agg;

  rows.push([
    String(i),
    agg.cycle.status.phase,
    String(blockingItemCount(agg)),
    isReady(agg) ? "yes" : "no",
    signatureCell(agg),
    `${waited}d`,
    step.label,
  ]);
  previous = agg;
});

table(["#", "phase", "block", "ready", "signature", "waited", "step"], rows);

/* --------------------------- detail dump -------------------------- */

console.log("\nFinal packet");
for (const item of buildPacket(agg)) {
  const mark = item.status === "complete" ? "✓" : item.status === "in_progress" ? "~" : "✗";
  console.log(`  ${mark} [${item.kind.padEnd(7)}] ${item.label} — ${item.status}`);
}

console.log("\nPlan versions (newest first)");
for (const v of versionsNewestFirst(agg)) {
  const n = v.versionNumber === null ? "upload" : `v${v.versionNumber}`;
  const state = v.supersededAt ? "superseded" : "current";
  console.log(`  ${n.padEnd(6)} ${v.origin.padEnd(19)} ${state}`);
}

console.log("\nSignature trail");
for (const s of agg.signatures) {
  console.log(
    `  ${s.id}  → v${versionNumberOf(agg, s.planVersionId)}  ${s.status}` +
      (s.signedAt ? `  signed ${s.signedAt.slice(0, 10)}` : "") +
      (s.remindedAt ? `  reminded ${s.remindedAt.slice(0, 10)}` : ""),
  );
}

console.log("\nActivity log");
for (const e of agg.events) {
  console.log(`  ${e.at.slice(0, 10)}  ${e.kind.padEnd(26)} ${e.note ?? ""}`);
}

/* ------------------------- machine guards ------------------------- */

console.log("\nGuard checks (illegal events are rejected)");
const d = draftingSnapshot!;
const checks: Array<[string, boolean]> = [
  ["submit while drafting", canApply(d, { type: "submit_request", at: "2026-06-03T00:00:00.000Z" })],
  ["sign while drafting", canApply(d, { type: "parent_signs", at: "2026-06-03T00:00:00.000Z" })],
  [
    "approve a cycle that was never submitted",
    canApply(newCycle({ ...cycleParams() }), {
      type: "payer_approves",
      at: "2026-06-03T00:00:00.000Z",
      approvedStartDate: "2026-06-15",
      approvedEndDate: "2026-12-14",
    }),
  ],
];
for (const [name, allowed] of checks) console.log(`  ${allowed ? "ALLOWED ✗" : "rejected ✓"}  ${name}`);

function cycleParams() {
  return {
    id: "cyc-guard",
    client,
    card,
    authType: "first_treatment_authorization" as const,
    createdAt: "2026-06-01T09:00:00.000Z",
    requestedStartDate: "2026-06-15",
    requestedEndDate: "2026-12-14",
    expectedStartOfTreatment: "2026-06-15",
  };
}

/* --------------------------- assertions -------------------------- */

const ok =
  agg.cycle.status.phase === "approved" &&
  blockingItemCount(agg) === 0 &&
  isSignatureValid(agg) &&
  !isSignatureStale(agg) &&
  canSubmit(agg) === false && // already submitted and approved
  currentVersion(agg)?.versionNumber === 2 &&
  checks.every(([, allowed]) => allowed === false);

if (!ok) {
  console.error("\n✗ walkthrough ended in an unexpected state");
  process.exit(1);
}

console.log("\n✓ ended APPROVED — 0 blocking items, signature valid for v2, all guards held");
