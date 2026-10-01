import { cookies } from "next/headers";
import { CloudOff, ShieldAlert, FileStack } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listAccountMappings, explainLedgerError } from "@/lib/api/general-ledger";

/**
 * ACC-02's effective-dated account mapping register — a caller-declared
 * business concept (mapping_key) resolved to a real, chart-registered
 * account_code. Versioned: setting a mapping for a key that already has one
 * supersedes it rather than editing it in place, which is why every row
 * below is either currently effective or a superseded predecessor, never a
 * row that was changed.
 */
export async function AccountMappingsPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session?.principalId) {
    return (
      <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in again to read account mappings." />
    );
  }

  const result = await listAccountMappings({ principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId });

  if (!result.ok) {
    return (
      <PanelEmptyState icon={CloudOff} tone="warning" label="Account mappings unavailable" hint={explainLedgerError(result.error.message)} />
    );
  }

  if (result.data.length === 0) {
    return (
      <PanelEmptyState
        icon={FileStack}
        label="No mappings set yet"
        hint="Set one above. A business concept with no mapping simply has none to resolve — nothing defaults."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <thead>
          <tr>
            <th className={HEAD}>Mapping key</th>
            <th className={HEAD}>Account code</th>
            <th className={HEAD}>Effective from</th>
            <th className={HEAD}>Effective to</th>
          </tr>
        </thead>
        <tbody>
          {result.data.map((m) => (
            <tr key={m.account_mapping_id} className="border-t border-slate-100 dark:border-slate-800">
              <td className={`${CELL} font-mono text-xs`}>{m.mapping_key}</td>
              <td className={`${CELL} font-mono text-xs`}>{m.account_code}</td>
              <td className={CELL}>{new Date(m.effective_from).toLocaleString()}</td>
              <td className={CELL}>
                {m.effective_to ? (
                  <span className="text-slate-400">{new Date(m.effective_to).toLocaleString()}</span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400">Current</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
