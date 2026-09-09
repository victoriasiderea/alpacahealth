/**
 * ProgressBar — the cycle state machine as a five-stage bar.
 *
 * Props: the current `phase` (domain `CyclePhase`) and `isCycleSubmitted`.
 *
 * Stages: drafted → signed → submitted → [revising] → approved. The `revising`
 * node is shown only while the cycle has been submitted and is not yet approved
 * — it is where the marker lands when the payer bounces the packet, so the bar
 * visibly steps back from `submitted` into `revising` (the backward edge).
 *
 * With only these two props the component cannot tell a first submission from a
 * resubmission after a revision, so on `awaiting_payor` the marker sits on
 * `submitted` both times and the `revising` node reads as a possible detour.
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
): { stages: Stage[]; currentIndex: number } {
  const showRevising = isCycleSubmitted && phase !== "approved";
  const stages: Stage[] = showRevising
    ? ["drafted", "signed", "submitted", "revising", "approved"]
    : ["drafted", "signed", "submitted", "approved"];

  let current: Stage;
  if (phase === "approved") current = "approved";
  else if (phase === "awaiting_payor") current = "submitted";
  else if (isCycleSubmitted) current = "revising"; // bounced back into the work — the backward edge
  else if (phase === "finalized" || phase === "awaiting_signature") current = "signed";
  else if (phase === "ready_to_submit") current = "submitted";
  else current = "drafted"; // not_started, drafting

  return { stages, currentIndex: stages.indexOf(current) };
}

export function ProgressBar({ phase, isCycleSubmitted, className }: ProgressBarProps) {
  const { stages, currentIndex } = progressModel(phase, isCycleSubmitted);
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
          style={{ left: `${inset}%`, width: `${currentIndex * step}%` }}
        />
      </span>

      {stages.map((stage, i) => {
        const state = i < currentIndex ? "complete" : i === currentIndex ? "current" : "upcoming";
        const revising = stage === "revising";
        return (
          <li key={stage} className="relative flex flex-1 flex-col items-center">
            <span className="flex h-5 items-center">
              <span
                className={cx(
                  "shrink-0 rounded-full",
                  state === "current"
                    ? cx("size-3.5 ring-4", revising ? "bg-amber-500 ring-amber-200" : "bg-blue-600 ring-blue-100")
                    : state === "complete"
                      ? "size-3 bg-zinc-900"
                      : "size-3 border border-zinc-300 bg-white",
                )}
              />
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
