import { LineChart } from "lucide-react";
import { getDecisionStats } from "@/lib/api/governance";
import { PanelEmptyState } from "@/components/admin/shared";
import { GovernedActionsChart } from "./GovernedActionsChart";

/**
 * Server wrapper: reads the decision log and hands the 14-day trend to the
 * client-side chart.
 */
export async function GovernedActionsPanel() {
  const stats = await getDecisionStats(14);

  if (!stats.ok) {
    return (
      <PanelEmptyState
        icon={LineChart}
        tone="warning"
        label="Trend unavailable"
        hint={stats.error.message}
      />
    );
  }

  if (stats.data.total === 0) {
    return (
      <PanelEmptyState
        icon={LineChart}
        label="No governed actions yet"
        hint="This trend plots authorized against escalated executions once decisions start flowing through the Governance Plane."
      />
    );
  }

  return <GovernedActionsChart data={stats.data.trend} />;
}
