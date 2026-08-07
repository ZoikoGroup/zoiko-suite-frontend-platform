import { cookies } from "next/headers";
import { CloudOff, Scale, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listContracts, summarise } from "@/lib/api/contracts";
import { ContractTable } from "./ContractTable";
import { ContractStats } from "./ContractStats";

/**
 * Live contract register from contract-lifecycle-svc (:8119), read through the
 * single gateway port at /contract-lifecycle-svc.
 *
 * Scoped to the session's tenant by the X-Tenant-Id header, which the service
 * turns into a Postgres row-level-security predicate. Not narrowed to one legal
 * entity: an admin console read should show every agreement the tenant holds,
 * and the entity each belongs to is a column rather than a filter.
 *
 * Note the failure mode this cannot show. A read with no tenant header does not
 * error — the service substitutes the literal tenant "default" and RLS returns
 * that tenant's rows, which is an empty register. "No contracts yet" and "the
 * identity header never arrived" therefore look identical from here, so the
 * session is checked first and the two are kept apart.
 */
export async function ContractRegisterPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to read the contract register."
      />
    );
  }

  const result = await listContracts({
    identity: {
      principalId: session.principalId,
      tenantId: session.tenantId,
      legalEntityId: session.legalEntityId,
    },
  });

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="Contract register unavailable"
        hint={result.error.message}
      />
    );
  }

  const contracts = result.data;

  if (contracts.length === 0) {
    return (
      <PanelEmptyState
        icon={Scale}
        label="No contracts yet"
        hint="Draft one above and it will appear here immediately — this table reads the service on every request."
      />
    );
  }

  return (
    <div className="space-y-5">
      <ContractStats stats={summarise(contracts)} />
      <ContractTable contracts={contracts} />
    </div>
  );
}
