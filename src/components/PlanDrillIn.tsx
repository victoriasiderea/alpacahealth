"use client";

import { useEffect } from "react";
import type { PlanVersion, PlanVersionOrigin } from "@/domain";
import { PayerNote } from "@/components/PayerNote";

/**
 * Plan drill-in — a right-hand sheet opened from the treatment plan row.
 * Shows the payer note, the version history (newest first, including the
 * unnumbered superseded uploads), and the document toolbar. Every toolbar
 * button is a stub that logs to the console; Finalize additionally runs the
 * real transition so the interactive loop keeps working.
 */

export interface PlanDrillInProps {
  open: boolean;
  onClose: () => void;
  versions: PlanVersion[];
  currentVersionId: string | null;
  payerNote: { note: string; at: string } | null;
  onFinalize: () => void;
  canFinalize: boolean;
}

const ORIGIN_LABEL: Record<PlanVersionOrigin, string> = {
  generated_in_alpaca: "Generated in Alpaca",
  uploaded: "Uploaded",
  revision: "Revision",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const stub = (label: string) => () => console.log(`[stub] ${label} — treatment plan`);

export function PlanDrillIn({
  open,
  onClose,
  versions,
  currentVersionId,
  payerNote,
  onFinalize,
  canFinalize,
}: PlanDrillInProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const ordered = [...versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-zinc-900/30" onClick={onClose} aria-hidden />

      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Treatment plan</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-6 px-5 py-5">
          {payerNote ? <PayerNote note={payerNote.note} at={payerNote.at} /> : null}

          <button
            type="button"
            onClick={stub("Edit in generator")}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Edit in generator
          </button>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Document</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {["View", "Download", "Replace", "Run audit"].map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={stub(label)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                disabled={!canFinalize}
                onClick={() => {
                  stub("Finalize")();
                  onFinalize();
                }}
                className={cx(
                  "rounded-md px-3 py-1.5 text-xs font-medium",
                  canFinalize ? "bg-zinc-900 text-white hover:bg-zinc-700" : "cursor-not-allowed bg-zinc-200 text-zinc-400",
                )}
              >
                Finalize
              </button>
            </div>
            <div className="mt-2 flex gap-4">
              <button
                type="button"
                onClick={stub("Unfinalize")}
                className="text-xs text-zinc-500 underline hover:text-zinc-800"
              >
                Unfinalize
              </button>
              <button
                type="button"
                disabled
                onClick={stub("Delete")}
                className="cursor-not-allowed text-xs text-zinc-300 underline"
              >
                Delete
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Versions</div>
            <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {ordered.map((v) => {
                const isCurrent = v.id === currentVersionId;
                const superseded = v.supersededAt != null;
                return (
                  <li
                    key={v.id}
                    className={cx(
                      "flex items-baseline justify-between gap-3 px-3 py-2.5 text-sm",
                      superseded && "opacity-55",
                    )}
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-zinc-900">
                        {v.versionNumber == null ? "—" : `v${v.versionNumber}`}
                      </span>
                      <span className="ml-2 text-zinc-500">
                        {ORIGIN_LABEL[v.origin]} · {fmtDate(v.createdAt)}
                      </span>
                      {v.auditWarningCount > 0 ? (
                        <div className="mt-0.5 text-xs text-amber-700">
                          Audited · {v.auditWarningCount} warning{v.auditWarningCount === 1 ? "" : "s"} to review
                        </div>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs font-medium">
                      {isCurrent ? (
                        <span className="text-emerald-600">Current</span>
                      ) : superseded ? (
                        <span className="text-zinc-400">Superseded</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}
