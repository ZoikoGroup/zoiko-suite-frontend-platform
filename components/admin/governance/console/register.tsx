// The Decisions register: toolbar (search, four facet filters, More Filters),
// the table, and a pager with page numbers and a rows-per-page choice.

import Link from "next/link";
import Form from "next/form";
import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, ChevronsUp, Minus, MoreHorizontal, Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui";
import { FilterSelect } from "@/components/admin/console/FilterSelect";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import { person } from "@/lib/directory";
import type { LegalEntity } from "@/lib/api/tenants";
import { decisionTitle, statusView, type DecisionSummary, type GovernanceDecision, type Priority } from "@/lib/api/governance";
import { BASE, PAGE_SIZES, entityName, href, isFiltered, type Query } from "./data";

const INPUT =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export function DecisionToolbar({
  query,
  summary,
  entities,
}: {
  query: Query;
  summary: DecisionSummary | null;
  entities: LegalEntity[];
}) {
  const domains = summary?.facets.domains ?? [];
  const jurisdictions = summary?.facets.jurisdictions ?? [];
  const more = ["actor", "entity", "action", "rule_basis", "from", "to"].filter((k) => query[k]).length;
  return (
    <Form action={BASE} scroll={false} className="border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
      {(["tab", "days", "size"] as const).map((k) => (query[k] ? <input key={k} type="hidden" name={k} value={query[k]} /> : null))}
      {/* One row: each select as wide as its "All …" label needs, so none is
          cut off beside the drawer; the search takes the rest. */}
      <div className="flex flex-wrap items-center gap-2 lg:grid lg:grid-cols-[minmax(9rem,1fr)_7.5rem_7.5rem_7.5rem_9rem_auto]">
        <label className="relative min-w-56 flex-1 lg:min-w-0">
          <span className="sr-only">Search decisions</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={query.q ?? ""}
            maxLength={200}
            placeholder="Search decisions…"
            title="Search decisions, references, entities, or users"
            autoComplete="off"
            className={cn(INPUT, "pl-9")}
          />
        </label>
        <FilterSelect name="domain" aria-label="Domain" defaultValue={query.domain ?? ""} className="min-w-40 lg:min-w-0" selectClassName="pr-7"
          options={[["", "All Domains"], ...domains.map((d) => [d.code, d.label] as const)]} />
        <FilterSelect name="status" aria-label="Status" defaultValue={query.status ?? ""} className="min-w-36 lg:min-w-0" selectClassName="pr-7"
          options={[["", "All Statuses"], ["APPROVED", "Approved"], ["PENDING", "Pending"], ["ESCALATED", "Escalated"], ["DENIED", "Denied"], ["OTHER", "Other outcome"]]} />
        <FilterSelect name="priority" aria-label="Priority" defaultValue={query.priority ?? ""} className="min-w-36 lg:min-w-0" selectClassName="pr-7"
          options={[["", "All Priorities"], ["CRITICAL", "Critical"], ["HIGH", "High"], ["MEDIUM", "Medium"], ["LOW", "Low"], ["UNSET", "Not set"]]} />
        <FilterSelect name="jurisdiction" aria-label="Jurisdiction" defaultValue={query.jurisdiction ?? ""} className="min-w-40 lg:min-w-0" selectClassName="pr-7"
          options={[["", "All Jurisdictions"], ...jurisdictions.map((j) => [j, j] as const)]} />
        <details className="group relative">
          <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 group-open:border-navy-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            More Filters{more > 0 && <span className="tabular-nums"> ({more})</span>}
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-[min(40rem,calc(100vw-3rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="text-[11.5px] text-slate-500">
            Legal entity
            <select name="entity" defaultValue={query.entity ?? ""} className={cn(INPUT, "mt-1")}>
              <option value="">All entities</option>
              {entities.map((e) => (
                <option key={e.legal_entity_id} value={e.legal_entity_id}>
                  {e.trading_name || e.legal_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11.5px] text-slate-500">
            Decision owner (principal ID)
            <input name="actor" defaultValue={query.actor ?? ""} className={cn(INPUT, "mt-1")} />
          </label>
          <label className="text-[11.5px] text-slate-500">
            Action type
            <input name="action" defaultValue={query.action ?? ""} placeholder="e.g. APPROVAL_THRESHOLD" className={cn(INPUT, "mt-1")} />
          </label>
          <label className="text-[11.5px] text-slate-500">
            Rule basis
            <input name="rule_basis" defaultValue={query.rule_basis ?? ""} className={cn(INPUT, "mt-1")} />
          </label>
          <label className="text-[11.5px] text-slate-500">
            Decided from
            <input type="date" name="from" defaultValue={query.from ?? ""} className={cn(INPUT, "mt-1")} />
          </label>
          <label className="text-[11.5px] text-slate-500">
            Decided to
            <input type="date" name="to" defaultValue={query.to ?? ""} className={cn(INPUT, "mt-1")} />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" className="inline-flex h-8 items-center rounded-lg bg-navy-900 px-3 text-[12.5px] font-medium text-white hover:bg-navy-800 dark:bg-navy-600">
            Apply filters
          </button>
        </div>
          </div>
        </details>
      </div>
      {isFiltered(query) && (
        <p className="mt-2 text-[12px]">
          <Link href={href({ tab: query.tab, days: query.days, size: query.size })} scroll={false} className="font-medium text-navy-600 hover:text-navy-800 dark:text-navy-300">
            Clear filters
          </Link>
        </p>
      )}
    </Form>
  );
}

const PRIORITY: Record<Priority, { label: string; icon: ReactNode; cls: string }> = {
  CRITICAL: { label: "Critical", icon: <ChevronsUp className="h-3.5 w-3.5" />, cls: "text-rose-700 dark:text-rose-400" },
  HIGH: { label: "High", icon: <ArrowUp className="h-3.5 w-3.5" />, cls: "text-rose-600 dark:text-rose-400" },
  MEDIUM: { label: "Medium", icon: <ArrowRight className="h-3.5 w-3.5 -rotate-45" />, cls: "text-amber-600 dark:text-amber-400" },
  LOW: { label: "Low", icon: <ArrowDown className="h-3.5 w-3.5" />, cls: "text-navy-600 dark:text-navy-300" },
};

export function PriorityMark({ priority }: { priority?: Priority | null }) {
  if (!priority) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-400">
        <Minus className="h-3.5 w-3.5" />
        Not set
      </span>
    );
  }
  const p = PRIORITY[priority];
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", p.cls)}>
      {p.icon}
      {p.label}
    </span>
  );
}

export function StatusBadge({ decision }: { decision: Pick<GovernanceDecision, "status_category" | "outcome"> }) {
  const s = statusView(decision);
  return (
    <Badge tone={s.tone} title={`Recorded outcome: ${decision.outcome}`}>
      {s.label}
    </Badge>
  );
}

/** "Lingaraj (Super Admin)" → "Lingaraj": the role is noise in a narrow column. */
function shortName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, " ").trim();
}

export function DecisionTable({
  rows,
  query,
  domains,
  entities,
  selectedId,
}: {
  rows: GovernanceDecision[];
  query: Query;
  domains: Map<string, string>;
  entities: Map<string, LegalEntity>;
  /** The row the drawer shows (the first row when the URL names none). */
  selectedId?: string;
}) {
  const head = ["ID", "Decision / Title", "Domain", "Entity", "Status", "Priority", "Date & Time", "Jurisdiction", "User"];
  return (
    <div className="overflow-x-auto scrollbar-thin">
      {/* Dense, as in the v2.0 mock: every column fits beside the drawer at
          a 1536px window; titles and domains wrap rather than truncate. */}
      <table className="min-w-full text-[11.5px]">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800">
            {head.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-1.5 py-3 text-left text-[11px] font-semibold text-navy-950 first:pl-4 dark:text-slate-300">
                {h}
              </th>
            ))}
            <th scope="col" className="w-8 pr-2">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((d) => {
            const open = href(query, { id: d.decision_id, pane: undefined, drawer: undefined });
            const selected = selectedId === d.decision_id;
            const who = person(d.actor_id);
            return (
              <tr key={d.decision_id} data-selected={selected || undefined}
                className={cn("align-middle transition-colors", selected ? "bg-navy-50/60 dark:bg-navy-500/10" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/30")}>
                <td className="whitespace-nowrap px-1.5 py-2.5 pl-4">
                  <Link href={open} scroll={false} title={d.decision_id} className="font-medium tabular-nums text-navy-600 hover:text-navy-800 hover:underline dark:text-navy-300">
                    {d.display_ref}
                  </Link>
                </td>
                <td className="min-w-32 max-w-44 px-1.5 py-2.5">
                  <span className="line-clamp-2 leading-snug text-navy-950 dark:text-slate-100" title={decisionTitle(d)}>
                    {decisionTitle(d)}
                  </span>
                  {d.follow_up_count > 0 && (
                    <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
                      {d.follow_up_count} follow-up{d.follow_up_count > 1 ? "s" : ""}
                    </span>
                  )}
                </td>
                <td className="w-28 min-w-24 px-1.5 py-2.5 leading-tight text-slate-600 dark:text-slate-300">{domains.get(d.domain) ?? d.domain}</td>
                <td className="whitespace-nowrap px-1.5 py-2.5 text-slate-600 dark:text-slate-300" title={d.legal_entity_id}>
                  {entityName(entities, d.legal_entity_id)}
                </td>
                <td className="whitespace-nowrap px-1.5 py-2.5">
                  <StatusBadge decision={d} />
                </td>
                <td className="whitespace-nowrap px-1.5 py-2.5">
                  <PriorityMark priority={d.priority} />
                </td>
                <td className="whitespace-nowrap px-1.5 py-2.5 tabular-nums text-slate-600 dark:text-slate-300" title={formatDateTime(d.decided_at)}>
                  {formatDate(d.decided_at)}
                </td>
                <td className="whitespace-nowrap px-1.5 py-2.5 text-slate-600 dark:text-slate-300">{d.jurisdiction_context || "—"}</td>
                <td className="max-w-24 truncate whitespace-nowrap px-1.5 py-2.5 text-slate-600 dark:text-slate-300" title={who.known ? who.name : d.actor_id}>
                  {who.known ? shortName(who.name) : who.name === "System" ? d.actor_id : who.name}
                </td>
                <td className="pr-2 text-right">
                  <Link href={open} scroll={false} aria-label={`Open ${d.display_ref}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-navy-700 dark:hover:bg-slate-800">
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

/** Five consecutive pages around the current one, plus the first and last:
 *  "1 2 3 4 5 … 25" on page 1, as in the v2.0 mock. */
function pageList(page: number, pages: number): (number | "gap")[] {
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const run = Array.from({ length: 5 }, (_, i) => start + i);
  const wanted = new Set([1, pages, ...run].filter((p) => p >= 1 && p <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

const BOX = "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-[12px] font-medium tabular-nums transition-colors";
const IDLE = "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";
const OFF = "pointer-events-none border-slate-100 text-slate-300 dark:border-slate-800 dark:text-slate-600";

export function Pager({ query, page, size, total, noun }: { query: Query; page: number; size: number; total: number; noun: string }) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / size));
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const at = (p: number) => href(query, { page: String(p), id: undefined, pane: undefined });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3.5 text-[12px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <p>
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {noun}
      </p>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-1">
          <Link href={at(page - 1)} scroll={false} aria-label="Previous page" aria-disabled={page <= 1} className={cn(BOX, page <= 1 ? OFF : IDLE)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Link>
          {pageList(page, pages).map((p, i) =>
            p === "gap" ? (
              <span key={`g${i}`} className="px-1 text-slate-400">…</span>
            ) : (
              <Link key={p} href={at(p)} scroll={false} aria-current={p === page ? "page" : undefined}
                className={cn(BOX, p === page ? "border-navy-900 bg-navy-900 text-white dark:border-navy-500 dark:bg-navy-600" : IDLE)}>
                {p}
              </Link>
            ),
          )}
          <Link href={at(page + 1)} scroll={false} aria-label="Next page" aria-disabled={page >= pages} className={cn(BOX, page >= pages ? OFF : IDLE)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      )}
      <Form action={BASE} scroll={false} className="flex items-center gap-2">
        {Object.entries(query).map(([k, v]) => (k !== "size" && k !== "page" && k !== "id" && v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <span>Rows per page</span>
        <FilterSelect name="size" aria-label="Rows per page" defaultValue={String(size)} className="w-20"
          options={PAGE_SIZES.map((n) => [String(n), String(n)] as const)} />
      </Form>
    </div>
  );
}
