import { cookies } from "next/headers";
import { CloudOff, ShoppingCart, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listPurchaseOrders, summarise } from "@/lib/api/purchase-orders";
import { PurchaseOrderTable } from "./PurchaseOrderTable";
import { OrderStats } from "./OrderStats";

/**
 * Live purchase-order register from purchase-order-svc (:8129), read through
 * the single gateway port at /purchase-order-svc.
 *
 * Scoped to the session's tenant. The service requires tenant_id and enforces
 * row-level security on top of it, so this cannot read another tenant's orders
 * even if the query were tampered with.
 */
export async function PurchaseOrderPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to read the purchase-order register."
      />
    );
  }

  const result = await listPurchaseOrders({
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
        label="Purchase orders unavailable"
        hint={result.error.message}
      />
    );
  }

  const orders = result.data;

  if (orders.length === 0) {
    return (
      <PanelEmptyState
        icon={ShoppingCart}
        label="No purchase orders yet"
        hint="Issue one above and it will appear here immediately — this table reads the service on every request."
      />
    );
  }

  return (
    <div className="space-y-5">
      <OrderStats stats={summarise(orders)} />
      <PurchaseOrderTable orders={orders} />
    </div>
  );
}
