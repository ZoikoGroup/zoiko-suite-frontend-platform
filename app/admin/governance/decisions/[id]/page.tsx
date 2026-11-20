// The full record of one governance decision: every stored field, its place
// in the evidence chain, its replays and its follow-ups.

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert } from "lucide-react";
import { Card } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { currentSession } from "@/lib/authz-inbox";
import { formatDateTime } from "@/lib/format";
import { person } from "@/lib/directory";
import { listEntities } from "@/lib/api/tenants";
import { decisionTitle, explainDecisionError } from "@/lib/api/governance";
import { BASE, entityName, href, loadDetail } from "@/components/admin/governance/console/data";
import { PriorityMark, StatusBadge } from "@/components/admin/governance/console/register";
import { FollowUpDialog, ReplayDialog } from "@/components/admin/governance/console/forms";

export const metadata: Metadata = { title: "Governance Decision | Zoiko Suite" };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[12.5px] text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words text-[13px] text-navy-950 dark:text-slate-100">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-2 text-[15px] font-semibold text-navy-950 dark:text-slate-100">{title}</h2>
      {children}
    </Card>
  );
}

const MONO = "font-mono text-[12px]";

export default async function DecisionRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = await currentSession();
  if (!current) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <SignInAgain returnTo={`${BASE}/decisions/${encodeURIComponent(id)}`} />
      </div>
    );
  }
  const identity = current.identity;
  const [detail, entities] = await Promise.all([
    loadDetail(decodeURIComponent(id), identity),
    identity.tenantId ? listEntities(identity.tenantId, identity) : Promise.resolve(null),
  ]);
  const entityMap = new Map((entities && entities.ok ? entities.data : []).map((e) => [e.legal_entity_id, e] as const));
  const d = detail.decision.data;

  const back = (
    <Link href={BASE} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <ArrowLeft className="h-4 w-4" />
      Governance Log
    </Link>
  );

  if (!d) {
    return (
      <div className="space-y-5">
        <PageHeader title="Decision not available" actions={back} />
        <Card className="p-5 text-[13px] text-slate-600 dark:text-slate-300">
          {detail.decision.error ? explainDecisionError(detail.decision.error) : "The decision could not be read."}
        </Card>
      </div>
    );
  }

  const ev = detail.evidence.data;
  const owner = person(d.actor_id);
  return (
    <div className="space-y-5">
      <PageHeader
        title={`${d.display_ref} · ${decisionTitle(d)}`}
        description={d.summary ?? undefined}
        actions={
          <>
            {back}
            {d.action_type === "APPROVAL_THRESHOLD" && <ReplayDialog decision={d} />}
            <FollowUpDialog decision={d} entities={[...entityMap.values()]} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title="Decision">
          <dl className="divide-y divide-slate-100 dark:divide-slate-800">
            <Row label="Status"><StatusBadge decision={d} /> <span className="ml-2 text-slate-500">recorded outcome {d.outcome}</span></Row>
            <Row label="Decision id"><span className={MONO}>{d.decision_id}</span></Row>
            <Row label="Action type">{d.action_type}</Row>
            <Row label="Domain">{d.domain}</Row>
            <Row label="Priority"><PriorityMark priority={d.priority} /></Row>
            <Row label="Legal entity">{entityName(entityMap, d.legal_entity_id)} <span className={`${MONO} text-slate-500`}>({d.legal_entity_id})</span></Row>
            <Row label="Jurisdiction">{d.jurisdiction_context || "—"}</Row>
            <Row label="Decision owner">{owner.known ? `${owner.name} (${d.actor_id})` : d.actor_id}</Row>
            <Row label="Decided">{formatDateTime(d.decided_at)}</Row>
            <Row label="Recorded">{formatDateTime(d.recorded_at)}</Row>
            <Row label="Rule basis"><span className={MONO}>{d.rule_basis}</span></Row>
            <Row label="Policy version">{d.policy_version_id ? <span className={MONO}>{d.policy_version_id}</span> : "—"}</Row>
            <Row label="Reference">{d.action_subject_type ? `${d.action_subject_type} ` : ""}{d.action_subject_id || "—"}</Row>
            <Row label="Related obligation">{d.related_obligation_id || "—"}</Row>
            <Row label="Tags">{d.tags?.length ? d.tags.join(", ") : "—"}</Row>
            <Row label="Correlation">{<span className={MONO}>{d.correlation_id}</span>}</Row>
            <Row label="Workflow instance">{d.workflow_instance_id ? <span className={MONO}>{d.workflow_instance_id}</span> : "—"}</Row>
            <Row label="Follows up">
              {detail.causedBy ? (
                <Link className="text-navy-600 hover:underline dark:text-navy-300" href={`${BASE}/decisions/${encodeURIComponent(detail.causedBy.decision_id)}`}>
                  {detail.causedBy.display_ref} — {decisionTitle(detail.causedBy)}
                </Link>
              ) : (
                d.causation_id || "—"
              )}
            </Row>
          </dl>
        </Section>

        <div className="space-y-5">
          <Section title="Evidence chain">
            {ev ? (
              <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                <Row label="Chain position">#{ev.chain_seq}</Row>
                <Row label="Hash"><span className={`${MONO} break-all`}>{ev.curr_hash}</span></Row>
                <Row label="Previous hash"><span className={`${MONO} break-all`}>{ev.prev_hash}</span></Row>
                <Row label="Record integrity">
                  <span className={ev.hash_valid ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700"}>
                    {ev.hash_valid ? <CheckCircle2 className="mr-1 inline h-4 w-4" /> : <CircleAlert className="mr-1 inline h-4 w-4" />}
                    {ev.hash_valid ? "Re-computes from the stored record" : "Does NOT re-compute — the record was changed"}
                  </span>
                </Row>
                <Row label="Chain link">{ev.prev_link_valid ? "Linked to the previous decision" : "Broken"}</Row>
                <Row label="Sealed">
                  {ev.package ? (
                    <Link className="text-navy-600 hover:underline dark:text-navy-300" href={href({ tab: "evidence", pkg: ev.package.package_id })}>
                      Package #{ev.package.package_seq}, {formatDateTime(ev.package.sealed_at)}
                    </Link>
                  ) : (
                    "Not yet sealed"
                  )}
                </Row>
                <Row label="Events">
                  {ev.events.length
                    ? ev.events.map((e) => (
                        <span key={e.event_type + e.created_at} className="block">
                          {e.event_type} — {e.published_at ? `published ${formatDateTime(e.published_at)}` : `waiting (${e.attempts} attempts)`}
                        </span>
                      ))
                    : "None retained"}
                </Row>
              </dl>
            ) : (
              <p className="text-[13px] text-slate-500">{detail.evidence.error ? explainDecisionError(detail.evidence.error) : "—"}</p>
            )}
          </Section>

          <Section title={`Replays (${detail.replays.data?.length ?? 0})`}>
            {detail.replays.data?.length ? (
              <ul className="space-y-2 text-[13px]">
                {detail.replays.data.map((m) => (
                  <li key={m.replay_manifest_id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <span className={m.outcomes_match ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
                      {m.outcomes_match ? "Reproduced" : "Did not reproduce"}
                    </span>{" "}
                    {m.original_outcome} → {m.replayed_outcome} · {formatDateTime(m.replayed_at)} · {person(m.replayed_by_principal_id).name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-slate-500">Never replayed.</p>
            )}
          </Section>

          <Section title={`Follow-ups (${detail.followUps.data?.total_count ?? 0})`}>
            {detail.followUps.data?.records.length ? (
              <ul className="space-y-2 text-[13px]">
                {detail.followUps.data.records.map((f) => (
                  <li key={f.decision_id}>
                    <Link className="text-navy-600 hover:underline dark:text-navy-300" href={`${BASE}/decisions/${encodeURIComponent(f.decision_id)}`}>
                      {f.display_ref}
                    </Link>{" "}
                    <StatusBadge decision={f} /> {decisionTitle(f)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-slate-500">None.</p>
            )}
          </Section>
        </div>
      </div>

      <Section title="Evaluation context">
        {d.evaluation_context !== undefined && d.evaluation_context !== null ? (
          <pre className="max-h-96 overflow-auto rounded-lg bg-slate-50 p-3 text-[12px] text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            {JSON.stringify(d.evaluation_context, null, 2)}
          </pre>
        ) : (
          <p className="text-[13px] text-slate-500">None recorded.</p>
        )}
      </Section>
    </div>
  );
}
