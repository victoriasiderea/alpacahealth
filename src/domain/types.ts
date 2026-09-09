/**
 * Domain model — SPEC.md §3.
 *
 * Rules that this file exists to enforce:
 *  - Cycle status is a discriminated union on `phase`, never a bag of booleans.
 *  - Nothing derived is stored. `isReady`, `canSubmit` and signature staleness
 *    are computed from this model (see derive.ts), not persisted here.
 *  - `SignatureRequest` points at a `PlanVersion`, never at a `TreatmentPlan`.
 *
 * Deviation from the §3 sketch, on purpose: `submittedAt`, `decidedAt` and the
 * approved date window live inside the `CycleStatus` union rather than as loose
 * nullable fields on the cycle, so a cycle that has not been submitted cannot
 * carry a `submittedAt` at all.
 */

export type ISODateTime = string; // e.g. "2026-09-08T17:00:00.000Z"
export type ISODate = string; // e.g. "2026-09-08"

export type AuthType = "assessment_authorization" | "first_treatment_authorization";

export interface Client {
  id: string;
  name: string;
  dateOfBirth: ISODate;
}

export type NetworkStatus = "in_network" | "out_of_network" | "unknown";

export interface InsuranceCard {
  id: string;
  clientId: string;
  payerName: string;
  memberId: string;
  isPrimary: boolean;
  networkStatus: NetworkStatus;
  planType: string;
  planStartDate: ISODate;
}

/* -------------------------------------------------------------------------- */
/*  Cycle status — the state machine's phase, as a discriminated union        */
/* -------------------------------------------------------------------------- */

export type CycleStatus =
  | { phase: "not_started" }
  | { phase: "drafting" }
  | { phase: "finalized" }
  | { phase: "awaiting_signature" }
  | { phase: "ready_to_submit" }
  | { phase: "awaiting_payor"; submittedAt: ISODateTime }
  | {
      phase: "approved";
      submittedAt: ISODateTime;
      decidedAt: ISODateTime;
      approvedStartDate: ISODate;
      approvedEndDate: ISODate;
    };

export type CyclePhase = CycleStatus["phase"];

/* -------------------------------------------------------------------------- */
/*  Entities                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * "What is on file" for this cycle. These are genuine inputs (set when a
 * document is filed), not derived state — they drive the `gather` packet items.
 */
export interface CycleFile {
  supervisingClinicianNpi: string | null;
  referralLetterDate: ISODate | null;
  benefitCheckStatus: "none" | "pending" | "complete";
  diagnosisVerified: boolean;
}

export interface AuthorizationCycle {
  id: string;
  clientId: string;
  insuranceCardId: string;
  authType: AuthType;
  status: CycleStatus; // ← the state machine lives here
  requestedStartDate: ISODate;
  requestedEndDate: ISODate;
  expectedStartOfTreatment: ISODate;
  createdAt: ISODateTime;
  file: CycleFile;
}

export interface TreatmentPlan {
  id: string;
  cycleId: string;
  currentVersionId: string;
}

export type PlanVersionOrigin = "generated_in_alpaca" | "uploaded" | "revision";

export interface PlanVersion {
  id: string;
  planId: string;
  versionNumber: number | null; // null for a superseded upload correction
  origin: PlanVersionOrigin;
  createdAt: ISODateTime;
  supersededAt: ISODateTime | null;
  auditWarningCount: number; // their "Audited · N warnings to review"
}

export type SignatureStatus = "pending" | "signed" | "voided";

export interface SignatureRequest {
  id: string;
  planVersionId: string; // ← a PlanVersion, never a TreatmentPlan
  requestedAt: ISODateTime;
  remindedAt: ISODateTime | null;
  signedAt: ISODateTime | null;
  status: SignatureStatus;
}

/** Who is blocking — SPEC.md §2. */
export type PacketKind = "produce" | "await" | "gather";
export type PacketItemStatus = "missing" | "in_progress" | "complete";

export interface PacketItem {
  id: string;
  cycleId: string;
  key: string; // stable within a template
  label: string;
  kind: PacketKind;
  status: PacketItemStatus; // resolved on read — never persisted
}

export type CycleEventKind =
  | "draft_started"
  | "finalized"
  | "signature_requested"
  | "signature_reminded"
  | "parent_signed"
  | "submitted"
  | "payer_requested_revisions"
  | "payer_approved"
  | "document_recorded";

export interface CycleEvent {
  id: string;
  cycleId: string;
  at: ISODateTime;
  kind: CycleEventKind;
  note: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Aggregate — the unit a transition operates on: (cycle, event) -> cycle    */
/* -------------------------------------------------------------------------- */

export interface CycleAggregate {
  client: Client;
  card: InsuranceCard;
  cycle: AuthorizationCycle;
  plan: TreatmentPlan | null;
  versions: PlanVersion[];
  signatures: SignatureRequest[];
  events: CycleEvent[];
  // No `packetItems` here on purpose: the packet is derived (see buildPacket).
}
