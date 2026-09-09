"use client";

import { useEffect, useState } from "react";

/**
 * Draft generator — stubbed. Opens from "Generate draft", fakes ~2s of
 * latency by writing named sections one at a time (no spinner-only screen),
 * then offers "Review and finalize" which closes the modal and lets the
 * caller dispatch `start_draft`. The real 8-step wizard is not built.
 */

const SECTIONS = [
  "Clinical Profile",
  "General Info",
  "Priorities",
  "Behavior Planning",
  "Goals",
  "Recommendations",
];

const TOTAL_MS = 2000;
const STEP_MS = Math.round(TOTAL_MS / SECTIONS.length);

export interface GeneratorModalProps {
  /** Close the modal and dispatch the draft. */
  onFinalize: () => void;
  /** Close without generating. */
  onClose: () => void;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function GeneratorModal({ onFinalize, onClose }: GeneratorModalProps) {
  const [done, setDone] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Sections tick through for texture; a standalone 2s timer is the real
    // gate, so throttled timers can't stretch the wait past TOTAL_MS.
    const tick = setInterval(() => setDone((n) => Math.min(SECTIONS.length, n + 1)), STEP_MS);
    const gate = setTimeout(() => {
      setDone(SECTIONS.length);
      setReady(true);
      clearInterval(tick);
    }, TOTAL_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(gate);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-900/40" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="generator-title"
        className="relative w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 id="generator-title" className="text-sm font-semibold text-zinc-900">
              Generate treatment plan
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {ready
                ? "Draft ready — review the sections, then finalize."
                : "Writing sections from the client record…"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            ✕
          </button>
        </div>

        <ul className="px-5 py-4">
          {SECTIONS.map((name, i) => {
            const state = i < done ? "done" : i === done ? "writing" : "pending";
            return (
              <li key={name} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {state === "done" ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="size-4 text-emerald-600"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m5 12.5 4.5 4.5L19 6.5" />
                    </svg>
                  ) : state === "writing" ? (
                    <span className="size-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
                  ) : (
                    <span className="size-2 rounded-full bg-zinc-300" />
                  )}
                </span>

                <span
                  className={cx(
                    state === "pending" ? "text-zinc-400" : "text-zinc-800",
                    state === "writing" && "font-medium",
                  )}
                >
                  {name}
                </span>

                {state === "writing" ? (
                  <span className="ml-auto text-xs text-zinc-400">writing…</span>
                ) : state === "done" ? (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                    AI-generated
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="border-t border-zinc-200 px-5 py-4">
          {ready ? (
            <button
              type="button"
              onClick={onFinalize}
              className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Review and finalize
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <span className="size-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
              Generating draft…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
