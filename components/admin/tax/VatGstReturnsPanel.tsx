import { cookies } from "next/headers";
import { CloudOff, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listVATReturns, type VATReturn } from "@/lib/api/tax";
import { VatGstWorkbench } from "./VatGstWorkbench";

export async function VatGstReturnsPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in to view and file VAT/GST returns."
      />
    );
  }

  const identity = {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };

  const result = await listVATReturns(identity);

  if (!result.ok && result.error.kind === "unreachable") {
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label="vat-gst-svc unavailable"
        hint={result.error.message}
      />
    );
  }

  const vatReturns: VATReturn[] = result.ok ? result.data : [];
  const sorted = [...vatReturns].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return <VatGstWorkbench initialReturns={sorted} />;
}
