import { notFound } from "next/navigation";
import type { CycleAggregate } from "@/domain";
import { SEEDS } from "@/domain";
import { AuthorizationView } from "./AuthorizationView";

/**
 * Authorization page — the current state of one cycle, wired to the seed
 * clients (/client/jordan, /client/priya, /client/marcus, /client/dana). The
 * server checks the id; AuthorizationView reads and mutates the shared session
 * store so the queue reflects changes made here.
 */

export default async function AuthorizationPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!(SEEDS as Record<string, CycleAggregate>)[clientId]) notFound();

  return <AuthorizationView clientId={clientId} now={new Date().toISOString()} />;
}
