import type { ReactNode } from "react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import type { FilingRequirement } from "@/lib/api/obligations";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ObligationsData, ObligationsCtx } from "./data";
import { ObligationsReadProblem } from "./problem";
import { BASE } from "./shared";

const FILING_STATUS_LABEL = {
  PENDING: { label: "Pending", tone: "neutral" as const },
  IN_PREPARATION: { label: "In Preparation", tone: "info" as const },
  SUBMITTED: { label: "Submitted", tone: "warning" as const },
  ACCEPTED: { label: "Accepted", tone: "success" as const },
  REJECTED: { label: "Rejected", tone: "danger" as const },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" as const },
};

function chipOf(f: FilingRequirement) {
  return FILING_STATUS_LABEL[f.filing_status as keyof typeof FILING_STATUS_LABEL] ?? { label: f.filing_status, tone: "neutral" as const };
}

export function filingsRegister(data: ObligationsData, ctx: ObligationsCtx): RegisterSpec {
  // This would need the filings data from the API
  return {
    base: BASE,
    problem: (error) => <ObligationsReadProblem error={error} what="filing requirements" />,
    noun: "filing requirements",
    what: "filings required under obligations",
    idColumn: "Filing",
    columns: [{ label: "Type" }, { label: "Authority" }, { label: "Channel" }, { label: "Status" }],
    searchPlaceholder: "Search type, authority or channel",
    empty: "No filing requirements recorded.",
    error: null,
    note: "Filing requirements are created under obligations via the drawer.",
    filters: [],
    rows: [],
    drawer: () => null,
  };
}