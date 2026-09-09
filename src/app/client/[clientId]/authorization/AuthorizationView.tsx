"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { AuthType, CycleEventKind, CycleStatus, PacketItem } from "@/domain";
import {
  activityLog,
  blockingItemCount,
  buildPacket,
  canApply,
  canSubmit,
  elapsed,
  isCycleSubmitted,
  payerRevisionNote,
  pendingSignature,
  signatureForCurrentVersion,
  type CycleEventInput,
} from "@/domain";
import { StatusHeader } from "@/components/StatusHeader";
import { ProgressBar } from "@/components/ProgressBar";
import { PacketRow } from "@/components/PacketRow";
import { PayerNote } from "@/components/PayerNote";
import { PlanDrillIn } from "@/components/PlanDrillIn";
import { GeneratorModal } from "@/components/GeneratorModal";
import { dispatchCycle, getCycle, getServerCycle, subscribe } from "@/lib/cycleStore";

/**
 * Client-side shell for the Authorization page. Holds the cycle aggregate in
 * memory; every control dispatches a domain event through `applyEvent` and
 * re-renders. The dev strip fakes the parent and the payer.
 */

const AUTH_TYPE_LABEL: Record<AuthType, string> = {
  assessment_authorization: "Assessment Authorization",
  first_treatment_authorization: "First Treatment Authorization",
};

const EVENT_LABEL: Record<CycleEventKind, string> = {
  draft_started: "Draft started",
  finalized: "Plan finalized",
  signature_requested: "Signature requested",
  signature_reminded: "Reminder sent to parent",
  parent_signed: "Parent signed",
  submitted: "Submitted to payer",
  payer_requested_revisions: "Payer requested revisions",
  payer_approved: "Payer approved",
  document_recorded: "Document recorded",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

function daysAgo(iso: string, now: string): string {
  const d = Math.max(0, Math.floor((Date.parse(now) - Date.parse(iso)) / 86_400_000));
  return d === 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
}

const nowIso = () => new Date().toISOString();

/** Actions that fake a round-trip to the parent before landing. */
const ASYNC_KEYS = new Set(["parent_signature"]);

/** The domain event a packet row's action stands for. */
function packetEvent(item: PacketItem): CycleEventInput | null {
  const at = nowIso();
  switch (item.key) {
    // "treatment_plan" is handled in the render: "missing" opens the generator
    // modal, an existing plan opens the drill-in — neither routes through here.
    case "parent_signature":
      return item.status === "in_progress"
        ? { type: "send_reminder", at }
        : { type: "request_signature", at };
    case "supervising_npi":
      return { type: "record_document", at, patch: { supervisingClinicianNpi: "1999999999" }, note: "NPI added" };
    case "referral_letter":
      return {
        type: "record_document",
        at,
        patch: { referralLetterDate: at.slice(0, 10) },
        note: "Referral letter filed",
      };
    case "benefit_check":
      return { type: "record_document", at, patch: { benefitCheckStatus: "complete" }, note: "Benefit check complete" };
    case "diagnosis":
      return { type: "record_document", at, patch: { diagnosisVerified: true }, note: "Diagnosis verified" };
    default:
      return null;
  }
}

export function AuthorizationView({ clientId, now }: { clientId: string; now: string }) {
  const agg = useSyncExternalStore(
    subscribe,
    useCallback(() => getCycle(clientId)!, [clientId]),
    useCallback(() => getServerCycle(clientId)!, [clientId]),
  );
  const [planDrillOpen, setPlanDrillOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  function dispatch(event: CycleEventInput | null) {
    if (!event) return;
    dispatchCycle(clientId, event);
  }

  /** Fake a ~0.9s API round-trip, then apply the event. */
  function dispatchAsync(key: string, event: CycleEventInput | null) {
    if (!event || pendingKey) return;
    setPendingKey(key);
    window.setTimeout(() => {
      dispatchCycle(clientId, event);
      setPendingKey(null);
    }, 900);
  }

  const { cycle, client, card } = agg;
  const packet = buildPacket(agg);
  const blockers = blockingItemCount(agg);
  const revision = payerRevisionNote(agg);
  const events = activityLog(agg);
  const elapsedDays = Math.max(0, elapsed(agg, now).days);
  const authType = AUTH_TYPE_LABEL[cycle.authType];
  const payer = <span className="font-semibold text-violet-700">{card.payerName}</span>;

  /** Parent-signature row subline — surfaces how long it's been out. */
  function signatureSubline(item: PacketItem): string | undefined {
    if (item.status === "in_progress") {
      const s = pendingSignature(agg);
      if (!s) return undefined;
      let line = `Requested ${daysAgo(s.requestedAt, now)}`;
      if (s.remindedAt) line += ` · reminded ${daysAgo(s.remindedAt, now)}`;
      return line;
    }
    if (item.status === "complete") {
      const s = signatureForCurrentVersion(agg);
      return s?.signedAt ? `Signed ${fmtDate(s.signedAt)}` : undefined;
    }
    return undefined; // "missing" → the default "Not requested"
  }

  const devEvents: { label: string; make: () => CycleEventInput }[] = [
    { label: "Simulate parent signs", make: () => ({ type: "parent_signs", at: nowIso() }) },
    {
      label: "Simulate payer requests revisions",
      make: () => ({
        type: "payer_requests_revisions",
        at: nowIso(),
        note: "Goals section: targets 3 & 4 need measurable mastery criteria, and the aggression-reduction goal needs baseline data.",
      }),
    },
    {
      label: "Simulate payer approves",
      make: () => ({
        type: "payer_approves",
        at: nowIso(),
        approvedStartDate: cycle.requestedStartDate,
        approvedEndDate: cycle.requestedEndDate,
      }),
    },
  ];

  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-3xl px-8 py-12">
        <nav className="text-sm text-zinc-500">
          <Link href="/" className="hover:text-zinc-800 hover:underline">
            Home
          </Link>
          <span className="mx-1.5 text-zinc-300">/</span>
          <Link href="/" className="hover:text-zinc-800 hover:underline">
            Client List
          </Link>
          <span className="mx-1.5 text-zinc-300">/</span>
          <span className="text-zinc-700">{client.name}</span>
          <span className="mx-1.5 text-zinc-300">/</span>
          <span className="font-medium text-zinc-900">Authorization</span>
        </nav>

        <p className="mt-4 text-sm text-zinc-500">
          {client.name} · DOB {fmtDate(client.dateOfBirth)}
        </p>

        <StatusHeader
          className="mt-3"
          status={cycle.status}
          elapsedDays={elapsedDays}
          subtitle={
            <>
              {authType} · {payer}
            </>
          }
        />

        <ProgressBar className="mt-8" phase={cycle.status.phase} isCycleSubmitted={isCycleSubmitted(agg)} />

        <section className="mt-8">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Submission</h3>
          <p className="mt-1 text-sm text-zinc-500">
            {payer} · {authType}
          </p>
          <div className="mt-3">
            <SubmitAction
              status={cycle.status}
              blockers={blockers}
              submittable={canSubmit(agg)}
              expectedStart={cycle.expectedStartOfTreatment}
              onSubmit={() => dispatch({ type: "submit_request", at: nowIso() })}
            />
          </div>
        </section>

        {revision ? <PayerNote className="mt-8" note={revision.note ?? ""} at={revision.at} /> : null}

        <section className="mt-10">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Packet</h3>
          <div className="mt-3 space-y-2">
            {packet.map((item) => {
              const isPlan = item.key === "treatment_plan";
              const planExists = agg.plan != null;
              if (isPlan && planExists) {
                return (
                  <PacketRow
                    key={item.id}
                    item={item}
                    density="full"
                    action={{ label: item.status === "complete" ? "View" : "Edit goals", tone: "secondary" }}
                    onAction={() => setPlanDrillOpen(true)}
                    onRowClick={() => setPlanDrillOpen(true)}
                  />
                );
              }
              if (isPlan) {
                return (
                  <PacketRow
                    key={item.id}
                    item={item}
                    density="full"
                    onAction={() => setGeneratorOpen(true)}
                  />
                );
              }
              const isAsync = ASYNC_KEYS.has(item.key);
              return (
                <PacketRow
                  key={item.id}
                  item={item}
                  density="full"
                  subline={item.key === "parent_signature" ? signatureSubline(item) : undefined}
                  pending={pendingKey === item.key}
                  onAction={
                    isAsync
                      ? () => dispatchAsync(item.key, packetEvent(item))
                      : () => dispatch(packetEvent(item))
                  }
                />
              );
            })}
          </div>
        </section>

        <section className="mt-12">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Activity</h3>
          {events.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">No activity yet.</p>
          ) : (
            <ol className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
              {events.map((e) => (
                <li key={e.id} className="flex items-baseline gap-4 px-4 py-2.5 text-sm">
                  <span className="w-28 shrink-0 tabular-nums text-zinc-400">{fmtDate(e.at)}</span>
                  <span className="text-zinc-700">{EVENT_LABEL[e.kind]}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* -------------------------- dev strip -------------------------- */}
        <section className="mt-14">
          <div className="rounded-lg border-2 border-dashed border-fuchsia-400 bg-fuchsia-50/70 p-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-fuchsia-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Dev only
              </span>
              <span className="text-xs text-fuchsia-800">Fakes the parent and the payer — not real controls.</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {devEvents.map((d) => {
                const enabled = canApply(agg, d.make());
                return (
                  <button
                    key={d.label}
                    type="button"
                    disabled={!enabled}
                    onClick={() => dispatch(d.make())}
                    className={[
                      "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      enabled
                        ? "border-fuchsia-400 bg-white text-fuchsia-800 hover:bg-fuchsia-100"
                        : "cursor-not-allowed border-fuchsia-200 bg-fuchsia-50 text-fuchsia-300",
                    ].join(" ")}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <PlanDrillIn
        open={planDrillOpen}
        onClose={() => setPlanDrillOpen(false)}
        versions={agg.versions}
        currentVersionId={agg.plan?.currentVersionId ?? null}
        payerNote={revision && revision.note ? { note: revision.note, at: revision.at } : null}
        onFinalize={() => dispatch({ type: "finalize", at: nowIso() })}
        canFinalize={canApply(agg, { type: "finalize", at: nowIso() })}
      />

      {generatorOpen ? (
        <GeneratorModal
          onClose={() => setGeneratorOpen(false)}
          onFinalize={() => {
            setGeneratorOpen(false);
            dispatch({ type: "start_draft", at: nowIso(), origin: "generated_in_alpaca", auditWarningCount: 4 });
          }}
        />
      ) : null}
    </div>
  );
}

function SubmitAction({
  status,
  blockers,
  submittable,
  expectedStart,
  onSubmit,
}: {
  status: CycleStatus;
  blockers: number;
  submittable: boolean;
  expectedStart: string;
  onSubmit: () => void;
}) {
  if (status.phase === "approved") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
        Authorized {fmtDate(status.approvedStartDate)} – {fmtDate(status.approvedEndDate)}
      </div>
    );
  }

  if (status.phase === "awaiting_payor") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500">
        Submitted {fmtDate(status.submittedAt)} · awaiting payer decision
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onSubmit}
        disabled={!submittable}
        className={[
          "rounded-md px-4 py-2 text-sm font-medium transition-colors",
          submittable ? "bg-zinc-900 text-white hover:bg-zinc-700" : "cursor-not-allowed bg-zinc-200 text-zinc-400",
        ].join(" ")}
      >
        Create Request
      </button>

      {blockers > 0 ? (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
          {blockers} {blockers === 1 ? "item" : "items"} blocking
        </span>
      ) : (
        <span className="text-xs font-medium text-emerald-600">Ready to submit</span>
      )}

      <span className="ml-auto text-xs text-zinc-400">Expected start {fmtDate(expectedStart)}</span>
    </div>
  );
}
