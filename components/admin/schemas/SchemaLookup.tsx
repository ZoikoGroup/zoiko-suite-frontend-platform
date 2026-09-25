"use client";

import { LookupById } from "@/components/admin/shared";
import { lookupContract } from "@/app/admin/schemas/actions";
import type { ContractReport } from "@/app/admin/schemas/state";
import { ContractSummary, VersionHistory } from "./SchemaSummary";

/**
 * A client component purely to hold the render function: `renderRecord` is an
 * ordinary function prop and cannot cross the server/client boundary, so the
 * page cannot hand it to LookupById itself. Same shape as the evidence lookups.
 */
export function ContractLookup() {
  return (
    <LookupById<ContractReport>
      action={lookupContract}
      inputName="event_name"
      label="Event name"
      placeholder="entity.status.changed"
      hint="Any name from the register above. Shows what an event of that kind must contain, and every change the contract has been through."
      buttonLabel="Read the contract"
      renderRecord={(report) => (
        <div className="space-y-5">
          <ContractSummary schema={report.latest} />

          {report.versions.length > 1 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                How this contract got here
              </p>
              <VersionHistory versions={report.versions} />
              {report.truncated && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Only the most recent versions are listed. The earlier ones still exist — this register
                  never deletes anything.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    />
  );
}
