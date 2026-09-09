/**
 * PayerNote — the payer's revision request, shown verbatim.
 *
 * Rendered on the Authorization page when revisions were requested, and reused
 * in the plan drill-in. It never paraphrases the note.
 */

export interface PayerNoteProps {
  note: string;
  /** ISO date the request came in; shown as a small caption when given. */
  at?: string;
  className?: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

export function PayerNote({ note, at, className }: PayerNoteProps) {
  return (
    <div className={["rounded-lg border border-amber-200 bg-amber-50 p-4", className].filter(Boolean).join(" ")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Payer requested revisions
        </span>
        {at ? <span className="shrink-0 text-xs text-amber-700/70">{formatDate(at)}</span> : null}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-amber-900">{note}</p>
    </div>
  );
}
