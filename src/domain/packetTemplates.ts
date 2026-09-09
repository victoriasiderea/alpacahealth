/**
 * Packet templates — SPEC.md §3.
 *
 * Packet items are generated from a `(authType, payer) -> template` lookup and
 * then resolved against what is on file (derive.ts). The prototype ships one
 * real template per auth type; the lookup key carries a payer slot so a
 * payer-specific template can be dropped in later. Unknown payers fall back to
 * `<authType>:default`.
 */

import type { AuthType, PacketKind } from "./types";

export interface PacketItemSpec {
  key: string;
  label: string;
  kind: PacketKind;
}

const TEMPLATES: Record<string, PacketItemSpec[]> = {
  "first_treatment_authorization:default": [
    { key: "treatment_plan", label: "Treatment plan", kind: "produce" },
    { key: "parent_signature", label: "Parent signature", kind: "await" },
    { key: "supervising_npi", label: "Supervising clinician NPI", kind: "gather" },
    { key: "referral_letter", label: "Referral letter", kind: "gather" },
    { key: "benefit_check", label: "Benefit Check", kind: "gather" },
    { key: "diagnosis", label: "Diagnosis", kind: "gather" },
  ],
  "assessment_authorization:default": [
    { key: "treatment_plan", label: "Assessment report", kind: "produce" },
    { key: "parent_signature", label: "Parent signature", kind: "await" },
    { key: "supervising_npi", label: "Supervising clinician NPI", kind: "gather" },
    { key: "diagnosis", label: "Diagnosis", kind: "gather" },
  ],
};

export function payerKey(payerName: string): string {
  return payerName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") || "default";
}

export function templateFor(authType: AuthType, payerName: string): PacketItemSpec[] {
  return (
    TEMPLATES[`${authType}:${payerKey(payerName)}`] ??
    TEMPLATES[`${authType}:default`] ??
    []
  );
}
