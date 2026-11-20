// The Policies & Controls register: toolbar (search and five filters), the
// table with row selection for export, and a pager with page numbers and a
// rows-per-page choice — the v2.0 mock's layout over live policy-svc rows.

import Link from "next/link";
import Form from "next/form";
import { ChevronLeft, ChevronRight, MoreHorizontal, Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui";
import { FilterSelect } from "@/components/admin/console/FilterSelect";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { person } from "@/lib/directory";
import type { LegalEntity } from "@/lib/api/tenants";
import { DOMAIN_LABEL, DOMAIN_ORDER, EFF_LABEL, EFF_TONE, STATUS_LABEL, STATUS_ORDER, STATUS_TONE, type Row } from "./model";
import { BASE, PAGE_SIZES, href, isFiltered, type Query } from "./data";
import { SelectAll } from "./forms";

export const EXPORT_FORM = "pc-export";

const INPUT =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export function RegisterToolbar({ query, entities }: { query: Query; entities: LegalEntity[] }) {
  return (
    <Form action={BASE} scroll={false} className="border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
      {(["size", "months"] as const).map((k) => (query[k] ? <input key={k} type="hidden" name={k} value={query[k]} /> : null))}
      {/* One row beside the drawer: each select as wide as its "All …" label
          (a select is otherwise as wide as its longest option); the search
          takes the rest; entity and overdue sit under Filters. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Search policies and controls</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={query.q ?? ""}
            maxLength={200}
            placeholder="Search policies, controls, owners, or reference…"
            autoComplete="off"
            className={cn(INPUT, "pl-9")}
          />
        </label>
        <FilterSelect name="domain" aria-label="Domain" defaultValue={query.domain ?? ""} className="w-28" selectClassName="pr-7"
          options={[["", "All Domains"], ...DOMAIN_ORDER.map((d) => [d, DOMAIN_LABEL[d]] as const)]} />
        <FilterSelect name="status" aria-label="Status" defaultValue={query.status ?? ""} className="w-28" selectClassName="pr-7"
          options={[["", "All Statuses"], ...STATUS_ORDER.map((s) => [s, STATUS_LABEL[s]] as const)]} />
        <FilterSelect name="type" aria-label="Type" defaultValue={query.type ?? ""} className="w-24" selectClassName="pr-7"
          options={[["", "All Types"], ["policy", "Policies"], ["control", "Controls"]]} />
        <FilterSelect name="eff" aria-label="Effectiveness" defaultValue={query.eff ?? ""} className="w-36" selectClassName="pr-7"
          options={[["", "All Effectiveness"], ["effective", "Effective"], ["partial", "Partially Effective"], ["ineffective", "Ineffective"], ["issues", "Any issue"], ["untested", "Not Tested"], ["na", "Not Applicable"]]} />
        <details className="group relative">
          <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 group-open:border-navy-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters{(query.entity || query.due) && <span className="tabular-nums"> ({[query.entity, query.due].filter(Boolean).length})</span>}
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-72 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <label className="block text-[11.5px] text-slate-500">
              Legal entity
              <select name="entity" defaultValue={query.entity ?? ""} title="Policies with a version scoped to this legal entity" className={cn(INPUT, "mt-1")}>
                <option value="">All Entities</option>
                {entities.map((e) => (
                  <option key={e.legal_entity_id} value={e.legal_entity_id}>{e.trading_name || e.legal_name}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[12px] text-slate-700 dark:text-slate-200">
              <input type="checkbox" name="due" value="overdue" defaultChecked={query.due === "overdue"} className="h-3.5 w-3.5 accent-navy-700" />
              Only records past their review date
            </label>
            <button type="submit" className="inline-flex h-8 items-center rounded-lg bg-navy-900 px-3 text-[12.5px] font-medium text-white hover:bg-navy-800 dark:bg-navy-600">
              Apply filters
            </button>
          </div>
        </details>
      </div>
      {(isFiltered(query)) && (
        <p className="mt-2 text-[12px] text-slate-500">
          {query.due === "overdue" && <span className="mr-2">Showing only records past their review date.</span>}
          <Link href={href({ size: query.size, months: query.months })} scroll={false} className="font-medium text-navy-600 hover:text-navy-800 dark:text-navy-300">
            Clear filters
          </Link>
        </p>
      )}
    </Form>
  );
}

function RowMenu({ row, query }: { row: Row; query: Query }) {
  const open = (pane?: string) => href(query, { id: row.id, pane, drawer: undefined });
  const item = "block rounded-md px-2.5 py-1.5 text-[12px] text-navy-950 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800";
  return (
    <details className="group relative">
      <summary
        aria-label={`Actions for ${row.ref}`}
        className="inline-flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-navy-700 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal className="h-4 w-4" />
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <Link href={open()} scroll={false} className={item}>Open details</Link>
        <Link href={open("requirements")} scroll={false} className={item}>{row.kind === "policy" ? "Versions & rules" : "Test methodology"}</Link>
        <Link href={open("evidence")} scroll={false} className={item}>Evidence</Link>
        <Link href={open("history")} scroll={false} className={item}>History</Link>
        {row.kind === "policy" ? (
          <Link href={href(query, { id: row.id, new: "version" })} scroll={false} className={item}>Draft a new version</Link>
        ) : (
          <Link href={open("evidence")} scroll={false} className={item}>Record a test result</Link>
        )}
      </div>
    </details>
  );
}

/** "Lingaraj (Super Admin)" → "Lingaraj": the role is noise in a narrow column. */
function shortName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, " ").trim();
}

export function RegisterTable({ rows, query, selectedId }: { rows: Row[]; query: Query; selectedId?: string }) {
  const head = ["Policy / Control ID", "Title", "Domain", "Type", "Status", "Effectiveness", "Owner", "Next Review", "Actions"];
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="min-w-full text-[11.5px]">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800">
            <th scope="col" className="w-9 py-3 pl-4">
              <SelectAll form={EXPORT_FORM} />
            </th>
            {head.map((h) => (
              <th key={h} scope="col" className={cn("whitespace-nowrap px-1.5 py-3 text-left text-[11px] font-semibold text-navy-950 dark:text-slate-300", h === "Actions" && "pr-4 text-center")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => {
            const open = href(query, { id: r.id, pane: undefined, drawer: undefined });
            const selected = selectedId === r.id;
            const who = person(r.owner);
            return (
              <tr key={`${r.kind}:${r.id}`} data-selected={selected || undefined}
                className={cn("align-middle transition-colors", selected ? "bg-navy-50/60 dark:bg-navy-500/10" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/30")}>
                <td className="py-2.5 pl-4">
                  <input type="checkbox" name="ids" value={r.id} form={EXPORT_FORM} aria-label={`Select ${r.ref}`}
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-navy-700 dark:border-slate-600" />
                </td>
                <td className="whitespace-nowrap px-1.5 py-2.5">
                  <Link href={open} scroll={false} title={r.id} className="font-medium text-navy-600 hover:text-navy-800 hover:underline dark:text-navy-300">
                    {r.ref}
                  </Link>
                </td>
                <td className="min-w-28 max-w-48 px-1.5 py-2.5">
                  <span className="line-clamp-2 leading-snug text-navy-950 dark:text-slate-100" title={r.title}>{r.title}</span>
                </td>
                <td className="max-w-28 truncate whitespace-nowrap px-1.5 py-2.5 text-slate-600 dark:text-slate-300" title={DOMAIN_LABEL[r.domain]}>{DOMAIN_LABEL[r.domain]}</td>
                <td className="whitespace-nowrap px-1.5 py-2.5 text-slate-600 dark:text-slate-300">{r.kind === "policy" ? "Policy" : "Control"}</td>
                <td className="whitespace-nowrap px-1.5 py-2.5">
                  <Badge tone={STATUS_TONE[r.status]} title={r.statusNote}>{STATUS_LABEL[r.status]}</Badge>
                </td>
                <td className="whitespace-nowrap px-1.5 py-2.5">
                  {r.eff === "na" ? (
                    <span className="text-slate-400" title={r.effNote}>—</span>
                  ) : (
                    <Badge tone={EFF_TONE[r.eff]} title={r.effNote}>{EFF_LABEL[r.eff]}</Badge>
                  )}
                </td>
                <td className="max-w-24 truncate whitespace-nowrap px-1.5 py-2.5 text-slate-600 dark:text-slate-300" title={who.known ? who.name : r.owner}>
                  {who.known ? shortName(who.name) : who.name}
                </td>
                <td className={cn("whitespace-nowrap px-1.5 py-2.5 tabular-nums", r.overdue ? "font-semibold text-rose-700 dark:text-rose-400" : "text-slate-600 dark:text-slate-300")} title={r.nextReviewNote}>
                  {r.nextReview ? formatDate(r.nextReview.slice(0, 10)) : "—"}
                  {r.overdue && <span className="block text-[10px] font-semibold uppercase leading-tight">Overdue</span>}
                </td>
                <td className="pr-4 text-center">
                  <RowMenu row={r} query={query} />
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
 *  "1 2 3 4 5 … 13" on page 1, as in the v2.0 mock. */
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

export function Pager({ query, page, size, total }: { query: Query; page: number; size: number; total: number }) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / size));
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const at = (p: number) => href(query, { page: String(p), id: undefined, pane: undefined });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3.5 text-[12px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <p>
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
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
