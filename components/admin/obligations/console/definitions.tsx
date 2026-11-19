import type { ReactNode } from "react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import type { ObligationDefinition, ObligationEntityMapping } from "@/lib/api/obligations";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ObligationsData, ObligationsCtx } from "./data";
import { ObligationsReadProblem } from "./problem";
import { BASE } from "./shared";

export function definitionsRegister(data: ObligationsData, ctx: ObligationsCtx): RegisterSpec {
  // This would need the definitions/mappings data from the API
  // For now, return a placeholder
  return {
    base: BASE,
    problem: (error) => <ObligationsReadProblem error={error} what="obligation definitions" />,
    noun: "obligation definitions",
    what: "catalogue of obligation definitions and their entity mappings",
    idColumn: "Definition",
    columns: [{ label: "Code" }, { label: "Type" }, { label: "Status" }, { label: "Version" }],
    searchPlaceholder: "Search code, type or jurisdiction",
    empty: "No definitions recorded. Create one with the API.",
    error: null,
    note: "Definitions are managed via the API. Console v2.0 will include full CRUD.",
    filters: [],
    rows: [],
    drawer: () => null,
  };
}

export function mappingsRegister(data: ObligationsData, ctx: ObligationsCtx): RegisterSpec {
  return {
    base: BASE,
    problem: (error) => <ObligationsReadProblem error={error} what="entity mappings" />,
    noun: "entity mappings",
    what: "definition-to-legal-entity mappings",
    idColumn: "Mapping",
    columns: [{ label: "Definition" }, { label: "Entity" }, { label: "Status" }],
    searchPlaceholder: "Search definition or entity",
    empty: "No mappings recorded.",
    error: null,
    note: "Mappings are managed via the API.",
    filters: [],
    rows: [],
    drawer: () => null,
  };
}