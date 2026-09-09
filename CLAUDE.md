@AGENTS.md

# Alpaca take-home prototype

Design spec is in SPEC.md — read it before implementing anything new.

## Constraints

- Prototype. In-memory state only. No persistence, no backend, no auth.
- Desktop only. No responsive work.
- Next.js + TypeScript + Tailwind.
- No error boundaries, loading skeletons, or empty-state polish
  beyond what the spec asks for.

## Non-negotiable

- Cycle status is a discriminated union, never booleans.
- Never store derived state. isReady / canSubmit / signatureStale
  are computed from the model, not fields on it.
- SignatureRequest points at a PlanVersion, not a TreatmentPlan.
- One packet row component, rendered in both the queue and the
  authorization page. Do not fork it.

## Faked deliberately

Draft generation, parent signing, payer response. All are buttons
in a visible dev strip.
