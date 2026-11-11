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
} from "lucide-react";
import { DetailDrawer } from "@/components/admin/console";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { person } from "@/lib/directory";
import type { LegalEntity } from "@/lib/api/tenants";
import { decisionTitle, splitRuleBasis, statusView, type GovernanceDecision } from "@/lib/api/governance";
import { BASE, entityName, href, type DecisionDetail, type Query } from "./data";
import { FollowUpDialog, ReplayDialog } from "./forms";
import { PriorityMark, StatusBadge } from "./register";

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="flex shrink-0 items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
        <span className="text-slate-400">{icon}</span>
        {label}
      </dt>
      <dd className="min-w-0 wrap-break-word text-right text-[12px] font-semibold text-navy-950 dark:text-slate-100">{children}</dd>
    </div>
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
    <Link href={href(query, { id: d.decision_id, pane: undefined })} scroll={false}
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
  const closeHref = href(query, { id: undefined, pane: undefined });
  const d = detail.decision.data;
  if (!d) {
    return (
      <DetailDrawer heading="Decision Details" closeHref={closeHref} icon={ScrollText} title="Not available">
        <p className="text-[12.5px] text-slate-600 dark:text-slate-300">
          {detail.decision.error?.status === 404
            ? "No decision with this id is visible to your organisation."
            : detail.decision.error?.status === 403
              ? "You do not hold GOVERNANCE_DECISION_READ for this decision's entity."
              : (detail.decision.error?.message ?? "The decision could not be read.")}
        </p>
      </DetailDrawer>
    );
  }

  const items = trail(d, detail);
  const pane = ["details", "approvals", "evidence", "audit"].includes(query.pane ?? "") ? query.pane! : "details";
  const panes = [
    { key: "details", label: "Details" },
    { key: "approvals", label: `Approvals${d.follow_up_count ? ` (${d.follow_up_count})` : ""}` },
    { key: "evidence", label: "Evidence" },
    { key: "audit", label: `Audit Trail (${items.length})` },
  ].map((p) => ({ ...p, href: href(query, { pane: p.key === "details" ? undefined : p.key }) }));
  const status = statusView(d);
  const owner = person(d.actor_id);
  const basis = splitRuleBasis(d.rule_basis);
  const ev = detail.evidence.data;
  const entityList = [...entities.values()];

  return (
    <DetailDrawer
      heading="Decision Details"
      closeHref={closeHref}
      icon={ScrollText}
      title={<span className="font-mono">{d.display_ref}</span>}
      status={{ label: status.label, tone: status.tone }}
      panes={panes}
      activePane={pane}
      actions={
        <>
          <Link href={`${BASE}/decisions/${encodeURIComponent(d.decision_id)}`}
            className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            View Full Record
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <FollowUpDialog decision={d} entities={entityList} />
        </>
      }
    >
      <div className="-mt-1 mb-2">
        <p className="text-[14px] font-semibold text-navy-950 dark:text-slate-100">{decisionTitle(d)}</p>
        {d.summary && <p className="mt-1 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">{d.summary}</p>}
      </div>

      {pane === "details" && (
        <dl className="divide-y divide-slate-100 dark:divide-slate-800">
          <Fact icon={<Layers className="h-3.5 w-3.5" />} label="Domain">{domains.get(d.domain) ?? d.domain}</Fact>
          <Fact icon={<Building2 className="h-3.5 w-3.5" />} label="Entity">{entityName(entities, d.legal_entity_id)}</Fact>
          <Fact icon={<Globe2 className="h-3.5 w-3.5" />} label="Jurisdiction">{d.jurisdiction_context || "—"}</Fact>
          <Fact icon={<Signal className="h-3.5 w-3.5" />} label="Priority"><PriorityMark priority={d.priority} /></Fact>
          <Fact icon={<CalendarClock className="h-3.5 w-3.5" />} label="Decision Date">{formatDateTime(d.decided_at)}</Fact>
          <Fact icon={<UserRound className="h-3.5 w-3.5" />} label="Decision Owner">
            <span title={d.actor_id}>{owner.known ? owner.name : d.actor_id}</span>
          </Fact>
          <Fact icon={<FileText className="h-3.5 w-3.5" />} label="Related Obligation">{d.related_obligation_id || "—"}</Fact>
          <Fact icon={<Link2 className="h-3.5 w-3.5" />} label="Reference">{d.action_subject_id || "—"}</Fact>
          <Fact icon={<ScrollText className="h-3.5 w-3.5" />} label="Outcome">{d.outcome}</Fact>
          <Fact icon={<Hash className="h-3.5 w-3.5" />} label="Rule basis">
            {basis.rule}
            {basis.reference && <span className="block font-mono text-[10.5px] font-medium text-slate-500">{basis.reference}</span>}
          </Fact>
          <Fact icon={<Tag className="h-3.5 w-3.5" />} label="Tags">
            {d.tags?.length ? (
              <span className="flex flex-wrap justify-end gap-1">
                {d.tags.map((t) => (
                  <span key={t} className="rounded-md bg-gold-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-gold-700 ring-1 ring-gold-200 dark:bg-gold-500/10 dark:text-gold-300 dark:ring-gold-500/30">
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
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
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
    </DetailDrawer>
  );
}
