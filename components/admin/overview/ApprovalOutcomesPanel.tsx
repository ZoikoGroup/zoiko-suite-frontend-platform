import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { PieChart } from "lucide-react";
import { getDecisionStats } from "@/lib/api/governance";
import { PanelEmptyState } from "@/components/admin/shared";
import { ApprovalOutcomesChart } from "./ApprovalOutcomesChart";

/**
 * Server wrapper: reads the decision log and hands the outcome split to the
 * client-side chart.
 */
export async function ApprovalOutcomesPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const identity = {
    principalId: session?.principalId,
    tenantId: session?.tenantId,
    legalEntityId: session?.legalEntityId,
  };
  const stats = await getDecisionStats(14, identity);

  if (!stats.ok) {
    return (
      <PanelEmptyState
        icon={PieChart}
        tone="warning"
        label="Outcomes unavailable"
        hint={stats.error.message}
      />
    );
  }

  if (stats.data.total === 0) {
    return (
      <PanelEmptyState
        icon={PieChart}
        label="No decisions to split"
        hint="Authorized, escalated and denied shares appear once the Governance Plane records its first decision."
      />
    );
  }

  return <ApprovalOutcomesChart data={stats.data.outcomeSplit} />;
}
