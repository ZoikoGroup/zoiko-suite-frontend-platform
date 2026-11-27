// The workflow register: the table of the open tab, its status and deadline
// marks, and the toolbar's filter options.

import Link from "next/link";
import Form from "next/form";
import { CheckCircle2, Clock3, Minus, MoreHorizontal, Search, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { FilterSelect } from "@/components/admin/console/FilterSelect";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import { humanizeCode } from "@/lib/humanize";
import type { RegisterFilter } from "@/components/admin/console";
import { BASE, href, isFiltered, type DeadlineKey, type Directory, type Query, type Row } from "./data";

type Tone = "success" | "warning" | "danger" | "neutral" | "info";

/** The workflow's state as the register's chip. */
export function statusChip(row: Pick<Row, "wf" | "mine">): { label: string; tone: Tone } {
  switch (row.wf.workflow_status) {
    case "PENDING":
      return row.mine ? { label: "Awaiting You", tone: "warning" } : { label: "In Progress", tone: "info" };
    case "ESCALATED":
      return { label: "Escalated", tone: "danger" };
    case "APPROVED":
      return { label: "Approved", tone: "success" };
    case "REJECTED":
      return { label: "Rejected", tone: "danger" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "neutral" };
    case "EXPIRED":
      return { label: "Expired", tone: "neutral" };
    case "INVALIDATED":
      return { label: "Invalidated", tone: "danger" };
    default:
      return { label: humanizeCode(String(row.wf.workflow_status)) || String(row.wf.workflow_status), tone: "neutral" };
  }
}

export const STATUS_OPTIONS = [
  ["PENDING", "In progress"],
  ["ESCALATED", "Escalated"],
  ["APPROVED", "Approved"],
  ["REJECTED", "Rejected"],
  ["CANCELLED", "Cancelled"],
  ["EXPIRED", "Expired"],
  ["INVALIDATED", "Invalidated"],
] as const;

export const DEADLINE_OPTIONS = [
  ["overdue", "Overdue"],
  ["soon", "Due soon"],
  ["on_track", "On track"],
  ["none", "No deadline"],
  ["closed", "Finished"],
] as const;

const DEADLINE: Record<DeadlineKey, { label: string; icon: typeof Clock3; cls: string }> = {
  overdue: { label: "Overdue", icon: TriangleAlert, cls: "text-rose-600 dark:text-rose-400" },
  soon: { label: "Due Soon", icon: Clock3, cls: "text-amber-600 dark:text-amber-400" },
  on_track: { label: "On Track", icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400" },
  none: { label: "No deadline", icon: Minus, cls: "text-slate-400" },
  closed: { label: "Finished", icon: Minus, cls: "text-slate-400" },
};

export function DeadlineMark({ deadline, due }: { deadline: DeadlineKey; due?: string }) {
  const d = DEADLINE[deadline];
  const Icon = d.icon;
  return (
    <span
      title={due ? `Due ${formatDateTime(due)}` : undefined}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap font-medium",
        d.cls,
        deadline === "soon" && "rounded-md bg-amber-50 px-1.5 py-0.5 dark:bg-amber-500/10",
        deadline === "overdue" && "rounded-md bg-rose-50 px-1.5 py-0.5 dark:bg-rose-500/10",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {d.label}
    </span>
  );
}

/** The toolbar's selects, built from the workflows actually present. */
export function registerFilters(rows: Row[], dir: Directory, query: Query): RegisterFilter[] {
  const types = [...new Set(rows.map((r) => r.wf.workflow_type))].sort();
  const entities = [...new Set(rows.map((r) => r.wf.legal_entity_id))];
  return [
    {
      name: "type",
      allLabel: "Workflow Type",
      value: query.type ?? "",
      options: types.map((t) => [t, humanizeCode(t) || t] as const),
    },
    {
      name: "entity",
      allLabel: "Entity",
      value: query.entity ?? "",
      options: entities.map((e) => [e, dir.entity(e)] as const).sort((a, b) => a[1].localeCompare(b[1])),
    },
    { name: "status", allLabel: "Status", value: query.status ?? "", options: STATUS_OPTIONS },
    { name: "deadline", allLabel: "Deadline", value: query.deadline ?? "", options: DEADLINE_OPTIONS },
  ];
}

/**
 * Search and the four filters on one line beside the drawer (the v2.0 mock):
 * each select as wide as its label, the search takes the rest. A select
 * applies as soon as it changes; Filters applies a typed search.
 */
export function WorkflowToolbar({ filters, query }: { filters: RegisterFilter[]; query: Query }) {
  return (
    <Form action={BASE} scroll={false} className="border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
      {(["tab", "size"] as const).map((k) => (query[k] ? <input key={k} type="hidden" name={k} value={query[k]} /> : null))}
      <div className="flex flex-wrap items-center gap-2 lg:grid lg:grid-cols-[minmax(8rem,1fr)_8.25rem_6.25rem_6.25rem_6.75rem_auto]">
        <label className="relative min-w-52 flex-1 lg:min-w-0">
          <span className="sr-only">Search workflows</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={query.q ?? ""}
            maxLength={200}
            placeholder="Search by ID, title, or description…"
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[12.5px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        {filters.map((f) => (
          <FilterSelect
            key={f.name}
            name={f.name}
            aria-label={f.allLabel}
            defaultValue={f.value}
            options={[["", f.allLabel], ...f.options]}
            className="min-w-32 lg:min-w-0"
            selectClassName="pr-7"
          />
        ))}
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </button>
      </div>
      {isFiltered(query) && (
        <p className="mt-2 text-[12px]">
          <Link href={href({ tab: query.tab, size: query.size })} scroll={false} className="font-medium text-navy-600 hover:text-navy-800 dark:text-navy-300">
            Clear filters
          </Link>
        </p>
      )}
    </Form>
  );
}

/** "Lingaraj (Super Admin)" → "Lingaraj": the role is noise in a narrow column. */
function shortName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, " ").trim() || name;
}

function stageLine(row: Row): string | null {
  if (!row.open) return row.wf.completed_at ? `Closed ${formatDate(row.wf.completed_at)}` : null;
  if (!row.stages?.length) return row.wf.current_stage ? `Stage ${row.wf.current_stage}` : null;
  return `Stage ${row.wf.current_stage} of ${row.stages.length}`;
}

export function WorkflowTable({
  rows,
  query,
  dir,
  selectedId,
}: {
  rows: Row[];
  query: Query;
  dir: Directory;
  selectedId?: string;
}) {
  const head = ["Workflow ID", "Title / Description", "Workflow Type", "Requester", "Current Stage (Status)", "Deadline Status", "Due Date"];
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="min-w-full text-[11.5px]">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800">
            {head.map((h) => (
              <th key={h} scope="col" className="px-1.5 py-3 text-left text-[11px] font-semibold leading-tight text-navy-950 first:pl-4 dark:text-slate-300">
                {h}
              </th>
            ))}
            <th scope="col" className="w-10 pr-2 text-right text-[11px] font-semibold text-navy-950 dark:text-slate-300">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => {
            const id = r.wf.workflow_instance_id;
            const open = href(query, { id, drawer: undefined });
            const selected = selectedId === id;
            const chip = statusChip(r);
            const line = stageLine(r);
            return (
              <tr
                key={id}
                data-selected={selected || undefined}
                className={cn("align-middle transition-colors", selected ? "bg-navy-50/70 dark:bg-navy-500/10" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/30")}
              >
                <td className="whitespace-nowrap px-1.5 py-2.5 pl-4">
                  <Link href={open} scroll={false} title={id} className="font-semibold tabular-nums text-navy-600 hover:text-navy-800 hover:underline dark:text-navy-300">
                    {r.ref}
                  </Link>
                </td>
                <td className="min-w-36 max-w-52 px-1.5 py-2.5">
                  <span className="block truncate font-semibold text-navy-950 dark:text-slate-100" title={r.title}>
                    {r.title}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400" title={r.description}>
                    {r.description}
                  </span>
                </td>
                <td className="min-w-24 max-w-32 px-1.5 py-2.5 leading-snug text-slate-700 dark:text-slate-300">
                  {r.typeLabel}
                  <span className="block truncate text-[10.5px] text-slate-500 dark:text-slate-400" title={`Entity: ${dir.entity(r.wf.legal_entity_id)}`}>
                    {dir.entity(r.wf.legal_entity_id)}
                  </span>
                </td>
                <td className="max-w-28 truncate whitespace-nowrap px-1.5 py-2.5 text-slate-700 dark:text-slate-300" title={r.requester}>
                  {shortName(r.requester)}
                </td>
                <td className="whitespace-nowrap px-1.5 py-2.5">
                  <Badge tone={chip.tone}>{chip.label}</Badge>
                  {line && <span className="mt-0.5 block text-[10.5px] text-slate-500 dark:text-slate-400">{line}</span>}
                </td>
                <td className="whitespace-nowrap px-1.5 py-2.5">
                  <DeadlineMark deadline={r.deadline} due={r.due} />
                </td>
                <td className="whitespace-nowrap px-1.5 py-2.5 tabular-nums text-slate-700 dark:text-slate-300" title={r.due ? formatDateTime(r.due) : undefined}>
                  {r.due ? formatDate(r.due) : "—"}
                </td>
                <td className="pr-2 text-right">
                  <Link
                    href={`/admin/workflows/${id}`}
                    aria-label={`Open ${r.ref}`}
                    title="Open the full workflow"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-navy-700 dark:hover:bg-slate-800"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
