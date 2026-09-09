/**
 * StatusHeader — the header for one authorization cycle.
 *
 * Props: the cycle `status` (the domain discriminated union) and `elapsedDays`.
 * It reads only `status.phase` — a total lookup to a title string — and never
 * inspects the union's payload (submittedAt, approved dates, …). The subtitle is
 * passed in; the elapsed badge is shown only when `elapsedDays > 0` and its text
 * comes from that number alone.
 */

import type { CyclePhase, CycleStatus } from "@/domain";

export const PHASE_TITLE: Record<CyclePhase, string> = {
  not_started: "Ready to start",
  drafting: "Revisions requested",
  finalized: "Ready for signature",
  awaiting_signature: "Waiting on the parent",
  ready_to_submit: "Ready to submit",
  awaiting_payor: "With the payer",
  approved: "Approved",
};

export interface StatusHeaderProps {
  status: CycleStatus;
  elapsedDays: number;
  subtitle: string;
  className?: string;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function StatusHeader({ status, elapsedDays, subtitle, className }: StatusHeaderProps) {
  return (
    <header className={cx("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="truncate text-xl font-semibold text-zinc-900">{PHASE_TITLE[status.phase]}</h2>
        <p className="mt-1 truncate text-sm text-zinc-500">{subtitle}</p>
      </div>

      {elapsedDays > 0 ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5"
            aria-hidden
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </svg>
          {elapsedDays === 1 ? "1 day" : `${elapsedDays} days`}
        </span>
      ) : null}
    </header>
  );
}
