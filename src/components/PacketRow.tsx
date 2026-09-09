"use client";

/**
 * PacketRow — the one packet-item row, rendered at two densities:
 *
 *   density="full"     the Authorization page packet list
 *   density="compact"  a Home queue row
 *
 * It is never forked. Everything that differs between the queue and the
 * authorization page is a prop or a density branch here.
 *
 * Props are a derived `PacketItem` (from the domain layer) plus the density.
 * From the item's `kind` + `status` the row derives its icon, its subline and
 * the single action that state calls for (SPEC.md §2). Callers may override the
 * subline (e.g. "9 days · reminded once") or the action, or pass `action={null}`
 * to render none.
 */

import type { PacketItem, PacketItemStatus, PacketKind } from "@/domain";

export type PacketRowDensity = "full" | "compact";

export interface PacketRowAction {
  label: string;
  tone?: "primary" | "secondary";
}

export interface PacketRowProps {
  item: PacketItem;
  density: PacketRowDensity;
  /** Override the state-derived subline. */
  subline?: string;
  /** Override the state-derived action; `null` renders no action. */
  action?: PacketRowAction | null;
  /** Fired when the action button is pressed. */
  onAction?: () => void;
  className?: string;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------- state → copy (defaults, all overridable) --------------- */

const SUBLINE: Record<PacketKind, Record<PacketItemStatus, string>> = {
  produce: { missing: "Not started", in_progress: "In progress", complete: "Finalized" },
  await: { missing: "Not requested", in_progress: "Awaiting parent", complete: "Signed" },
  gather: { missing: "Not on file", in_progress: "Verifying", complete: "On file" },
};

const ACTION: Record<PacketKind, Record<PacketItemStatus, PacketRowAction | null>> = {
  produce: {
    missing: { label: "Generate draft", tone: "primary" },
    in_progress: { label: "Finalize", tone: "primary" },
    complete: null,
  },
  await: {
    missing: { label: "Request signature", tone: "primary" },
    in_progress: { label: "Send reminder", tone: "secondary" },
    complete: null,
  },
  gather: {
    missing: { label: "Attach", tone: "primary" },
    in_progress: { label: "Verify", tone: "secondary" },
    complete: null,
  },
};

export function defaultSubline(item: PacketItem): string {
  return SUBLINE[item.kind][item.status];
}

export function defaultAction(item: PacketItem): PacketRowAction | null {
  return ACTION[item.kind][item.status];
}

/* ------------------------------ component ------------------------------- */

export function PacketRow({ item, density, subline, action, onAction, className }: PacketRowProps) {
  const full = density === "full";
  const resolvedSubline = subline ?? defaultSubline(item);
  const resolvedAction = action === undefined ? defaultAction(item) : action;

  return (
    <div
      data-kind={item.kind}
      data-status={item.status}
      className={cx(
        "flex items-center border border-zinc-200 bg-white",
        full ? "gap-4 rounded-lg px-4 py-3.5" : "gap-3 rounded-md px-3 py-2",
        className,
      )}
    >
      <StatusIcon kind={item.kind} status={item.status} className={full ? "size-5" : "size-4"} />

      <div className="min-w-0 flex-1">
        {full ? (
          <>
            <div className="truncate font-semibold text-zinc-900">{item.label}</div>
            <div className="mt-0.5 text-sm text-zinc-500">{resolvedSubline}</div>
          </>
        ) : (
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-medium text-zinc-900">{item.label}</span>
            <span className="shrink-0 text-xs text-zinc-400">{resolvedSubline}</span>
          </div>
        )}
      </div>

      {resolvedAction ? (
        <button
          type="button"
          onClick={onAction}
          className={cx(
            "shrink-0 rounded-md font-medium transition-colors",
            full ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs",
            (resolvedAction.tone ?? "primary") === "primary"
              ? "bg-zinc-900 text-white hover:bg-zinc-700"
              : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
          )}
        >
          {resolvedAction.label}
        </button>
      ) : (
        <span className={cx("shrink-0 font-medium text-zinc-400", full ? "text-sm" : "text-xs")}>Done</span>
      )}
    </div>
  );
}

/* -------------------------------- icon --------------------------------- */

function StatusIcon({
  kind,
  status,
  className,
}: {
  kind: PacketKind;
  status: PacketItemStatus;
  className?: string;
}) {
  const tone =
    status === "complete"
      ? "text-emerald-600"
      : status === "in_progress"
        ? "text-blue-600"
        : "text-amber-600";

  const Glyph =
    status === "complete"
      ? CheckGlyph
      : kind === "produce"
        ? DocGlyph
        : kind === "await"
          ? ClockGlyph
          : FileGlyph;

  return (
    <span className={cx("shrink-0", tone, className)}>
      <Glyph />
      <span className="sr-only">{status.replace("_", " ")}</span>
    </span>
  );
}

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "size-full",
  "aria-hidden": true,
};

function CheckGlyph() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.4 2.4 4.6-5" />
    </svg>
  );
}

function DocGlyph() {
  return (
    <svg {...svgProps}>
      <rect x="6" y="3.5" width="12" height="17" rx="2" />
      <path d="M9 9h6M9 12.5h6M9 16h4" />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg {...svgProps}>
      <path d="M5 12v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
      <path d="M12 3.5v10m0 0 3.5-3.5M12 13.5 8.5 10" />
    </svg>
  );
}
