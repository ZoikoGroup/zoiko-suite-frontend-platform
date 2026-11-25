// The selected decision, in the register's right-hand drawer: Details,
// Approvals (its cause and its follow-ups), Evidence (its place in the hash
// chain and the package that sealed it), and the Audit Trail of everything
// that has happened to it.

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  CornerDownRight,
  ExternalLink,
  FileText,
  Globe2,
  Hash,
  Layers,
  Link2,
  ScrollText,
  Signal,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { person } from "@/lib/directory";
import type { LegalEntity } from "@/lib/api/tenants";
import { decisionTitle, splitRuleBasis, statusView, type GovernanceDecision } from "@/lib/api/governance";
import { BASE, entityName, href, type DecisionDetail, type Query } from "./data";
import { FollowUpDialog, ReplayDialog } from "./forms";
import { PriorityMark, StatusBadge } from "./register";

/** Label (with its icon) in the first column, the value left-aligned in the
 *  second — the v2.0 mock's drawer list. */
function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-start gap-2 py-[7px]">
      <dt className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
        <span className="shrink-0 text-slate-400">{icon}</span>
        {label}
      </dt>
      <dd className="min-w-0 wrap-break-word text-[12px] font-medium text-navy-950 dark:text-slate-100">{children}</dd>
    </div>
  );
}

const REGIONS = new Intl.DisplayNames(["en"], { type: "region" });

/** "UK" → "United Kingdom", "EU" → "European Union"; anything that is not a
 *  two-letter region ("Global", "US-CA") is shown as recorded. */
function jurisdictionName(code?: string | null): string {
  const c = (code ?? "").trim();
  if (!c) return "—";
  const iso = c.toUpperCase() === "UK" ? "GB" : c.toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return c;
  try {
    const name = REGIONS.of(iso);
    return name && name !== iso ? name : c;
  } catch {
    return c;
  }
}

/** Tag chips cycle through four tints, as in the mock; the tint carries no meaning. */
const TAG_TINTS = [
  "bg-gold-50 text-gold-700 ring-gold-200 dark:bg-gold-500/10 dark:text-gold-300 dark:ring-gold-500/30",
  "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30",
  "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30",
];

/** The drawer's frame: its own card beside the register (v2.0 mock), with
 *  the record's id, status, title and summary above the section tabs. */
function Shell({
  closeHref,
  head,
  panes = [],
  activePane,
  actions,
  children,
}: {
  closeHref: string;
  head?: ReactNode;
  panes?: { key: string; label: string; href: string }[];
  activePane?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label="Decision Details"
      className="flex min-w-0 flex-col self-start rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="text-[13.5px] font-semibold text-navy-950 dark:text-slate-100">Decision Details</h2>
        <Link
          href={closeHref}
          scroll={false}
          aria-label="Close details"
          className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-900 dark:hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </Link>
      </div>
      {head && <div className="px-4 pt-4">{head}</div>}
      {panes.length > 1 && (
        <nav aria-label="Detail sections" className="mt-3 flex gap-4 overflow-x-auto border-b border-slate-100 px-4 scrollbar-thin dark:border-slate-800">
          {panes.map((p) => (
            <Link
              key={p.key}
              href={p.href}
              scroll={false}
              aria-current={p.key === activePane ? "page" : undefined}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 pb-2 pt-1 text-[12px] transition-colors",
                p.key === activePane
                  ? "border-navy-800 font-semibold text-navy-950 dark:border-slate-200 dark:text-slate-100"
                  : "border-transparent font-medium text-slate-500 hover:text-navy-800 dark:text-slate-400",
              )}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      )}
      <div className="flex-1 px-4 py-3">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-4 dark:border-slate-800 *:flex-1">{actions}</div>}
    </aside>
  );
}

function Mono({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="font-mono text-[11px] font-medium text-slate-700 dark:text-slate-300">
      {children}
    </span>
  );
}

function shortHash(h?: string | null) {
  return h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—";
}

function Check({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
      {ok ? yes : no}
    </span>
  );
}

function DecisionLink({ d, query }: { d: GovernanceDecision; query: Query }) {
  return (
    <Link href={href(query, { id: d.decision_id, pane: undefined, drawer: undefined })} scroll={false}
      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:border-navy-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40">
      <span className="min-w-0">
        <span className="block font-mono text-[11.5px] font-semibold text-navy-600 dark:text-navy-300">{d.display_ref}</span>
        <span className="block truncate text-[12px] text-navy-950 dark:text-slate-200">{decisionTitle(d)}</span>
        <span className="block text-[11px] text-slate-500">{formatDateTime(d.decided_at)} · {person(d.actor_id).name}</span>
      </span>
      <StatusBadge decision={d} />
    </Link>
  );
}

type TrailItem = { at: string; title: string; detail?: string; tone?: "ok" | "warn" | "bad" };

function trail(d: GovernanceDecision, detail: DecisionDetail): TrailItem[] {
  const items: TrailItem[] = [
    { at: d.decided_at, title: `Decided: ${statusView(d).label}`, detail: `by ${person(d.actor_id).name} — basis ${d.rule_basis}` },
    { at: d.recorded_at, title: `Recorded in the ledger as ${d.display_ref}`, detail: `chain position #${d.chain_seq}`, tone: "ok" },
  ];
  for (const e of detail.evidence.data?.events ?? []) {
    items.push({ at: e.created_at, title: `Event queued: ${e.event_type}`, detail: e.last_error ? `last error: ${e.last_error}` : undefined, tone: e.last_error ? "warn" : undefined });
    if (e.published_at) items.push({ at: e.published_at, title: `Event published: ${e.event_type}`, detail: `after ${e.attempts} attempt(s)`, tone: "ok" });
  }
  for (const m of detail.replays.data ?? []) {
    items.push({
      at: m.replayed_at,
      title: m.outcomes_match ? "Replayed — outcome reproduced" : "Replayed — outcome DID NOT reproduce",
      detail: `${m.original_outcome} → ${m.replayed_outcome} against policy version ${m.policy_version_id}, by ${person(m.replayed_by_principal_id).name}`,
      tone: m.outcomes_match ? "ok" : "bad",
    });
  }
  for (const f of detail.followUps.data?.records ?? []) {
    items.push({ at: f.recorded_at, title: `Follow-up ${f.display_ref}: ${statusView(f).label}`, detail: decisionTitle(f) });
  }
  const pkg = detail.evidence.data?.package;
  if (pkg) items.push({ at: pkg.sealed_at, title: `Sealed in evidence package #${pkg.package_seq}`, detail: `by ${person(pkg.sealed_by).name}`, tone: "ok" });
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

export function DecisionDrawer({
  detail,
  query,
  entities,
  domains,
}: {
  detail: DecisionDetail;
  query: Query;
  entities: Map<string, LegalEntity>;
  domains: Map<string, string>;
}) {
  // Closing keeps the drawer shut (the page otherwise opens the first row).
  const closeHref = href(query, { id: undefined, pane: undefined, drawer: "closed" });
  const d = detail.decision.data;
  if (!d) {
    return (
      <Shell closeHref={closeHref}>
        <p className="text-[12.5px] text-slate-600 dark:text-slate-300">
          {detail.decision.error?.status === 404
            ? "No decision with this id is visible to your organisation."
            : detail.decision.error?.status === 403
              ? "You do not hold GOVERNANCE_DECISION_READ for this decision's entity."
              : (detail.decision.error?.message ?? "The decision could not be read.")}
        </p>
      </Shell>
    );
  }

  const items = trail(d, detail);
  const pane = ["details", "approvals", "evidence", "audit"].includes(query.pane ?? "") ? query.pane! : "details";
  const panes = [
    { key: "details", label: "Details" },
    { key: "approvals", label: `Approvals${d.follow_up_count ? ` (${d.follow_up_count})` : ""}` },
    { key: "evidence", label: "Evidence" },
    { key: "audit", label: `Audit Trail (${items.length})` },
  ].map((p) => ({ ...p, href: href(query, { id: d.decision_id, drawer: undefined, pane: p.key === "details" ? undefined : p.key }) }));
  const status = statusView(d);
  const owner = person(d.actor_id);
  const basis = splitRuleBasis(d.rule_basis);
  const ev = detail.evidence.data;
  const entityList = [...entities.values()];

  return (
    <Shell
      closeHref={closeHref}
      panes={panes}
      activePane={pane}
      head={
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-semibold tabular-nums text-navy-950 dark:text-slate-100" title={d.decision_id}>
              {d.display_ref}
            </p>
            <Badge tone={status.tone} title={`Recorded outcome: ${d.outcome}`}>
              {status.label}
            </Badge>
          </div>
          <p className="mt-2 text-[14.5px] font-semibold leading-snug text-navy-950 dark:text-slate-100">{decisionTitle(d)}</p>
          {d.summary && <p className="mt-1 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">{d.summary}</p>}
        </>
      }
      actions={
        <>
          <Link href={`${BASE}/decisions/${encodeURIComponent(d.decision_id)}`}
            className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            View Full Record
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <FollowUpDialog decision={d} entities={entityList} />
        </>
      }
    >
      {pane === "details" && (
        <dl>
          <Fact icon={<Layers className="h-3.5 w-3.5" />} label="Domain">{domains.get(d.domain) ?? d.domain}</Fact>
          <Fact icon={<Building2 className="h-3.5 w-3.5" />} label="Entity">{entityName(entities, d.legal_entity_id)}</Fact>
          <Fact icon={<Globe2 className="h-3.5 w-3.5" />} label="Jurisdiction">
            <span title={d.jurisdiction_context ?? undefined}>{jurisdictionName(d.jurisdiction_context)}</span>
          </Fact>
          <Fact icon={<Signal className="h-3.5 w-3.5" />} label="Priority"><PriorityMark priority={d.priority} /></Fact>
          <Fact icon={<CalendarClock className="h-3.5 w-3.5" />} label="Decision Date">{formatDateTime(d.decided_at)}</Fact>
          <Fact icon={<UserRound className="h-3.5 w-3.5" />} label="Decision Owner">
            <span title={d.actor_id}>{owner.known ? owner.name : d.actor_id}</span>
          </Fact>
          <Fact icon={<FileText className="h-3.5 w-3.5" />} label="Related Obligation">
            {d.related_obligation_id ? <span className="text-navy-600 dark:text-navy-300">{d.related_obligation_id}</span> : "—"}
          </Fact>
          <Fact icon={<Link2 className="h-3.5 w-3.5" />} label="Reference">
            {d.action_subject_id ? <span className="text-navy-600 dark:text-navy-300">{d.action_subject_id}</span> : "—"}
          </Fact>
          <Fact icon={<Tag className="h-3.5 w-3.5" />} label="Tags">
            {d.tags?.length ? (
              <span className="flex flex-wrap gap-1">
                {d.tags.map((t, i) => (
                  <span key={t} className={cn("rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ring-1", TAG_TINTS[i % TAG_TINTS.length])}>
                    {t}
                  </span>
                ))}
              </span>
            ) : (
              "—"
            )}
          </Fact>
        </dl>
      )}

      {pane === "approvals" && (
        <div className="space-y-4 pt-1">
          <section>
            <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Follows up</h3>
            {detail.causedBy ? (
              <DecisionLink d={detail.causedBy} query={query} />
            ) : d.causation_id ? (
              <p className="text-[12px] text-slate-500">Caused by <Mono>{d.causation_id}</Mono> (not a decision in this ledger).</p>
            ) : (
              <p className="text-[12px] text-slate-500">An original decision; it follows up nothing.</p>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Follow-ups</h3>
            {detail.followUps.error ? (
              <p className="text-[12px] text-rose-700">Follow-ups could not be read: {detail.followUps.error.message}</p>
            ) : detail.followUps.data?.records.length ? (
              <div className="space-y-2">
                {detail.followUps.data.records.map((f) => (
                  <DecisionLink key={f.decision_id} d={f} query={query} />
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-[12px] text-slate-500">
                <CornerDownRight className="h-3.5 w-3.5" />
                {d.status_category === "PENDING" || d.status_category === "ESCALATED"
                  ? "Still open: no decision has resolved it yet. Record its outcome below."
                  : "No follow-up recorded."}
              </p>
            )}
          </section>
          {d.workflow_instance_id && (
            <p className="text-[12px] text-slate-500">
              Workflow instance <Mono>{d.workflow_instance_id}</Mono>
            </p>
          )}
        </div>
      )}

      {pane === "evidence" && (
        <div className="space-y-3 pt-1">
          {detail.evidence.error ? (
            <p className="text-[12px] text-rose-700">Evidence could not be read: {detail.evidence.error.message}</p>
          ) : ev ? (
            <dl>
              <Fact icon={<ScrollText className="h-3.5 w-3.5" />} label="Outcome">{d.outcome}</Fact>
              <Fact icon={<Hash className="h-3.5 w-3.5" />} label="Rule basis">
                {basis.rule}
                {basis.reference && <span className="block font-mono text-[10.5px] font-medium text-slate-500">{basis.reference}</span>}
              </Fact>
              <Fact icon={<Hash className="h-3.5 w-3.5" />} label="Chain position">#{ev.chain_seq}</Fact>
              <Fact icon={<Hash className="h-3.5 w-3.5" />} label="Hash"><Mono title={ev.curr_hash}>{shortHash(ev.curr_hash)}</Mono></Fact>
              <Fact icon={<Hash className="h-3.5 w-3.5" />} label="Previous hash"><Mono title={ev.prev_hash}>{shortHash(ev.prev_hash)}</Mono></Fact>
              <Fact icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Record integrity">
                <Check ok={ev.hash_valid} yes="Re-computes" no="Does not re-compute" />
              </Fact>
              <Fact icon={<Link2 className="h-3.5 w-3.5" />} label="Chain link">
                <Check ok={ev.prev_link_valid} yes="Linked" no="Broken" />
              </Fact>
              <Fact icon={<Layers className="h-3.5 w-3.5" />} label="Sealed">
                {ev.package ? (
                  <Link href={href({ tab: "evidence", pkg: ev.package.package_id })} className="text-navy-600 hover:underline dark:text-navy-300">
                    Package #{ev.package.package_seq}
                  </Link>
                ) : (
                  "Not yet sealed"
                )}
              </Fact>
              <Fact icon={<ScrollText className="h-3.5 w-3.5" />} label="Policy version">{d.policy_version_id ? <Mono>{d.policy_version_id}</Mono> : "—"}</Fact>
            </dl>
          ) : null}
          {d.action_type === "APPROVAL_THRESHOLD" && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
              <p className="text-[12px] text-slate-600 dark:text-slate-300">Re-run it against the exact policy version it used.</p>
              <ReplayDialog decision={d} />
            </div>
          )}
          {d.evaluation_context !== undefined && d.evaluation_context !== null && (
            <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px] text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              {JSON.stringify(d.evaluation_context, null, 2)}
            </pre>
          )}
        </div>
      )}

      {pane === "audit" && (
        <ol className="relative mt-1 space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
          {items.map((i, n) => (
            <li key={n} className="relative">
              <span
                className={cn(
                  "absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900",
                  i.tone === "ok" ? "bg-emerald-500" : i.tone === "bad" ? "bg-rose-500" : i.tone === "warn" ? "bg-amber-500" : "bg-slate-400",
                )}
              />
              <p className="text-[12px] font-semibold text-navy-950 dark:text-slate-100">{i.title}</p>
              {i.detail && <p className="text-[11.5px] text-slate-500 dark:text-slate-400">{i.detail}</p>}
              <p className="text-[11px] tabular-nums text-slate-400">{formatDateTime(i.at)}</p>
            </li>
          ))}
        </ol>
      )}
    </Shell>
  );
}
