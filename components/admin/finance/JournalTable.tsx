import { HEAD } from "@/components/admin/shared/form";
import type { JournalHeader } from "@/lib/api/general-ledger";
import { JournalRow } from "./JournalRow";

/** Kept next to the header cells so a column added to one is added to the other —
 *  the row's feedback banner spans this, and a stale count clips it. */
const COLUMNS = ["Journal", "Period", "Stage", "Last action", "Next step"] as const;

/**
 * The journal register.
 *
 * Newest first, as the service orders it. The journal ID is copyable in the
 * first column because the read-one panel takes it by hand, and every principal
 * id is copyable for the same reason — they are the values that have to move
 * between this page and a log.
 */
export function JournalTable({ journals }: { journals: JournalHeader[] }) {
  // The reversal link is stored on the REVERSING journal, so an original can
  // only learn what reversed it by looking sideways across the page. Built once
  // here rather than per row, and only from journals actually on this page — a
  // reversal beyond the page boundary is genuinely unknown, and the row simply
  // does not claim one.
  const reversedBy = new Map<string, string>();
  for (const journal of journals) {
    if (journal.reversal_of_journal_id) {
      reversedBy.set(journal.reversal_of_journal_id, journal.journal_id);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] border-collapse text-left">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                className={column === "Next step" ? `${HEAD} text-right` : HEAD}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {journals.map((journal) => (
            <JournalRow
              key={journal.journal_id}
              journal={journal}
              columnCount={COLUMNS.length}
              reversedByJournalId={reversedBy.get(journal.journal_id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
