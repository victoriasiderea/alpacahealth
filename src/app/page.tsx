"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import type { CycleAggregate, PacketItem } from "@/domain";
import { SEED_NOW, blockingItems, elapsed } from "@/domain";
import { PacketRow, type PacketRowAction } from "@/components/PacketRow";
import { PHASE_TITLE } from "@/components/StatusHeader";
import { getEntriesSnapshot, getServerEntriesSnapshot, subscribe } from "@/lib/cycleStore";

/**
 * Home — the cross-client authorization queue. Rows are cycles, one per row,
 * grouped by what is blocking. Each row reuses the packet row at compact
 * density (the item standing for the next move) and links to that cycle's
 * Authorization page. Reads the shared session store, so edits made on an
 * Authorization page show up here on the way back.
 */

type GroupKey = "needs_you" | "waiting" | "expiring";

const GROUP_TITLE: Record<GroupKey, string> = {
  needs_you: "Needs you",
  waiting: "Waiting on others",
  expiring: "Expiring soon",
};

const GROUP_ORDER: GroupKey[] = ["needs_you", "waiting", "expiring"];

function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / 86_400_000);
}

/** The one item that best represents this cycle's next move, real or synthetic. */
function representativeItem(agg: CycleAggregate): PacketItem | null {
  const blocking = blockingItems(agg);
  const real =
    blocking.find((i) => i.kind === "produce") ??
    blocking.find((i) => i.kind === "gather") ??
    blocking.find((i) => i.kind === "await");
  if (real) return real;

  const phase = agg.cycle.status.phase;
  if (phase === "ready_to_submit") {
    // nothing blocking — the next move is to file the request
    return { id: `${agg.cycle.id}::submit`, cycleId: agg.cycle.id, key: "submit", label: "Create request", kind: "produce", status: "in_progress" };
  }
  if (phase === "awaiting_payor") {
    return { id: `${agg.cycle.id}::payer_decision`, cycleId: agg.cycle.id, key: "payer_decision", label: "Payer decision", kind: "await", status: "in_progress" };
  }
  return null;
}

interface Row {
  clientId: string;
  agg: CycleAggregate;
  item: PacketItem;
  subline?: string;
  action?: PacketRowAction | null;
  group: GroupKey;
  elapsedDays: number;
  expiry: string | null;
}

function buildRow(clientId: string, agg: CycleAggregate): Row | null {
  if (agg.cycle.status.phase === "approved") return null; // nothing pending

  const item = representativeItem(agg);
  if (!item) return null;

  const untilStart = daysBetween(SEED_NOW, agg.cycle.expectedStartOfTreatment);
  const expiring = untilStart <= 3;

  return {
    clientId,
    agg,
    item,
    subline:
      item.key === "submit" ? "Ready to submit" : item.key === "payer_decision" ? "Awaiting payer decision" : undefined,
    action:
      item.key === "submit"
        ? { label: "Create request", tone: "primary" }
        : item.key === "payer_decision"
          ? null
          : undefined,
    group: expiring ? "expiring" : item.kind === "await" ? "waiting" : "needs_you",
    elapsedDays: Math.max(0, elapsed(agg, SEED_NOW).days),
    expiry: expiring
      ? untilStart < 0
        ? "Start date passed"
        : untilStart === 0
          ? "Starts today"
          : `Starts in ${untilStart}d`
      : null,
  };
}

export default function HomePage() {
  const entries = useSyncExternalStore(subscribe, getEntriesSnapshot, getServerEntriesSnapshot);
  const rows = entries.map(([id, agg]) => buildRow(id, agg)).filter((r): r is Row => r !== null);
  const nothingPending = entries.length - rows.length;

  return (
    <div className="flex-1 bg-zinc-50">
      <main className="mx-auto max-w-3xl px-8 py-12">
        <h1 className="text-xl font-semibold text-zinc-900">Authorization queue</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {rows.length} {rows.length === 1 ? "cycle" : "cycles"} need attention across {entries.length} clients.
        </p>

        <div className="mt-10 space-y-10">
          {GROUP_ORDER.map((group) => {
            const groupRows = rows.filter((r) => r.group === group);
            return (
              <section key={group}>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {GROUP_TITLE[group]}
                  </h2>
                  <span className="text-xs text-zinc-400">{groupRows.length}</span>
                </div>

                {groupRows.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-400">Nothing here.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {groupRows.map((row) => (
                      <li key={row.clientId}>
                        <Link href={`/client/${row.clientId}/authorization`} className="group block">
                          <div className="mb-1 flex items-center justify-between px-1">
                            <span className="text-sm font-semibold text-zinc-900 group-hover:underline">
                              {row.agg.client.name}
                            </span>
                            <span className="flex items-center gap-2 text-xs text-zinc-500">
                              {row.expiry ? (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">
                                  {row.expiry}
                                </span>
                              ) : null}
                              {PHASE_TITLE[row.agg.cycle.status.phase]} · {row.elapsedDays}d
                            </span>
                          </div>
                          <PacketRow
                            item={row.item}
                            subline={row.subline}
                            action={row.action}
                            density="compact"
                            interactive={false}
                            className="group-hover:border-zinc-300 group-hover:shadow-sm"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        <p className="mt-12 border-t border-zinc-200 pt-4 text-xs text-zinc-400">
          {nothingPending} of {entries.length} clients with nothing pending.
        </p>
      </main>
    </div>
  );
}
