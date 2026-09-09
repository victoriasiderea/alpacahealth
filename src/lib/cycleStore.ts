"use client";

import { SEEDS, applyEvent, type CycleAggregate, type CycleEventInput } from "@/domain";

/**
 * In-memory session store for the cycle aggregates, shared between the queue
 * and the Authorization page so an edit made on one is reflected on the other.
 * Seeded from SEEDS; a full page reload resets it, client-side navigation keeps
 * it. No persistence.
 */

type Listener = () => void;

const SERVER_ENTRIES = Object.entries(SEEDS) as [string, CycleAggregate][];

const state = new Map<string, CycleAggregate>(SERVER_ENTRIES);
const listeners = new Set<Listener>();
let entriesSnapshot: [string, CycleAggregate][] = [...SERVER_ENTRIES];

function emit(): void {
  entriesSnapshot = Array.from(state.entries());
  for (const listener of listeners) listener();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getEntriesSnapshot = (): [string, CycleAggregate][] => entriesSnapshot;
export const getServerEntriesSnapshot = (): [string, CycleAggregate][] => SERVER_ENTRIES;

export const getCycle = (clientId: string): CycleAggregate | null => state.get(clientId) ?? null;
export const getServerCycle = (clientId: string): CycleAggregate | null =>
  (SEEDS as Record<string, CycleAggregate>)[clientId] ?? null;

/** Apply an event to one cycle and notify subscribers. Invalid events are ignored. */
export function dispatchCycle(clientId: string, event: CycleEventInput): void {
  const current = state.get(clientId);
  if (!current) return;
  try {
    state.set(clientId, applyEvent(current, event));
    emit();
  } catch (err) {
    console.warn("[dev] event rejected:", err);
  }
}
