import { notFound } from "next/navigation";
import type { CycleAggregate } from "@/domain";
import { SEEDS } from "@/domain";
import { AuthorizationView } from "./AuthorizationView";

/**
 * Authorization page — the current state of one cycle, wired to the three seed
 * clients (/client/jordan, /client/priya, /client/marcus). The server resolves
 * the seed; AuthorizationView holds it in memory and makes it interactive.
 */

export default async function AuthorizationPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const agg = (SEEDS as Record<string, CycleAggregate>)[clientId];
  if (!agg) notFound();

  return <AuthorizationView initialAgg={agg} now={new Date().toISOString()} />;
}
