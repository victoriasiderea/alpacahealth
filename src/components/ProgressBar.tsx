/**
 * ProgressBar — the cycle state machine as a four/five-stage bar.
 *
 * Props: the current `phase` (domain `CyclePhase`) and `isCycleSubmitted`.
 *
 * Stages: drafted → signed → submitted → [revising] → approved. The `revising`
 * node is shown *only* while the payer has actually bounced the packet and the
 * clinician is re-working it — and only ever as the active marker, never as a
 * dangling hollow node. That is the visible form of the backward edge.
 *
 * `progressModel` returns `reachedIndex` — the last milestone completed (fills
 * the track, gets a check) — and `currentIndex` — the node in progress, or -1
 * when the cycle is just waiting (submitted, no clinician move to make). The
 * split is what lets Create Request visibly advance the bar without making it
 * look already approved.
 *
 * Seven phases onto four/five nodes: `finalized` and `awaiting_signature` share
 * the `signed` node, and `not_started` / `drafting` share `drafted`.
 */

import type { CyclePhase } from "@/domain";

type Stage = "drafted" | "signed" | "submitted" | "revising" | "approved";

const STAGE_LABEL: Record<Stage, string> = {
  drafted: "Drafted",
  signed: "Signed",
  submitted: "Submitted",
  revising: "Revising",
  approved: "Approved",
};

export interface ProgressBarProps {
  phase: CyclePhase;
  isCycleSubmitted: boolean;
  className?: string;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function progressModel(
  phase: CyclePhase,
  isCycleSubmitted: boolean,
): { stages: Stage[]; reachedIndex: number; currentIndex: number } {
  // the payer bounced it and the clinician is back in the plan work
  const revising =
    isCycleSubmitted &&
    (phase === "drafting" || phase === "finalized" || phase === "awaiting_signature");

  const stages: Stage[] = revising
    ? ["drafted", "signed", "submitted", "revising", "approved"]
    : ["drafted", "signed", "submitted", "approved"];

  let reached: Stage | null; // last milestone completed
  let current: Stage | null; // node in progress, or null while just waiting

  if (phase === "approved") {
    reached = "approved";
    current = "approved";
  } else if (phase === "awaiting_payor") {
    reached = "submitted"; // submitted; nothing for the clinician to do but wait
    current = null;
  } else if (revising) {
    reached = "submitted";
    current = "revising";
  } else if (phase === "ready_to_submit") {
    reached = "signed";
    current = "submitted";
  } else if (phase === "finalized" || phase === "awaiting_signature") {
    reached = "drafted";
    current = "signed";
  } else {
    reached = null; // not_started, drafting
    current = "drafted";
  }

  return {
    stages,
    reachedIndex: reached ? stages.indexOf(reached) : -1,
    currentIndex: current ? stages.indexOf(current) : -1,
  };
}

function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function ProgressBar({ phase, isCycleSubmitted, className }: ProgressBarProps) {
  const { stages, reachedIndex, currentIndex } = progressModel(phase, isCycleSubmitted);
  const n = stages.length;
  const inset = 50 / n; // half a column, as a percentage of the whole bar
  const step = n > 1 ? (100 - 2 * inset) / (n - 1) : 0;

  return (
    <ol className={cx("relative flex", className)}>
      {/* one continuous track on the dot centreline, plus the completed fill */}
      <span className="pointer-events-none absolute inset-x-0 top-2.5 -translate-y-1/2" aria-hidden>
        <span className="absolute h-0.5 bg-zinc-200" style={{ left: `${inset}%`, right: `${inset}%` }} />
        <span
          className="absolute h-0.5 bg-zinc-900"
          style={{ left: `${inset}%`, width: `${Math.max(0, reachedIndex) * step}%` }}
        />
      </span>

      {stages.map((stage, i) => {
        const state = i === currentIndex ? "current" : i <= reachedIndex ? "complete" : "upcoming";
        const revising = stage === "revising";
        return (
          <li key={stage} className="relative flex flex-1 flex-col items-center">
            <span className="flex h-5 items-center">
              {state === "complete" ? (
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white">
                  <Check />
                </span>
              ) : (
                <span
                  className={cx(
                    "shrink-0 rounded-full",
                    state === "current"
                      ? cx("size-3.5 ring-4", revising ? "bg-amber-500 ring-amber-200" : "bg-blue-600 ring-blue-100")
                      : "size-3 border border-zinc-300 bg-white",
                  )}
                />
              )}
            </span>
            <span
              className={cx(
                "mt-2 text-xs",
                state === "current"
                  ? cx("font-semibold", revising ? "text-amber-700" : "text-blue-700")
                  : state === "complete"
                    ? "text-zinc-500"
                    : "text-zinc-400",
              )}
            >
              {STAGE_LABEL[stage]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
