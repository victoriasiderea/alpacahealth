/**
 * Seed clients — SPEC.md §6.
 *
 *   Jordan M. — not_started. Intake and assessment done; the "where do I
 *               start?" case. Supervising-clinician NPI is not on file — the
 *               blocker the old UI only surfaced inside Create Request.
 *   Priya R.  — awaiting_signature. Requested 9 days ago, unsigned, one
 *               reminder sent.
 *   Marcus T. — drafting after revisions. Payor returned the goals section;
 *               v1 is signed, v2 is in progress, so the v1 signature is stale.
 *   Dana K.   — ready_to_submit. Draft finalized, parent signed, every packet
 *               item satisfied — zero blockers. The "just press submit" case.
 *
 * Each seed is built by replaying real events through the state machine, so the
 * fixtures cannot drift from the transition rules.
 */

import type { AuthType, Client, CycleAggregate, CycleFile, InsuranceCard, PlanVersion } from "./types";
import { applyEvent, type CycleEventInput } from "./stateMachine";

/** Fixed "now" so relative ages ("9 days ago") are deterministic. */
export const SEED_NOW = "2026-09-08T17:00:00.000Z";

const DAY = 86_400_000;

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY).toISOString();
}

const dateOnly = (iso: string): string => iso.slice(0, 10);

/* --------------------------- factory --------------------------- */

export function newCycle(p: {
  id: string;
  client: Client;
  card: InsuranceCard;
  authType: AuthType;
  createdAt: string;
  requestedStartDate: string;
  requestedEndDate: string;
  expectedStartOfTreatment: string;
  file?: Partial<CycleFile>;
}): CycleAggregate {
  return {
    client: p.client,
    card: p.card,
    cycle: {
      id: p.id,
      clientId: p.client.id,
      insuranceCardId: p.card.id,
      authType: p.authType,
      status: { phase: "not_started" },
      requestedStartDate: p.requestedStartDate,
      requestedEndDate: p.requestedEndDate,
      expectedStartOfTreatment: p.expectedStartOfTreatment,
      createdAt: p.createdAt,
      file: {
        supervisingClinicianNpi: null,
        referralLetterDate: null,
        benefitCheckStatus: "none",
        diagnosisVerified: false,
        ...p.file,
      },
    },
    plan: null,
    versions: [],
    signatures: [],
    events: [],
  };
}

export function replay(agg: CycleAggregate, events: CycleEventInput[]): CycleAggregate {
  return events.reduce(applyEvent, agg);
}

/* --------------------------- clients + cards --------------------------- */

const jordanClient: Client = { id: "cl-jordan", name: "Jordan Meadows", dateOfBirth: "2018-04-11" };
const priyaClient: Client = { id: "cl-priya", name: "Priya Raman", dateOfBirth: "2019-09-02" };
const marcusClient: Client = { id: "cl-marcus", name: "Marcus Turner", dateOfBirth: "2017-11-20" };
const danaClient: Client = { id: "cl-dana", name: "Dana Kessler", dateOfBirth: "2019-02-14" };

const jordanCard: InsuranceCard = {
  id: "ins-jordan",
  clientId: "cl-jordan",
  payerName: "Aetna",
  memberId: "W2041880",
  isPrimary: true,
  networkStatus: "in_network",
  planType: "PPO",
  planStartDate: "2026-01-01",
};

const priyaCard: InsuranceCard = {
  id: "ins-priya",
  clientId: "cl-priya",
  payerName: "Colorado Medicaid",
  memberId: "I451280",
  isPrimary: true,
  networkStatus: "in_network",
  planType: "Medicaid State Plan - HH",
  planStartDate: "2025-10-01",
};

const marcusCard: InsuranceCard = {
  id: "ins-marcus",
  clientId: "cl-marcus",
  payerName: "Aetna",
  memberId: "W5561402",
  isPrimary: true,
  networkStatus: "in_network",
  planType: "PPO",
  planStartDate: "2026-01-01",
};

const danaCard: InsuranceCard = {
  id: "ins-dana",
  clientId: "cl-dana",
  payerName: "United Healthcare",
  memberId: "U88203417",
  isPrimary: true,
  networkStatus: "in_network",
  planType: "PPO",
  planStartDate: "2026-01-01",
};

/* ------------------------------- Jordan ------------------------------- */

export const jordan: CycleAggregate = newCycle({
  id: "cyc-jordan-tx",
  client: jordanClient,
  card: jordanCard,
  authType: "first_treatment_authorization",
  createdAt: addDays(SEED_NOW, -1),
  requestedStartDate: "2026-09-22",
  requestedEndDate: "2027-03-21",
  expectedStartOfTreatment: "2026-09-22",
  file: {
    referralLetterDate: dateOnly(addDays(SEED_NOW, -16)),
    benefitCheckStatus: "complete",
    diagnosisVerified: true,
    supervisingClinicianNpi: null, // ← blocker, visible from the packet on day one
  },
});

/* -------------------------------- Priya ------------------------------- */

export const priya: CycleAggregate = replay(
  newCycle({
    id: "cyc-priya-tx",
    client: priyaClient,
    card: priyaCard,
    authType: "first_treatment_authorization",
    createdAt: addDays(SEED_NOW, -21),
    requestedStartDate: "2026-09-15",
    requestedEndDate: "2027-03-14",
    expectedStartOfTreatment: "2026-09-15",
    file: {
      supervisingClinicianNpi: "1558372459",
      referralLetterDate: "2026-08-20",
      benefitCheckStatus: "complete",
      diagnosisVerified: true,
    },
  }),
  [
    { type: "start_draft", at: addDays(SEED_NOW, -19), origin: "uploaded", auditWarningCount: 4 },
    { type: "finalize", at: addDays(SEED_NOW, -12) },
    { type: "request_signature", at: addDays(SEED_NOW, -9) },
    { type: "send_reminder", at: addDays(SEED_NOW, -3) },
  ],
);

/* -------------------------------- Marcus ------------------------------ */

export const marcus: CycleAggregate = (() => {
  const run = replay(
    newCycle({
      id: "cyc-marcus-tx",
      client: marcusClient,
      card: marcusCard,
      authType: "first_treatment_authorization",
      createdAt: "2026-08-07T13:30:00.000Z",
      requestedStartDate: "2026-08-18",
      requestedEndDate: "2027-02-14",
      expectedStartOfTreatment: "2026-08-18",
      file: {
        supervisingClinicianNpi: "1043219876",
        referralLetterDate: "2026-07-30",
        benefitCheckStatus: "complete",
        diagnosisVerified: true,
      },
    }),
    [
      // v1 uploaded (a correcting re-upload two minutes after the first — see below)
      { type: "start_draft", at: "2026-08-07T13:37:00.000Z", origin: "uploaded", auditWarningCount: 7 },
      { type: "finalize", at: addDays(SEED_NOW, -22) },
      { type: "request_signature", at: addDays(SEED_NOW, -21) },
      { type: "parent_signs", at: addDays(SEED_NOW, -17) },
      { type: "submit_request", at: addDays(SEED_NOW, -15) },
      {
        type: "payer_requests_revisions",
        at: addDays(SEED_NOW, -2),
        note: "Goals section returned: targets 3 and 4 need measurable mastery criteria, and the aggression-reduction goal needs baseline data.",
        auditWarningCount: 3,
      },
    ],
  );

  // The first upload, replaced two minutes later. Kept for audit, unnumbered —
  // it never competes for attention (SPEC.md §5, the Abigail Anderson case).
  const supersededUpload: PlanVersion = {
    id: "cyc-marcus-tx::plan::upload-0",
    planId: "cyc-marcus-tx::plan",
    versionNumber: null,
    origin: "uploaded",
    createdAt: "2026-08-07T13:35:00.000Z",
    supersededAt: "2026-08-07T13:37:00.000Z",
    auditWarningCount: 0,
  };

  return { ...run, versions: [supersededUpload, ...run.versions] };
})();

/* --------------------------------- Dana ------------------------------ */

export const dana: CycleAggregate = replay(
  newCycle({
    id: "cyc-dana-tx",
    client: danaClient,
    card: danaCard,
    authType: "first_treatment_authorization",
    createdAt: addDays(SEED_NOW, -14),
    requestedStartDate: "2026-10-01",
    requestedEndDate: "2027-03-30",
    expectedStartOfTreatment: "2026-10-01",
    file: {
      supervisingClinicianNpi: "1730456821",
      referralLetterDate: "2026-08-25",
      benefitCheckStatus: "complete",
      diagnosisVerified: true,
    },
  }),
  [
    { type: "start_draft", at: addDays(SEED_NOW, -12), origin: "generated_in_alpaca", auditWarningCount: 2 },
    { type: "finalize", at: addDays(SEED_NOW, -6) },
    { type: "request_signature", at: addDays(SEED_NOW, -5) },
    { type: "parent_signs", at: addDays(SEED_NOW, -2) },
  ],
);

/* ------------------------------- exports ----------------------------- */

export const SEEDS = { jordan, priya, marcus, dana } as const;

export function seedList(): CycleAggregate[] {
  return [jordan, priya, marcus, dana];
}
