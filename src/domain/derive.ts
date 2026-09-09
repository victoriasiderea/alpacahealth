/**
 * Derived views over a `CycleAggregate` — SPEC.md §2, §3.
 *
 * Everything here is a pure function of the model. Nothing in this file is ever
 * written back. In particular:
 *  - signature staleness falls out of the `SignatureRequest -> PlanVersion`
 *    foreign key; no boolean is flipped when a revision lands.
 *  - `isReady` / `canSubmit` are the blocking-item count, not fields.
 *  - elapsed time is anchored to when the current phase *began*, read from the
 *    event log, not to the last action taken.
 */

import type {
  CycleAggregate,
  CycleEventKind,
  CyclePhase,
  PacketItem,
  PacketItemStatus,
  PlanVersion,
  SignatureRequest,
} from "./types";
import { templateFor, type PacketItemSpec } from "./packetTemplates";

/* ---------------------------- plan / version ----------------------------- */

export function currentVersion(agg: CycleAggregate): PlanVersion | null {
  if (!agg.plan) return null;
  const id = agg.plan.currentVersionId;
  return agg.versions.find((v) => v.id === id) ?? null;
}

/** v2, v1, then the superseded unnumbered upload — newest first. */
export function versionsNewestFirst(agg: CycleAggregate): PlanVersion[] {
  return [...agg.versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function versionNumberOf(agg: CycleAggregate, versionId: string): number | null {
  return agg.versions.find((v) => v.id === versionId)?.versionNumber ?? null;
}

/* ----------------------------- signatures ------------------------------- */

export function pendingSignature(agg: CycleAggregate): SignatureRequest | null {
  return agg.signatures.find((s) => s.status === "pending") ?? null;
}

/** The most recent signature request targeting the version that is now current. */
export function signatureForCurrentVersion(agg: CycleAggregate): SignatureRequest | null {
  const cv = currentVersion(agg);
  if (!cv) return null;
  return (
    [...agg.signatures]
      .filter((s) => s.planVersionId === cv.id)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0] ?? null
  );
}

/** Consent exists for the document that is current. */
export function isSignatureValid(agg: CycleAggregate): boolean {
  return signatureForCurrentVersion(agg)?.status === "signed";
}

/**
 * Consent was captured at some point, but the plan has moved on since, so the
 * signature on file points at a version that is no longer current. Derived —
 * there is no `signatureStale` field to keep in sync.
 */
export function isSignatureStale(agg: CycleAggregate): boolean {
  const everSigned = agg.signatures.some((s) => s.status === "signed");
  return everSigned && !isSignatureValid(agg);
}

export type SignatureState = "none" | "pending" | "valid" | "stale";

export function signatureState(agg: CycleAggregate): SignatureState {
  if (isSignatureValid(agg)) return "valid";
  if (pendingSignature(agg)) return "pending";
  if (isSignatureStale(agg)) return "stale";
  return "none";
}

/* ------------------------------- packet -------------------------------- */

const RESOLVERS: Record<string, (agg: CycleAggregate) => PacketItemStatus> = {
  treatment_plan(agg) {
    const cv = currentVersion(agg);
    if (!cv) return "missing";
    return agg.cycle.status.phase === "drafting" ? "in_progress" : "complete";
  },
  parent_signature(agg) {
    if (isSignatureValid(agg)) return "complete";
    return pendingSignature(agg) ? "in_progress" : "missing";
  },
  supervising_npi: (agg) => (agg.cycle.file.supervisingClinicianNpi ? "complete" : "missing"),
  referral_letter: (agg) => (agg.cycle.file.referralLetterDate ? "complete" : "missing"),
  benefit_check: (agg) => {
    const s = agg.cycle.file.benefitCheckStatus;
    return s === "complete" ? "complete" : s === "pending" ? "in_progress" : "missing";
  },
  diagnosis: (agg) => (agg.cycle.file.diagnosisVerified ? "complete" : "missing"),
};

function resolve(spec: PacketItemSpec, agg: CycleAggregate): PacketItemStatus {
  const resolver = RESOLVERS[spec.key] ?? ((): PacketItemStatus => "missing");
  return resolver(agg);
}

/** Generated from the template, resolved on read. Never stored on the aggregate. */
export function buildPacket(agg: CycleAggregate): PacketItem[] {
  return templateFor(agg.cycle.authType, agg.card.payerName).map((spec) => ({
    id: `${agg.cycle.id}::${spec.key}`,
    cycleId: agg.cycle.id,
    key: spec.key,
    label: spec.label,
    kind: spec.kind,
    status: resolve(spec, agg),
  }));
}

export const isBlocking = (item: PacketItem): boolean => item.status !== "complete";

export function blockingItems(agg: CycleAggregate): PacketItem[] {
  return buildPacket(agg).filter(isBlocking);
}

export function blockingItemCount(agg: CycleAggregate): number {
  return blockingItems(agg).length;
}

/* ----------------------------- readiness ------------------------------- */

export function isReady(agg: CycleAggregate): boolean {
  return blockingItemCount(agg) === 0;
}

export function canSubmit(agg: CycleAggregate): boolean {
  return agg.cycle.status.phase === "ready_to_submit" && isReady(agg);
}

/* --------------------------- elapsed time ----------------------------- */

const PHASE_START_EVENTS: Record<CyclePhase, CycleEventKind[]> = {
  not_started: [],
  drafting: ["draft_started", "payer_requested_revisions"], // re-entry re-anchors the clock
  finalized: ["finalized"],
  awaiting_signature: ["signature_requested"],
  ready_to_submit: ["parent_signed"],
  awaiting_payor: ["submitted"],
  approved: ["payer_approved"],
};

export function phaseEnteredAt(agg: CycleAggregate): string {
  const kinds = PHASE_START_EVENTS[agg.cycle.status.phase];
  for (let i = agg.events.length - 1; i >= 0; i--) {
    if (kinds.includes(agg.events[i].kind)) return agg.events[i].at;
  }
  return agg.cycle.createdAt;
}

export function elapsed(agg: CycleAggregate, now: string): { since: string; days: number } {
  const since = phaseEnteredAt(agg);
  const days = Math.floor((Date.parse(now) - Date.parse(since)) / 86_400_000);
  return { since, days };
}

/* --------------------------- one-shot summary ------------------------- */

export function cycleSummary(agg: CycleAggregate, now: string) {
  return {
    phase: agg.cycle.status.phase,
    blockingCount: blockingItemCount(agg),
    isReady: isReady(agg),
    canSubmit: canSubmit(agg),
    signature: signatureState(agg),
    inPhaseDays: elapsed(agg, now).days,
  };
}
