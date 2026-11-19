import type { ReactNode } from "react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import type { Case } from "@/lib/api/workflow";
import { formatDate, formatDateTime } from "@/lib/format";
import type { WorkflowData, WorkflowCtx } from "./data";
import { WorkflowReadProblem } from "./problem";
import { BASE } from "./shared";

const CASE_STATUS_LABEL = {
  OPEN: { label: "Open", tone: "info" as const },
  IN_REVIEW: { label: "In Review", tone: "warning" as const },
  RESOLVED: { label: "Resolved", tone: "success" as const },
  CLOSED: { label: "Closed", tone: "neutral" as const },
  ESCALATED: { label: "Escalated", tone: "danger" as const },
};

function chipOf(c: any) {
  return CASE_STATUS_LABEL[c.case_state as keyof typeof CASE_STATUS_LABEL] ?? { label: c.case_state, tone: "neutral" as const };
}

export function casesRegister(data: WorkflowData, ctx: WorkflowCtx): RegisterSpec {
  // Placeholder - would need cases data from API
  return {
    base: BASE,
    problem: (error) => <WorkflowReadProblem error={error} what="cases" />,
    noun: "cases",
    what: "investigation, dispute, and exception cases",
    idColumn: "Case",
    columns: [{ label: "Title" }, { label: "Type" }, { label: "Status" }, { label: "Linked Workflow" }],
    searchPlaceholder: "Search title, type or workflow",
    empty: "No cases recorded.",
    error: null,
    note: "Cases are managed via the API. Console v2.0 will include full CRUD.",
    filters: [],
    rows: [],
    drawer: () => null,
  };
}