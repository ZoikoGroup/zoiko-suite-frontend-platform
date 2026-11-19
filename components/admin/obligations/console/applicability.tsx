import type { ReactNode } from "react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import type { ApplicabilityDecision, CurrentApplicability } from "@/lib/api/obligations";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ObligationsData, ObligationsCtx } from "./data";
import { ObligationsReadProblem } from "./problem";
import { BASE } from "./shared";

const APPLICABILITY_LABEL = {
  APPLICABLE: { label: "Applicable", tone: "success" as const },
  NOT_APPLICABLE: { label: "Not Applicable", tone: "neutral" as const },
  UNCERTAIN: { label: "Uncertain", tone: "warning" as const },
  UNASSESSED: { label: "Unassessed", tone: "info" as const },
};

function chipOf(decision: string) {
  return APPLICABILITY_LABEL[decision as keyof typeof APPLICABILITY_LABEL] ?? { label: decision, tone: "neutral" as const };
}

export function applicabilityRegister(data: ObligationsData, ctx: ObligationsCtx): RegisterSpec {
  // This would need the applicability data from the API
  return {
    base: BASE,
    problem: (error) => <ObligationsReadProblem error={error} what="applicability decisions" />,
    noun: "applicability decisions",
    what: "whether an obligation binds a specific entity in a jurisdiction",
    idColumn: "Decision",
    columns: [{ label: "Jurisdiction" }, { label: "Entity" }, { label: "Decision" }, { label: "Source" }],
    searchPlaceholder: "Search jurisdiction, entity or source rule",
    empty: "No applicability decisions recorded. Record one via the API.",
    error: null,
    note: "Applicability decisions are versioned and append-only. UNASSESSED is never stored.",
    filters: [],
    rows: [],
    drawer: () => null,
  };
}