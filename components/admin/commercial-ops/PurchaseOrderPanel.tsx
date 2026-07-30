import { cookies } from "next/headers";
import { CloudOff, ShoppingCart, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  listPurchaseOrders,
  summarise,
  type OrderStatusFilter,
} from "@/lib/api/purchase-orders";
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
export async function PurchaseOrderPanel({ status }: { status?: OrderStatusFilter }) {
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
    status,
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
        label={status ? `No ${status.toLowerCase()} orders` : "No purchase orders yet"}
        hint={
          status
            ? "The filter is applied by the service, not here — clear it to see the whole register."
            : "Issue one above and it will appear here immediately — this table reads the service on every request."
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Stats are computed from the rows returned, so under a filter they
          describe the filtered set rather than the register. Said plainly
          instead of letting "Open orders: 0" read as a fact about the tenant. */}
      {status && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Filtered to {status}. The totals below describe this filtered set, not the whole
          register.
        </p>
      )}
      <OrderStats stats={summarise(orders)} />
      <PurchaseOrderTable orders={orders} />
    </div>
  );
}
