"use client";

import { LookupById } from "@/components/admin/shared";
import { lookupJournal } from "@/app/admin/finance/actions";
import { JournalApprovalActions } from "./JournalApprovalActions";
import { APPROVAL_STATUS_LABELS, type JournalWithLines } from "@/lib/api/general-ledger";

function renderRecord(journal: JournalWithLines) {
  return (
    <div>
      <p className="text-xs text-slate-500">
        {journal.description} · {journal.fiscal_period} · {journal.status} ·{" "}
        {APPROVAL_STATUS_LABELS[journal.approval_status]}
      </p>
      <JournalApprovalActions journal={journal} />
    </div>
  );
}

/**
 * Wraps LookupById for the journal register so its renderRecord closure
 * (which mounts JournalApprovalActions) is defined inside a Client Component
 * rather than passed in from the Server Component page — a plain function
 * cannot cross that boundary as a prop.
 */
export function JournalLookupPanel() {
  return (
    <LookupById
      action={lookupJournal}
      inputName="lookup_journal_id"
      label="Read one journal"
      placeholder="Must be a UUID"
      hint="The full record including every line: each actor and timestamp along the lifecycle, the reversal link if this journal is one, and the Atomic Linking references tying the posting to the upstream event or governance decision that caused it. An unknown id, another tenant's journal, and a malformed one all read as absent — the service deliberately does not distinguish them."
      renderRecord={renderRecord}
    />
  );
}
