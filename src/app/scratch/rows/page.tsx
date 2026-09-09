import { Fragment } from "react";
import type { PacketItem, PacketItemStatus, PacketKind } from "@/domain";
import { PacketRow } from "@/components/PacketRow";

/**
 * Scratch harness — every packet-row state at both densities, one grid.
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

export default function ScratchRowsPage() {
  return (
    <div className="flex-1 bg-zinc-50 px-10 py-12 text-zinc-900">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-lg font-semibold">Packet row — every state × both densities</h1>
        <p className="mt-1 text-sm text-zinc-500">
          One component. <code className="font-mono text-xs">density=&quot;full&quot;</code> on the
          Authorization page, <code className="font-mono text-xs">density=&quot;compact&quot;</code> in a
          Home queue row. Icon, label, subline and the single action are all derived from{" "}
          <code className="font-mono text-xs">kind</code> + <code className="font-mono text-xs">status</code>.
        </p>

        <div className="mt-10 grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-8 gap-y-3">
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
      </div>
    </div>
  );
}
