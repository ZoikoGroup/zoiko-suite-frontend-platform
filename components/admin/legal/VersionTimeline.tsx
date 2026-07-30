import { cookies } from "next/headers";
import { CloudOff, History, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listContractVersions } from "@/lib/api/contracts";
import { formatDateTime, shortId } from "@/lib/format";
import { ContractStatusBadge } from "./ContractStatusBadge";

/**
 * A contract's immutable version history, oldest first.
 *
 * Fetched here rather than passed down so the panel carries its own Suspense
 * boundary — the history is a second round trip and should not hold up the
 * contract's own details.
 *
 * The history is not a complete audit trail, and the panel says so. Creating,
 * revising, activating, and terminating each append a row, but submitting for
 * approval does not: contract-lifecycle-svc changes the status and returns
 * without snapshotting. A contract that went DRAFT -> PENDING_APPROVAL -> ACTIVE
 * shows no evidence here of ever having been submitted.
 */
export async function VersionTimeline({ contractId }: { contractId: string }) {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to read the version history."
      />
    );
  }

  const result = await listContractVersions(contractId, {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Version history unavailable"
        hint={result.error.message}
      />
    );
  }

  if (result.data.length === 0) {
    return (
      <PanelEmptyState
        icon={History}
        tone="warning"
        label="No version history"
        hint="Every contract is snapshotted at creation, so an empty history means the service could not see this contract for your tenant."
      />
    );
  }

  return (
    <ol className="relative space-y-5 border-l border-slate-200 pl-6 dark:border-slate-800">
      {result.data.map((version) => (
        <li key={version.version_id} className="relative">
          <span
            className="absolute -left-[1.9375rem] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white bg-navy-500 dark:border-slate-900"
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              v{version.version_number}
            </span>
            <ContractStatusBadge status={version.status} />
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {formatDateTime(version.created_at)}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            {version.change_summary || (
              <span className="text-slate-400 dark:text-slate-500">
                No change summary was recorded
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {version.title} · by{" "}
            <span title={version.created_by}>{shortId(version.created_by)}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}
