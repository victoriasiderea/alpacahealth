/**
 * Domain layer — SPEC.md §3 (model) and §4 (state machine).
 *
 * Pure TypeScript, no React, no persistence. The cycle is the unit of work; its
 * status is a discriminated union; readiness, the blocking count and signature
 * staleness are all derived from this model rather than stored on it.
 */

export * from "./types";
export * from "./packetTemplates";
export * from "./derive";
export * from "./stateMachine";
export * from "./seed";
