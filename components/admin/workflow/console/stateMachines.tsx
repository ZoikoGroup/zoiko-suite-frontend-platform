import type { ReactNode } from "react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import { formatDate, formatDateTime } from "@/lib/format";
import type { WorkflowData, WorkflowCtx } from "./data";
import { WorkflowReadProblem } from "./problem";
import { BASE } from "./shared";

export function stateMachinesRegister(data: WorkflowData, ctx: WorkflowCtx): RegisterSpec {
  // Placeholder - would need state machine data from API
  return {
    base: BASE,
    problem: (error) => <WorkflowReadProblem error={error} what="state machines" />,
    noun: "state machines",
    what: "workflow type state machine definitions",
    idColumn: "State Machine",
    columns: [{ label: "Workflow Type" }, { label: "States" }, { label: "Terminal States" }],
    searchPlaceholder: "Search workflow type",
    empty: "No state machines registered.",
    error: null,
    note: "State machines are derived from workflow definitions. Console v2.0 will include full view.",
    filters: [],
    rows: [],
    drawer: () => null,
  };
}