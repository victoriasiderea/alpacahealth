import { Fragment } from "react";
import type { CyclePhase, CycleStatus, PacketItem, PacketItemStatus, PacketKind } from "@/domain";
import { PacketRow } from "@/components/PacketRow";
import { StatusHeader } from "@/components/StatusHeader";
import { ProgressBar } from "@/components/ProgressBar";

/**
 * Scratch harness — packet rows, the status header, and the progress bar.
 * Not a product page; no navigation or layout chrome.
 */

const KINDS: PacketKind[] = ["produce", "await", "gather"];
const STATUSES: PacketItemStatus[] = ["missing", "in_progress", "complete"];

const DEMO_LABEL: Record<PacketKind, string> = {
  produce: "Treatment plan",
  await: "Parent signature",
  gather: "Supervising clinician NPI",
};

function demoItem(kind: PacketKind, status: PacketItemStatus): PacketItem {
  return { id: `${kind}-${status}`, cycleId: "scratch", key: kind, label: DEMO_LABEL[kind], kind, status };
}

const SUBMITTED_AT = "2026-06-09T15:00:00.000Z";

const HEADER_CASES: { status: CycleStatus; elapsedDays: number; subtitle: string }[] = [
  { status: { phase: "not_started" }, elapsedDays: 0, subtitle: "First Treatment Authorization · Aetna" },
  { status: { phase: "drafting" }, elapsedDays: 2, subtitle: "First Treatment Authorization · Aetna" },
  {
    status: { phase: "awaiting_signature" },
    elapsedDays: 9,
    subtitle: "First Treatment Authorization · Colorado Medicaid",
  },
  {
    status: { phase: "awaiting_payor", submittedAt: SUBMITTED_AT },
    elapsedDays: 12,
    subtitle: "First Treatment Authorization · Colorado Medicaid",
  },
  {
    status: {
      phase: "approved",
      submittedAt: SUBMITTED_AT,
      decidedAt: "2026-07-10T12:00:00.000Z",
      approvedStartDate: "2026-06-15",
      approvedEndDate: "2026-12-14",
    },
    elapsedDays: 0,
    subtitle: "First Treatment Authorization · Aetna",
  },
];

const BAR_CASES: { caption: string; phase: CyclePhase; isCycleSubmitted: boolean }[] = [
  { caption: "not started", phase: "not_started", isCycleSubmitted: false },
  { caption: "awaiting signature", phase: "awaiting_signature", isCycleSubmitted: false },
  { caption: "ready to submit", phase: "ready_to_submit", isCycleSubmitted: false },
  { caption: "with the payer — first pass", phase: "awaiting_payor", isCycleSubmitted: true },
  { caption: "revisions requested — backward edge", phase: "drafting", isCycleSubmitted: true },
  { caption: "re-signing after a revision", phase: "awaiting_signature", isCycleSubmitted: true },
  { caption: "approved", phase: "approved", isCycleSubmitted: true },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-16 text-lg font-semibold text-zinc-900">{children}</h2>;
}

export default function ScratchRowsPage() {
  return (
    <div className="flex-1 bg-zinc-50 px-10 py-12 text-zinc-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-lg font-semibold">Component scratch</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Packet rows, status header, progress bar — every state, no page chrome.
        </p>

        {/* -------------------------- packet rows -------------------------- */}

        <SectionTitle>Packet row — every state × both densities</SectionTitle>
        <p className="mt-1 text-sm text-zinc-500">
          One component. <code className="font-mono text-xs">density=&quot;full&quot;</code> on the
          Authorization page, <code className="font-mono text-xs">density=&quot;compact&quot;</code> in a
          Home queue row.
        </p>

        <div className="mt-8 grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-8 gap-y-3">
          <div />
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Full</div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Compact</div>

          {KINDS.map((kind) => (
            <Fragment key={kind}>
              <div className="col-span-3 pt-5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {kind}
              </div>

              {STATUSES.map((status) => {
                const item = demoItem(kind, status);
                return (
                  <Fragment key={status}>
                    <div className="text-sm text-zinc-500">{status.replace("_", " ")}</div>
                    <PacketRow item={item} density="full" />
                    <PacketRow item={item} density="compact" />
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </div>

        {/* ------------------------- status header ------------------------ */}

        <SectionTitle>Status header</SectionTitle>
        <p className="mt-1 text-sm text-zinc-500">
          Title from <code className="font-mono text-xs">status.phase</code> only; subtitle is a prop; badge
          shows when elapsed days &gt; 0.
        </p>

        <div className="mt-8 space-y-4">
          {HEADER_CASES.map((c) => (
            <div key={`${c.status.phase}-${c.elapsedDays}`} className="rounded-lg border border-zinc-200 bg-white p-5">
              <StatusHeader status={c.status} elapsedDays={c.elapsedDays} subtitle={c.subtitle} />
            </div>
          ))}
        </div>

        {/* -------------------------- progress bar ----------------------- */}

        <SectionTitle>Progress bar</SectionTitle>
        <p className="mt-1 text-sm text-zinc-500">
          drafted → signed → submitted → <span className="text-amber-700">revising</span> → approved. The{" "}
          <span className="text-amber-700">revising</span> node appears once submitted-and-not-approved; the
          marker steps back into it when the payer bounces the packet.
        </p>

        <div className="mt-8 space-y-8">
          {BAR_CASES.map((c) => (
            <div key={c.caption} className="rounded-lg border border-zinc-200 bg-white px-8 py-6">
              <div className="mb-4 text-xs uppercase tracking-wide text-zinc-400">{c.caption}</div>
              <ProgressBar phase={c.phase} isCycleSubmitted={c.isCycleSubmitted} />
            </div>
          ))}
        </div>

        {/* ------------------------ composed preview --------------------- */}

        <SectionTitle>Composed — header + bar + rows</SectionTitle>
        <p className="mt-1 text-sm text-zinc-500">Marcus, mid-revision, as the three pieces would sit together.</p>

        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6">
          <StatusHeader
            status={{ phase: "drafting" }}
            elapsedDays={2}
            subtitle="First Treatment Authorization · Aetna"
          />
          <ProgressBar className="mt-6" phase="drafting" isCycleSubmitted />
          <div className="mt-6 space-y-2">
            <PacketRow item={demoItem("produce", "in_progress")} density="full" />
            <PacketRow item={demoItem("await", "missing")} density="full" subline="Stale — plan changed since signing" />
          </div>
        </div>
      </div>
    </div>
  );
}
