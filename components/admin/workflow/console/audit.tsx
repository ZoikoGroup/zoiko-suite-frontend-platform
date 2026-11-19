import type { ReactNode } from "react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import type { AuditEngagement } from "@/lib/api/workflow";
import { formatDate, formatDateTime } from "@/lib/format";
import type { WorkflowData, WorkflowCtx } from "./data";
import { WorkflowReadProblem } from "./problem";
import { BASE } from "./shared";

const AUDIT_STATUS_LABEL = {
  PROPOSED: { label: "Proposed", tone: "neutral" as const },
  ACCEPTANCE_REVIEW: { label: "Acceptance Review", tone: "info" as const },
  ACCEPTED: { label: "Accepted", tone: "success" as const },
  ACTIVE: { label: "Active", tone: "info" as const },
  FIELDWORK_COMPLETE: { label: "Fieldwork Complete", tone: "warning" as const },
  COMPLETION_REVIEW: { label: "Completion Review", tone: "warning" as const },
  REPORT_READY: { label: "Report Ready", tone: "warning" as const },
  RELEASED: { label: "Released", tone: "success" as const },
  CLOSED: { label: "Closed", tone: "neutral" as const },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" as const },
};

function chipOf(a: any) {
  return AUDIT_STATUS_LABEL[a.status as keyof typeof AUDIT_STATUS_LABEL] ?? { label: a.status, tone: "neutral" as const };
}

export function auditEngagementsRegister(data: WorkflowData, ctx: WorkflowCtx): RegisterSpec {
  // Placeholder - would need audit engagements data from API
  return {
    base: BASE,
    problem: (error) => <WorkflowReadProblem error={error} what="audit engagements" />,
    noun: "audit engagements",
    what: "audit engagement lifecycle",
    idColumn: "Engagement",
    columns: [{ label: "Title" }, { label: "Status" }, { label: "Team" }, { label: "Created" }],
    searchPlaceholder: "Search title or ID",
    empty: "No audit engagements recorded.",
    error: null,
    note: "Audit engagements are managed via the API. Console v2.0 will include full CRUD.",
    filters: [],
    rows: [],
    drawer: () => null,
  };
}