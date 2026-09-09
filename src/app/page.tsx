import Link from "next/link";
import type { CycleAggregate, PacketItem } from "@/domain";
import { SEEDS, SEED_NOW, blockingItems, elapsed } from "@/domain";
import { PacketRow } from "@/components/PacketRow";
import { PHASE_TITLE } from "@/components/StatusHeader";

/**
 * Home — the cross-client authorization queue. Rows are cycles, one per row,
 * grouped by what is blocking. Each row reuses the packet row at compact
 * density (the representative blocking item) and links to that cycle's
 * Authorization page.
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

/** The one blocking item that best represents this cycle's next move. */
function representativeItem(agg: CycleAggregate): PacketItem | null {
  const blocking = blockingItems(agg);
  return (
    blocking.find((i) => i.kind === "produce") ??
    blocking.find((i) => i.kind === "gather") ??
    blocking.find((i) => i.kind === "await") ??
    (agg.cycle.status.phase === "awaiting_payor"
      ? {
          id: `${agg.cycle.id}::payer_decision`,
          cycleId: agg.cycle.id,
          key: "payer_decision",
          label: "Payer decision",
          kind: "await",
          status: "in_progress",
        }
      : null)
  );
}

interface Row {
  clientId: string;
  agg: CycleAggregate;
  item: PacketItem;
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
    group: expiring ? "expiring" : item.kind === "await" ? "waiting" : "needs_you",
    elapsedDays: elapsed(agg, SEED_NOW).days,
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
  const entries = Object.entries(SEEDS) as [string, CycleAggregate][];
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
