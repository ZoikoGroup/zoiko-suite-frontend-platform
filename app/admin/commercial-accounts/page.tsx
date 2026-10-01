import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/admin/shared";
import { CommercialAccountWorkbench } from "@/components/admin/commercial-accounts/CommercialAccountWorkbench";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Commercial Accounts, Subscriptions & Entitlements | Zoiko Suite",
};

export default async function CommercialAccountsPage() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const tenantId = session?.tenantId ?? "11111111-1111-1111-1111-111111111111";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        title="Commercial Accounts & Subscriptions"
        description="Plane 1 (doc7 §3): Authoritative customer records, membership rosters, immutable pricing catalogs, dunning state transitions, and double-billing structural protection."
      />

      <CommercialAccountWorkbench initialTenantId={tenantId} />
    </div>
  );
}
