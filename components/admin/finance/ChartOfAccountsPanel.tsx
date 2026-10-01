import { cookies } from "next/headers";
import { CloudOff, ShieldAlert, FileStack } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listAccounts, explainLedgerError } from "@/lib/api/general-ledger";
import { AccountsRegisterTable } from "./AccountsRegisterTable";

/**
 * ACC-01's Chart of Accounts register — tenant-wide reference data, not
 * scoped to a legal entity. This is the account master every journal line's
 * account_code silently trusted before this pass: general-ledger-svc has
 * always validated nothing about it beyond string shape, so a typo produced
 * a perfectly valid posting against an account that does not exist. This
 * register is where an account is actually declared real.
 */
export async function ChartOfAccountsPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session?.principalId) {
    return (
      <PanelEmptyState icon={ShieldAlert} tone="warning" label="No active session" hint="Sign in again to read the Chart of Accounts." />
    );
  }

  const result = await listAccounts({ principalId: session.principalId, tenantId: session.tenantId, legalEntityId: session.legalEntityId });

  if (!result.ok) {
    return (
      <PanelEmptyState icon={CloudOff} tone="warning" label="Chart of Accounts unavailable" hint={explainLedgerError(result.error.message)} />
    );
  }

  if (result.data.length === 0) {
    return (
      <PanelEmptyState
        icon={FileStack}
        label="No accounts registered yet"
        hint="Register one above. Until an account exists here, a journal line naming its code still posts — the Chart of Accounts constrains nothing retroactively."
      />
    );
  }

  return <AccountsRegisterTable accounts={result.data} />;
}
