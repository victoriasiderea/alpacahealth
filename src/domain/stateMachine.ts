/**
 * Cycle state machine — SPEC.md §4.
 *
 *         not_started
 *              │  start_draft
 *              ▼
 *          drafting ◄─────────────────┐
 *              │  finalize            │
 *              ▼                      │
 *          finalized                  │
 *              │  request_signature   │
 *              ▼                      │
 *     awaiting_signature              │  payer_requests_revisions
 *              │  parent_signs        │  (re-entry lands ABOVE the signature
 *              ▼                      │   step, so a revision necessarily
 *       ready_to_submit               │   reopens the signature question)
 *              │  submit_request      │
 *              ▼                      │
 *       awaiting_payor ───────────────┘
 *              │  payer_approves
 *              ▼
 *          approved
 *
 * `applyEvent` is pure: (aggregate, event) -> aggregate. It throws
 * `InvalidTransitionError` for an event the current phase does not allow.
 * `send_reminder` and `record_document` are not phase transitions — they update
 * the aggregate and append to the log without moving `status`.
 */

import type {
  CycleAggregate,
  CycleEvent,
  CycleEventKind,
  CycleFile,
  CyclePhase,
  PlanVersion,
  SignatureRequest,
  TreatmentPlan,
} from "./types";
import { blockingItemCount, currentVersion, pendingSignature } from "./derive";

/* --------------------------- event inputs ---------------------------- */

export type CycleEventInput =
  | { type: "start_draft"; at: string; origin: "generated_in_alpaca" | "uploaded"; auditWarningCount?: number }
  | { type: "finalize"; at: string }
  | { type: "request_signature"; at: string }
  | { type: "send_reminder"; at: string }
  | { type: "parent_signs"; at: string }
  | { type: "submit_request"; at: string }
  | { type: "payer_requests_revisions"; at: string; note: string; auditWarningCount?: number }
  | { type: "payer_approves"; at: string; approvedStartDate: string; approvedEndDate: string }
  | { type: "record_document"; at: string; patch: Partial<CycleFile>; note?: string };

export type CycleEventType = CycleEventInput["type"];

/** The §4 diagram as data — also feeds the UI stepper (incl. the backward edge). */
export const PHASE_TRANSITIONS: ReadonlyArray<{ from: CyclePhase; to: CyclePhase; on: CycleEventType }> = [
  { from: "not_started", to: "drafting", on: "start_draft" },
  { from: "drafting", to: "finalized", on: "finalize" },
  { from: "finalized", to: "awaiting_signature", on: "request_signature" },
  { from: "awaiting_signature", to: "ready_to_submit", on: "parent_signs" },
  { from: "ready_to_submit", to: "awaiting_payor", on: "submit_request" },
  { from: "awaiting_payor", to: "drafting", on: "payer_requests_revisions" }, // re-entry edge
  { from: "awaiting_payor", to: "approved", on: "payer_approves" },
];

export function nextTransitions(phase: CyclePhase) {
  return PHASE_TRANSITIONS.filter((t) => t.from === phase);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: CyclePhase,
    readonly event: CycleEventType,
    detail?: string,
  ) {
    super(`Cannot apply "${event}" while cycle is "${from}"${detail ? ` — ${detail}` : ""}`);
    this.name = "InvalidTransitionError";
  }
}

/* ------------------------------ helpers ------------------------------ */

function logEvent(agg: CycleAggregate, at: string, kind: CycleEventKind, note: string | null): CycleEvent {
  return { id: `${agg.cycle.id}::evt-${agg.events.length + 1}`, cycleId: agg.cycle.id, at, kind, note };
}

function maxVersionNumber(agg: CycleAggregate): number {
  return agg.versions.reduce((m, v) => Math.max(m, v.versionNumber ?? 0), 0);
}

function must(condition: boolean, from: CyclePhase, type: CycleEventType, detail: string): void {
  if (!condition) throw new InvalidTransitionError(from, type, detail);
}

/* ----------------------- the transition function -------------------- */

export function applyEvent(agg: CycleAggregate, event: CycleEventInput): CycleAggregate {
  const phase = agg.cycle.status.phase;

  switch (event.type) {
    case "start_draft": {
      must(phase === "not_started", phase, event.type, "a draft already exists");
      const planId = `${agg.cycle.id}::plan`;
      const version: PlanVersion = {
        id: `${planId}::v1`,
        planId,
        versionNumber: 1,
        origin: event.origin,
        createdAt: event.at,
        supersededAt: null,
        auditWarningCount: event.auditWarningCount ?? 0,
      };
      const plan: TreatmentPlan = { id: planId, cycleId: agg.cycle.id, currentVersionId: version.id };
      const note = event.origin === "uploaded" ? "Plan uploaded" : "Draft generated in Alpaca";
      return {
        ...agg,
        cycle: { ...agg.cycle, status: { phase: "drafting" } },
        plan,
        versions: [version],
        events: [...agg.events, logEvent(agg, event.at, "draft_started", note)],
      };
    }

    case "finalize": {
      must(phase === "drafting", phase, event.type, "only a draft can be finalized");
      const cv = currentVersion(agg);
      must(!!cv, phase, event.type, "no current plan version");
      return {
        ...agg,
        cycle: { ...agg.cycle, status: { phase: "finalized" } },
        events: [...agg.events, logEvent(agg, event.at, "finalized", `Finalized v${cv!.versionNumber ?? "?"}`)],
      };
    }

    case "request_signature": {
      must(phase === "finalized", phase, event.type, "finalize the plan first");
      const cv = currentVersion(agg)!;
      const signature: SignatureRequest = {
        id: `${agg.cycle.id}::sig-${agg.signatures.length + 1}`,
        planVersionId: cv.id, // ← a PlanVersion, never a TreatmentPlan
        requestedAt: event.at,
        remindedAt: null,
        signedAt: null,
        status: "pending",
      };
      return {
        ...agg,
        cycle: { ...agg.cycle, status: { phase: "awaiting_signature" } },
        signatures: [...agg.signatures, signature],
        events: [
          ...agg.events,
          logEvent(agg, event.at, "signature_requested", `Signature requested for v${cv.versionNumber ?? "?"}`),
        ],
      };
    }

    case "send_reminder": {
      must(phase === "awaiting_signature", phase, event.type, "nothing is awaiting signature");
      const pending = pendingSignature(agg);
      must(!!pending, phase, event.type, "no pending signature request");
      return {
        ...agg,
        signatures: agg.signatures.map((s): SignatureRequest =>
          s.id === pending!.id ? { ...s, remindedAt: event.at } : s,
        ),
        events: [...agg.events, logEvent(agg, event.at, "signature_reminded", "Reminder sent to parent")],
      };
    }

    case "parent_signs": {
      must(phase === "awaiting_signature", phase, event.type, "nothing is awaiting signature");
      const pending = pendingSignature(agg);
      must(!!pending, phase, event.type, "no pending signature request");
      return {
        ...agg,
        cycle: { ...agg.cycle, status: { phase: "ready_to_submit" } },
        signatures: agg.signatures.map((s): SignatureRequest =>
          s.id === pending!.id ? { ...s, status: "signed", signedAt: event.at } : s,
        ),
        events: [...agg.events, logEvent(agg, event.at, "parent_signed", "Parent signed")],
      };
    }

    case "submit_request": {
      must(phase === "ready_to_submit", phase, event.type, "cycle is not ready to submit");
      const blockers = blockingItemCount(agg);
      must(blockers === 0, phase, event.type, `${blockers} packet item(s) still blocking`);
      return {
        ...agg,
        cycle: { ...agg.cycle, status: { phase: "awaiting_payor", submittedAt: event.at } },
        events: [...agg.events, logEvent(agg, event.at, "submitted", "Submitted to payer")],
      };
    }

    case "payer_requests_revisions": {
      must(phase === "awaiting_payor", phase, event.type, "cycle is not with the payer");
      const cv = currentVersion(agg);
      must(!!cv && !!agg.plan, phase, event.type, "no plan to revise");
      const nextNumber = maxVersionNumber(agg) + 1;
      const revision: PlanVersion = {
        id: `${agg.plan!.id}::v${nextNumber}`,
        planId: agg.plan!.id,
        versionNumber: nextNumber,
        origin: "revision",
        createdAt: event.at,
        supersededAt: null,
        auditWarningCount: event.auditWarningCount ?? 0,
      };
      return {
        ...agg,
        cycle: { ...agg.cycle, status: { phase: "drafting" } },
        plan: { ...agg.plan!, currentVersionId: revision.id },
        versions: [
          ...agg.versions.map((v): PlanVersion => (v.id === cv!.id ? { ...v, supersededAt: event.at } : v)),
          revision,
        ],
        // Signatures are untouched. The v1 request still points at v1; because v2
        // is now current, isSignatureStale() derives `true` on its own.
        events: [...agg.events, logEvent(agg, event.at, "payer_requested_revisions", event.note)],
      };
    }

    case "payer_approves": {
      const status = agg.cycle.status;
      must(status.phase === "awaiting_payor", phase, event.type, "cycle is not with the payer");
      return {
        ...agg,
        cycle: {
          ...agg.cycle,
          status: {
            phase: "approved",
            submittedAt: status.phase === "awaiting_payor" ? status.submittedAt : event.at,
            decidedAt: event.at,
            approvedStartDate: event.approvedStartDate,
            approvedEndDate: event.approvedEndDate,
          },
        },
        events: [
          ...agg.events,
          logEvent(agg, event.at, "payer_approved", `Approved ${event.approvedStartDate} → ${event.approvedEndDate}`),
        ],
      };
    }

    case "record_document": {
      return {
        ...agg,
        cycle: { ...agg.cycle, file: { ...agg.cycle.file, ...event.patch } },
        events: [...agg.events, logEvent(agg, event.at, "document_recorded", event.note ?? null)],
      };
    }

    default: {
      const exhaustive: never = event;
      throw new Error(`Unhandled event: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** True when `applyEvent(agg, event)` would succeed. */
export function canApply(agg: CycleAggregate, event: CycleEventInput): boolean {
  try {
    applyEvent(agg, event);
    return true;
  } catch (e) {
    if (e instanceof InvalidTransitionError) return false;
    throw e;
  }
}
