import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, toIdentity } from "@/lib/auth";
import { LineChart } from "lucide-react";
import { getDecisionStats } from "@/lib/api/governance";
import { PanelEmptyState } from "@/components/admin/shared";
import { GovernedActionsChart } from "./GovernedActionsChart";

/**
 * Server wrapper: reads the decision log and hands the 14-day trend to the
 * client-side chart.
 */
export async function GovernedActionsPanel() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  // The full session identity, signed envelope included: the governance
  // ledger runs IDENTITY_VERIFY=require and refuses bare identity headers.
  const identity = session ? toIdentity(session) : undefined;
  const stats = await getDecisionStats(14, identity);

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
