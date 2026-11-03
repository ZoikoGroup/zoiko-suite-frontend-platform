// How one Authorization register becomes the console's table + drawer.
//
// A register file describes its rows (with a search string and facet values
// for the filters) and how to draw one record's drawer; RegisterView does the
// rest the same way for every tab: search, filter, page, select. The
// registers are small enough to hold in full (the service returns them whole),
// so filtering here costs no round trip and cannot disagree with the counts.

import type { ReactNode } from "react";
import type { ApiError } from "@/lib/api/client";
import type { SessionIdentity } from "@/lib/auth";
import { Badge } from "@/components/ui";
import {
  RegisterBody,
  RegisterPager,
  RegisterTable,
  RegisterToolbar,
  RowLink,
  TwoLine,
  type RegisterColumn,
} from "@/components/admin/console";
import { commandAction } from "@/app/admin/authorization/actions";
import type { ReasonSet } from "@/app/admin/authorization/state";
import { describeAdminStatus } from "@/lib/api/authorization";
import { person } from "@/lib/directory";
import { ActionDialog } from "../kit/ActionDialog";
import { ReadProblem } from "../kit";
import { Field } from "../ui";

export const BASE = "/admin/authorization";
export const PAGE_SIZE = 8;

/** The page's query, as read from the URL. `undefined` drops a key from a link. */
export type Query = Record<string, string | undefined>;

export function href(q: Query): string {
  return hrefAt(BASE, q);
}

/** A link to `base` carrying the query. RegisterView serves any console page through this. */
export function hrefAt(base: string, q: Query): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) sp.set(k, v);
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

export type Ctx = {
  identity: SessionIdentity;
  /** The signed-in principal — the maker who may not also be the checker. */
  me: string;
  /** Read once per request. */
  now: number;
};

export type Row = {
  id: string;
  /** What the ID column shows (a short form, or the record's own code). */
  idLabel: string;
  search: string;
  /** Values the filters match exactly, keyed by filter name. */
  facets: Record<string, string>;
  cells: ReactNode[];
};

export type FilterDef = { name: string; allLabel: string; options: readonly (readonly [string, string])[] };

export type DrawerLinks = { close: string; pane: string; paneHref: (key: string) => string };

export type RegisterSpec = {
  /** Plural, for "Showing 1–8 of 12 grants". */
  noun: string;
  idColumn: string;
  columns: RegisterColumn[];
  rows: Row[];
  filters: FilterDef[];
  searchPlaceholder: string;
  /** When the register holds nothing at all. */
  empty: ReactNode;
  error?: ApiError | null;
  /** "grants" in "You don't have access to grants". */
  what: string;
  note?: string;
  drawer: (id: string, links: DrawerLinks) => ReactNode | null;
  /** The page this register lives on; the Authorization console when unset. */
  base?: string;
};

export function RegisterView({ spec, query }: { spec: RegisterSpec; query: Query }) {
  const base = spec.base ?? BASE;
  const href = (q: Query) => hrefAt(base, q);
  const q = (query.q ?? "").trim();
  const needle = q.toLowerCase();
  const values = Object.fromEntries(spec.filters.map((f) => [f.name, query[f.name] ?? ""]));
  const rows = spec.rows.filter(
    (r) => (!needle || r.search.toLowerCase().includes(needle)) && spec.filters.every((f) => !values[f.name] || r.facets[f.name] === values[f.name]),
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // No ?id selects the first row, as the register opens; ?id= (empty) is a closed drawer.
  const selected = query.id === undefined ? shown[0]?.id : query.id || undefined;

  const filtered = Boolean(q) || Object.values(values).some(Boolean);
  const state: Query = {
    tab: query.tab,
    q: q || undefined,
    ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v || undefined])),
  };
  const at: Query = { ...state, page: page > 1 ? String(page) : undefined };

  const drawer = selected
    ? spec.drawer(selected, {
        close: href({ ...at, id: "" }),
        pane: query.pane ?? "",
        paneHref: (key) => href({ ...at, id: selected, pane: key }),
      })
    : null;

  const unreadable = spec.error && spec.rows.length === 0;

  return (
    <RegisterBody drawer={drawer}>
      <RegisterToolbar
        action={base}
        keep={query.tab ? { tab: query.tab } : {}}
        search={{ name: "q", value: q, placeholder: spec.searchPlaceholder }}
        filters={spec.filters.map((f) => ({ ...f, value: values[f.name] }))}
        clearHref={filtered ? href({ tab: query.tab }) : undefined}
      />
      {unreadable ? (
        <ReadProblem error={spec.error!} what={spec.what} returnTo={href({ tab: query.tab })} />
      ) : (
        <>
          <RegisterTable
            columns={[{ label: spec.idColumn }, ...spec.columns]}
            empty={spec.rows.length === 0 ? spec.empty : "Nothing matches this search and these filters."}
            rows={shown.map((r) => {
              const open = href({ ...at, id: r.id });
              return {
                key: r.id,
                href: open,
                selected: r.id === selected,
                cells: [
                  <RowLink key="id" href={open} title={r.id}>
                    {r.idLabel}
                  </RowLink>,
                  ...r.cells,
                ],
              };
            })}
          />
          <RegisterPager
            page={page}
            pageSize={PAGE_SIZE}
            total={rows.length}
            noun={spec.noun}
            note={spec.note}
            hrefFor={(p) => href({ ...state, page: p > 1 ? String(p) : undefined, id: undefined })}
          />
        </>
      )}
    </RegisterBody>
  );
}

// ── shared cells ─────────────────────────────────────────────────────────────

/** The first eight characters of a UUID: enough to tell rows apart, with the whole ID on hover. */
export function short(id: string | null | undefined): string {
  return (id ?? "").slice(0, 8) || "—";
}

/** A person by name over their role, or over a short ID when the directory does not know them. */
export function PersonCell({ id }: { id: string | null | undefined }) {
  const p = person(id);
  return <TwoLine primary={p.name} secondary={p.title || (p.known ? undefined : short(id))} />;
}

/** A person's name, for a fact or a sentence. */
export function who(id: string | null | undefined): string {
  if (!id) return "—";
  return person(id).name;
}

export function StatusChip({ status }: { status: string | null | undefined }) {
  const s = describeAdminStatus(status);
  return (
    <Badge tone={s.tone} title={status ?? undefined} className="whitespace-nowrap">
      {s.label}
    </Badge>
  );
}

export function Chip({ label, tone }: { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }) {
  return (
    <Badge tone={tone} className="whitespace-nowrap">
      {label}
    </Badge>
  );
}

/** Action codes as quiet monospace chips, collapsing after a few. */
export function ActionChips({ list, max = 2 }: { list: string[] | null | undefined; max?: number }) {
  const all = list ?? [];
  if (all.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1" title={all.join(", ")}>
      {all.slice(0, max).map((a) => (
        <code key={a} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {a}
        </code>
      ))}
      {all.length > max && <span className="text-[11px] text-slate-400">+{all.length - max}</span>}
    </span>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[11.5px]">{children}</span>;
}

/** Facet value for "who decides": the maker never checks their own request. */
export function mine(by: string | null | undefined, about: string | null | undefined, me: string): boolean {
  return by === me || about === me;
}

// ── commands ─────────────────────────────────────────────────────────────────

/**
 * One command on one record (approve, reject, revoke, retire…). Opens the
 * reason dialog the service requires, and its step-up check where one is due;
 * the record's version travels with it so a stale page is refused, not applied.
 */
export function Command({
  command,
  id,
  label,
  title,
  description,
  reasons,
  version,
  tone = "secondary",
  withEndDate = false,
  footnote,
}: {
  command: string;
  id: string;
  label: string;
  title: string;
  description?: string;
  reasons: ReasonSet;
  version?: number;
  tone?: "secondary" | "danger" | "accent" | "approve";
  withEndDate?: boolean;
  footnote?: ReactNode;
}) {
  return (
    <ActionDialog
      label={label}
      tone={tone}
      title={title}
      description={description}
      action={commandAction}
      hidden={{ command, id, expected_version: version }}
      submitLabel={label}
      reasons={reasons}
      footnote={footnote}
    >
      {withEndDate && <Field name="effective_to" label="End at" type="datetime-local" optional hint="Blank = straight away." />}
    </ActionDialog>
  );
}
