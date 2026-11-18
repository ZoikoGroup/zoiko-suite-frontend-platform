// The open record, in the register's right-hand drawer (v2.0 mock): its id,
// status, title and summary, then Overview, Requirements, Evidence and
// History. A policy and a control share the frame; what fills each section
// is what policy-svc holds for that kind of record.

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Building2,
  CalendarClock,
  FileText,
  Gauge,
  Globe2,
  Layers,
  Link2,
  Repeat,
  ShieldCheck,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import { person } from "@/lib/directory";
import type { LegalEntity } from "@/lib/api/tenants";
import * as P from "@/lib/api/policies";
import { DOMAIN_LABEL, EFF_LABEL, EFF_TONE, STATUS_LABEL, STATUS_TONE, cadenceOf, effOfResult, type Model, type Row } from "./model";
import { BASE, compareOf, entityName, href, type ControlDetail, type PolicyDetail, type Query } from "./data";
import { RecordExecutionForm } from "./forms";
import {
  AccountingVersionCommands,
  AttestationForm,
  RedeliverForm,
  RetireFamilyForm,
  RevokeAttestationForm,
  RunSuiteForm,
  TestCaseForm,
  VersionCommands,
  WaiverApproveForm,
  WaiverRequestForm,
} from "./commands";

/** Label (with its icon) in the first column, the value in the second — the mock's drawer list. */
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

const TAG_TINTS = [
  "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30",
  "bg-gold-50 text-gold-700 ring-gold-200 dark:bg-gold-500/10 dark:text-gold-300 dark:ring-gold-500/30",
  "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30",
  "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
];

function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return <>—</>;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t, i) => (
        <span key={t} className={cn("rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ring-1", TAG_TINTS[i % TAG_TINTS.length])}>
          {t}
        </span>
      ))}
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-2">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-[12px] text-slate-500 dark:text-slate-400">{children}</p>;
}

function Failed({ what, error }: { what: string; error: { message: string; status?: number } | null }) {
  return (
    <p className="text-[12px] text-rose-700 dark:text-rose-400">
      {what} could not be read{error ? `: ${P.explainPolicyError(error.message, { status: error.status })}` : "."}
    </p>
  );
}

/** Version statuses of the GOV-05 lifecycle, as chips. */
const VERSION_CHIP: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  DRAFT: { label: "Draft", tone: "info" },
  REVIEW: { label: "In review", tone: "warning" },
  APPROVED: { label: "Approved", tone: "warning" },
  SCHEDULED: { label: "Scheduled", tone: "warning" },
  ACTIVE: { label: "In force", tone: "success" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
  SUPERSEDED: { label: "Superseded", tone: "neutral" },
  RETIRED: { label: "Retired", tone: "neutral" },
};

function VersionChip({ status }: { status: string }) {
  const c = VERSION_CHIP[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={c.tone}>{c.label}</Badge>;
}

/** Which service decides a policy type at runtime (policy-svc's catalogue, GET /v1/policy-types). */
const DECIDED_BY: Record<string, string> = {
  APPROVAL_THRESHOLD: "policy-svc (evaluated here)",
  SIGNATORY_MATRIX: "policy-svc (resolved here)",
  ACCOUNTING_POLICY: "policy-svc (resolved here)",
  SPEND_CONTROL: "spend-controls-svc",
  SOD_RULE: "authorization-svc",
  LEGAL_BASIS: "privacy-decision-svc",
};

function scopeOf(versions: P.PolicyVersion[]): string {
  if (!versions.length) return "—";
  const kinds = new Set(versions.map((v) => (v.legal_entity_id ? "Entity" : v.tenant_id ? "Organisation" : "Global")));
  return [...kinds].join(", ");
}

function Shell({
  closeHref,
  head,
  panes,
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
      aria-label="Policy / Control Details"
      className="flex min-w-0 flex-col self-start rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="text-[13.5px] font-semibold text-navy-950 dark:text-slate-100">Policy / Control Details</h2>
        <Link href={closeHref} scroll={false} aria-label="Close details" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-navy-900 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </Link>
      </div>
      {head && <div className="px-4 pt-4">{head}</div>}
      {panes && panes.length > 1 && (
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

const OUTLINE =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
const GOLD =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-gold-500 px-3 text-[13px] font-medium text-white shadow-sm shadow-gold-600/20 hover:bg-gold-600";

export const PANES = ["overview", "requirements", "evidence", "history"] as const;

export function paneOf(q: Query): (typeof PANES)[number] {
  return (PANES as readonly string[]).includes(q.pane ?? "") ? (q.pane as (typeof PANES)[number]) : "overview";
}

export function MissingDrawer({ query }: { query: Query }) {
  return (
    <Shell closeHref={href(query, { id: undefined, pane: undefined, drawer: "closed" })}>
      <Muted>No policy or control with this id is visible to your organisation.</Muted>
    </Shell>
  );
}

export function RecordDrawer({
  row,
  model,
  query,
  entities,
  policyDetail,
  controlDetail,
  viewer,
  asOf,
}: {
  row: Row;
  model: Model;
  query: Query;
  entities: Map<string, LegalEntity>;
  policyDetail?: PolicyDetail;
  controlDetail?: ControlDetail;
  /** The signed-in principal: names the maker–checker hints, decides nothing. */
  viewer: string;
  /** When the page's reads were made (ms): every "now" in the drawer is this one. */
  asOf: number;
}) {
  const pane = paneOf(query);
  const at = (p: string) => href(query, { id: row.id, drawer: undefined, pane: p === "overview" ? undefined : p });
  const panes = [
    { key: "overview", label: "Overview" },
    { key: "requirements", label: "Requirements" },
    { key: "evidence", label: "Evidence" },
    { key: "history", label: "History" },
  ].map((p) => ({ ...p, href: at(p.key) }));
  const owner = person(row.owner);
  const p = row.policy;
  const c = row.control;

  const description = p ? P.describePolicyType(p.policy_type).meaning : c?.methodology;
  const relatedControls = p ? model.controls.filter((r) => r.control?.control_ref === p.policy_code) : [];
  const relatedPolicy = c ? model.policies.find((r) => r.ref === c.control_ref) : undefined;
  const inForce = (row.versions ?? []).find((v) => v.version_status === "ACTIVE");
  const cadence = c ? cadenceOf(c.test_frequency) : null;

  return (
    <Shell
      closeHref={href(query, { id: undefined, pane: undefined, drawer: "closed" })}
      panes={panes}
      activePane={pane}
      head={
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[13.5px] font-semibold text-navy-950 dark:text-slate-100" title={row.id}>
              {row.ref}
            </p>
            <Badge tone={STATUS_TONE[row.status]} title={row.statusNote}>{STATUS_LABEL[row.status]}</Badge>
          </div>
          <p className="mt-2 text-[14.5px] font-semibold leading-snug text-navy-950 dark:text-slate-100">{row.title}</p>
          {description && <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>}
        </>
      }
      actions={
        p ? (
          <>
            <Link href={at("history")} scroll={false} className={OUTLINE}>Version History</Link>
            <Link href={href(query, { id: row.id, new: "version" })} scroll={false} className={GOLD}>Draft New Version</Link>
          </>
        ) : (
          <>
            <Link href={at("history")} scroll={false} className={OUTLINE}>Test History</Link>
            <Link href={`${at("evidence")}#record-result`} scroll={false} className={GOLD}>Record Result</Link>
          </>
        )
      }
    >
      {pane === "overview" && (
        <dl>
          <Fact icon={<Layers className="h-3.5 w-3.5" />} label="Domain">{DOMAIN_LABEL[row.domain]}</Fact>
          <Fact icon={<FileText className="h-3.5 w-3.5" />} label="Type">
            {p ? `Policy · ${P.policyTypeLabel(p.policy_type)}` : `Control · ${c?.control_ref}`}
          </Fact>
          <Fact icon={<UserRound className="h-3.5 w-3.5" />} label="Owner">
            <span title={row.owner}>{owner.known ? owner.name : row.owner}</span>
          </Fact>
          <Fact icon={<Repeat className="h-3.5 w-3.5" />} label="Review Frequency">
            {p ? <span className="text-slate-500">No cadence recorded · on version end</span> : cadence?.label ?? (c?.test_frequency || "—")}
          </Fact>
          <Fact icon={<CalendarClock className="h-3.5 w-3.5" />} label="Next Review">
            <span className={cn(row.overdue && "text-rose-700 dark:text-rose-400")} title={row.nextReviewNote}>
              {row.nextReview ? formatDate(row.nextReview.slice(0, 10)) : "—"}
              {row.overdue && " · overdue"}
            </span>
          </Fact>
          <Fact icon={<Gauge className="h-3.5 w-3.5" />} label="Effectiveness">
            {row.eff === "na" ? <span className="text-slate-500">Not tested (policies are enforced)</span> : <Badge tone={EFF_TONE[row.eff]} title={row.effNote}>{EFF_LABEL[row.eff]}</Badge>}
          </Fact>
          {p && (
            <Fact icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Decided by">{DECIDED_BY[p.policy_type] ?? "—"}</Fact>
          )}
          <Fact icon={<Link2 className="h-3.5 w-3.5" />} label={p ? "Related Controls" : "Related Policy"}>
            {p ? (
              relatedControls.length ? (
                <span className="flex flex-col">
                  {relatedControls.map((r) => (
                    <Link key={r.id} href={href(query, { id: r.id, pane: undefined })} scroll={false} className="text-navy-600 hover:underline dark:text-navy-300">
                      {r.ref} {r.title}
                    </Link>
                  ))}
                </span>
              ) : (
                <span className="text-slate-500">None (no control references {p.policy_code})</span>
              )
            ) : relatedPolicy ? (
              <Link href={href(query, { id: relatedPolicy.id, pane: undefined })} scroll={false} className="text-navy-600 hover:underline dark:text-navy-300">
                {relatedPolicy.ref} {relatedPolicy.title}
              </Link>
            ) : (
              <span className="text-slate-500">—</span>
            )}
          </Fact>
          <Fact icon={<Globe2 className="h-3.5 w-3.5" />} label="Scope">{p ? scopeOf(row.versions ?? []) : "Organisation"}</Fact>
          <Fact icon={<Building2 className="h-3.5 w-3.5" />} label="Entities">
            {row.entities.length ? row.entities.map((e) => entityName(entities, e)).join(", ") : "All entities"}
          </Fact>
          <Fact icon={<Tag className="h-3.5 w-3.5" />} label="Tags">
            <Tags
              tags={
                p
                  ? [p.policy_type, p.versioning_mode, inForce?.version_number ? `v${inForce.version_number} in force` : ""].filter(Boolean)
                  : [c?.design_status ?? "", c?.test_frequency ?? ""].filter(Boolean)
              }
            />
          </Fact>
        </dl>
      )}

      {pane === "requirements" && p && (
        <PolicyRequirements family={p} versions={row.versions ?? []} entities={entities} detail={policyDetail} viewer={viewer} asOf={asOf} />
      )}
      {pane === "requirements" && c && (
        <dl>
          <Fact icon={<Link2 className="h-3.5 w-3.5" />} label="Control ref">{c.control_ref}</Fact>
          <Fact icon={<FileText className="h-3.5 w-3.5" />} label="Methodology">{c.methodology}</Fact>
          <Fact icon={<Layers className="h-3.5 w-3.5" />} label="Sample approach">{c.sample_approach || "—"}</Fact>
          <Fact icon={<Repeat className="h-3.5 w-3.5" />} label="Frequency">{c.test_frequency || "—"}</Fact>
          <Fact icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Design status">{c.design_status}</Fact>
          <Fact icon={<CalendarClock className="h-3.5 w-3.5" />} label="Defined">{formatDateTime(c.created_at)}</Fact>
        </dl>
      )}

      {pane === "evidence" && p && policyDetail && <PolicyEvidence detail={policyDetail} subjectRef={p.policy_code} today={dayOf(asOf)} />}
      {pane === "evidence" && c && controlDetail && <ControlEvidence row={row} detail={controlDetail} today={dayOf(asOf)} />}

      {pane === "history" && p && policyDetail && <PolicyHistory row={row} detail={policyDetail} query={query} />}
      {pane === "history" && c && <ControlHistory row={row} />}
    </Shell>
  );
}

/** YYYY-MM-DD of a read time, for form defaults. */
function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** PDC-05 certification states, as chips. */
const CERT_CHIP: Record<P.Certification["status"], { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  CERTIFIED: { label: "Certified", tone: "success" },
  WAIVED: { label: "Certified (waived)", tone: "success" },
  FAILED: { label: "Tests failing", tone: "danger" },
  NOT_RUN: { label: "Not tested", tone: "warning" },
  STALE: { label: "Re-test needed", tone: "warning" },
  EXEMPT_NO_EVALUATOR: { label: "Exempt", tone: "neutral" },
};

function Certification({
  version,
  cert,
  testCases,
  defaultExpiry,
}: {
  version: P.PolicyVersion;
  cert?: PolicyDetail["certification"] extends Map<string, infer V> ? V : never;
  testCases: P.TestCase[];
  defaultExpiry: string;
}) {
  if (!cert) return null;
  const { state, waivers } = cert;
  const failed = new Set(state.data?.unwaived_failed_test_case_ids ?? []);
  const failing = testCases.filter((t) => failed.has(t.test_case_id));
  const pending = (waivers.data ?? []).filter((w) => w.waiver_status === "REQUESTED");
  return (
    <div className="mt-2 space-y-2 rounded-md bg-slate-50 p-2 dark:bg-slate-800/40">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Certification</span>
        {state.error ? (
          <span className="text-[11px] text-rose-700 dark:text-rose-400">could not be read</span>
        ) : state.data ? (
          <span data-testid={`v${version.version_number}-cert`}>
            <Badge tone={CERT_CHIP[state.data.status]?.tone ?? "neutral"} title={state.data.reason}>
              {CERT_CHIP[state.data.status]?.label ?? state.data.status}
            </Badge>
          </span>
        ) : null}
      </div>
      {state.data?.reason && <p className="text-[11px] text-slate-500 dark:text-slate-400">{state.data.reason}</p>}
      <RunSuiteForm versionId={version.policy_version_id} versionNumber={version.version_number} />
      {failing.map((t) => (
        <WaiverRequestForm key={t.test_case_id} versionId={version.policy_version_id} testCaseId={t.test_case_id} testCode={t.test_code} defaultExpiry={defaultExpiry} />
      ))}
      {pending.map((w) => (
        <div key={w.waiver_id} className="rounded border border-amber-200 p-2 text-[11.5px] dark:border-amber-500/30">
          <p className="text-amber-800 dark:text-amber-300">
            Waiver requested by {person(w.requested_by_principal_id).name} until {formatDate(w.expires_at.slice(0, 10))}: {w.justification}
          </p>
          <WaiverApproveForm waiverId={w.waiver_id} />
        </div>
      ))}
    </div>
  );
}

function PolicyRequirements({
  family,
  versions,
  entities,
  detail,
  viewer,
  asOf,
}: {
  family: P.PolicyFamily;
  versions: P.PolicyVersion[];
  entities: Map<string, LegalEntity>;
  detail?: PolicyDetail;
  viewer: string;
  asOf: number;
}) {
  const certifiable = P.CERTIFIED_POLICY_TYPES.includes(family.policy_type);
  const accounting = family.policy_type === P.ACCOUNTING_POLICY_TYPE;
  const testCases = (detail?.testCases.data ?? []).filter((t) => t.test_status === "ACTIVE");
  const sorted = [...versions].sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0) || b.created_at.localeCompare(a.created_at));
  const live = versions.some((v) => v.version_status === "ACTIVE" || v.version_status === "SCHEDULED");
  return (
    <div className="space-y-3 pt-1">
      {!sorted.length && <Muted>No version has been drafted. A policy sets no rule until a version is drafted, approved and activated.</Muted>}
      <ul className="space-y-2">
        {sorted.map((v) => {
          const threshold = P.formatThreshold(v.rule_payload);
          return (
            <li key={v.policy_version_id} data-testid={`version-${v.version_number}`} className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12.5px] font-semibold text-navy-950 dark:text-slate-100" title={v.policy_version_id}>
                  Version {v.version_number ?? "—"}
                </p>
                <span data-testid={`version-${v.version_number}-status`}>
                  <VersionChip status={v.version_status} />
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-slate-500 dark:text-slate-400">
                {formatDate(v.effective_from)} – {v.effective_to ? formatDate(v.effective_to) : "open-ended"} ·{" "}
                {v.legal_entity_id ? entityName(entities, v.legal_entity_id) : P.describeScope(v)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Drafted by {person(v.created_by_principal_id).name}
                {v.approved_by_principal_id && ` · approved by ${person(v.approved_by_principal_id).name}`}
                {v.activated_by_principal_id && ` · activated by ${person(v.activated_by_principal_id).name}`}
              </p>
              {threshold && <p className="mt-1 text-[12px] text-navy-950 dark:text-slate-200">Approval needed above {threshold}</p>}
              {v.rationale && <p className="mt-1 text-[11.5px] text-slate-600 dark:text-slate-300">{v.rationale}</p>}
              <details className="mt-1">
                <summary className="cursor-pointer text-[11px] font-medium text-navy-600 dark:text-navy-300">Rule payload</summary>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[10.5px] text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                  {JSON.stringify(v.rule_payload, null, 2)}
                </pre>
              </details>
              {certifiable && detail && (
                <Certification
                  version={v}
                  cert={detail.certification.get(v.policy_version_id)}
                  testCases={testCases}
                  defaultExpiry={dayOf(asOf + 30 * 86_400_000)}
                />
              )}
              {accounting ? (
                <AccountingVersion v={v} read={detail?.accounting.get(v.policy_version_id)} versions={versions} viewer={viewer} />
              ) : (
                <VersionCommands
                  viewer={viewer}
                  certifiable={certifiable}
                  v={{
                    policyId: v.policy_id,
                    versionId: v.policy_version_id,
                    versionNumber: v.version_number,
                    status: v.version_status,
                    rowVersion: v.row_version ?? 1,
                    effectiveFrom: v.effective_from,
                    author: v.created_by_principal_id,
                    suspender: v.suspended_by_principal_id,
                    future: new Date(v.effective_from).getTime() > asOf,
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>

      {certifiable && (
        <Section title={`Test suite (${testCases.length})`}>
          {detail?.testCases.error ? (
            <Failed what="The test suite" error={detail.testCases.error} />
          ) : !testCases.length ? (
            <Muted>No test case yet. A version of this type is certified against the suite before it can go into force.</Muted>
          ) : (
            <ul className="mb-2 space-y-1">
              {testCases.map((t) => (
                <li key={t.test_case_id} className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1.5 text-[11.5px] dark:border-slate-700">
                  <span className="min-w-0">
                    <span className="font-mono font-semibold text-navy-950 dark:text-slate-100">{t.test_code}</span>{" "}
                    <span className="text-slate-500">{t.description}</span>
                  </span>
                  <span className="shrink-0 text-slate-500">
                    {JSON.stringify(t.action_context)} → {t.expected_result}
                    {t.mandatory ? "" : " · optional"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <TestCaseForm policyId={family.policy_id} />
        </Section>
      )}

      {!family.retired_at && !live && !accounting && (
        <Section title="Retire this policy">
          <RetireFamilyForm policyId={family.policy_id} />
        </Section>
      )}
    </div>
  );
}

/**
 * One REF-07 accounting version: what it applies to and rests on, its impact
 * analysis and pinned rules, what activating it would touch, and the commands
 * its status allows.
 */
function AccountingVersion({
  v,
  read,
  versions,
  viewer,
}: {
  v: P.PolicyVersion;
  read?: { version: { data: P.AccountingPolicyVersion | null; error: { message: string; status?: number } | null }; impact: { data: P.AccountingImpact | null; error: { message: string; status?: number } | null } | null };
  versions: P.PolicyVersion[];
  viewer: string;
}) {
  if (!read) return <Muted>The accounting record of this version was not read (only the latest ten versions are).</Muted>;
  if (read.version.error || !read.version.data) return <Failed what="The accounting record of this version" error={read.version.error} />;
  const a = read.version.data;
  const impact = read.impact?.data ?? null;
  const replaced = impact?.would_supersede;
  const replacedNumber = replaced ? versions.find((x) => x.policy_version_id === replaced.policy_version_id)?.version_number : undefined;
  const label = (r: P.ImpactVersionRef) => {
    const n = versions.find((x) => x.policy_version_id === r.policy_version_id)?.version_number;
    return `${n ? `v${n}` : r.policy_version_id.slice(0, 8)} (${r.semantic_version})`;
  };
  return (
    <div className="mt-2 space-y-2" data-testid={`accounting-${v.version_number}`}>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
        <dt className="text-slate-500">Domain · framework</dt>
        <dd className="text-navy-950 dark:text-slate-200">{a.applicability.policy_domain} · {a.applicability.framework}</dd>
        <dt className="text-slate-500">Version · precedence</dt>
        <dd className="text-navy-950 dark:text-slate-200">{a.details.semantic_version} · {a.details.precedence}</dd>
        <dt className="text-slate-500">Framework source</dt>
        <dd className="text-navy-950 dark:text-slate-200">{a.details.framework_source}</dd>
        <dt className="text-slate-500">Policy text</dt>
        <dd className="break-all text-navy-950 dark:text-slate-200">{a.details.policy_text_ref}</dd>
        <dt className="text-slate-500">Impact</dt>
        <dd className="text-navy-950 dark:text-slate-200">
          {a.details.impact_analysis.summary} ({a.details.impact_analysis.affected_periods === "OPEN_PERIODS" ? "open periods too" : "future periods only"})
        </dd>
      </dl>
      {a.rule_mappings.length > 0 && (
        <ul className="space-y-1" aria-label="Rule mappings">
          {a.rule_mappings.map((m) => (
            <li key={`${m.ref_kind}|${m.ref}`} className="rounded border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700">
              <span className="font-mono font-semibold text-navy-950 dark:text-slate-100">{m.ref_kind} {m.ref}@{m.ref_version}</span>
              {m.maps_to && <span className="text-slate-500"> → {m.maps_to}</span>} <span className="text-slate-500">· {m.rationale}</span>
            </li>
          ))}
        </ul>
      )}
      {read.impact?.error && <Failed what="What activating it would touch" error={read.impact.error} />}
      {impact && (
        <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11.5px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300" data-testid={`accounting-${v.version_number}-impact`}>
          {replaced ? <p>Activating it replaces {label(replaced)}, which governs this scope now.</p> : <p>Nothing governs this scope now: it would be the first.</p>}
          {impact.retroactive && <p>It takes effect in the past, so open periods are recalculated under it.</p>}
          {impact.ambiguous_with.length > 0 && <p>Tied with {impact.ambiguous_with.map(label).join(", ")} at the same precedence: resolution would be CONFLICTED.</p>}
          {impact.depended_on_by.length > 0 && <p>Pinned by {impact.depended_on_by.map(label).join(", ")}.</p>}
          {impact.activation_blockers.length > 0 && <p className="text-amber-700 dark:text-amber-300">Activation is refused today: {impact.activation_blockers.join("; ")}.</p>}
        </div>
      )}
      <AccountingVersionCommands
        viewer={viewer}
        v={{
          versionId: v.policy_version_id,
          versionNumber: v.version_number,
          status: v.version_status,
          rowVersion: a.row_version ?? v.row_version ?? 1,
          author: v.created_by_principal_id,
          suspender: v.suspended_by_principal_id,
          supersedes: replaced ? { id: replaced.policy_version_id, label: replacedNumber ? `v${replacedNumber}` : label(replaced) } : undefined,
        }}
      />
    </div>
  );
}

function Attestations({ read }: { read: { data: P.Attestation[] | null; error: { message: string; status?: number } | null } }) {
  if (read.error) return <Failed what="Attestations" error={read.error} />;
  if (!read.data?.length) return <Muted>No attestation names this record as its subject.</Muted>;
  return (
    <ul className="space-y-1.5">
      {read.data.map((a) => (
        <li key={a.attestation_id} className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] dark:border-slate-700">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-navy-950 dark:text-slate-100">{a.statement_version}</span>
            <Badge tone={a.attestation_status === "ACTIVE" ? "success" : a.attestation_status === "REVOKED" ? "danger" : "warning"}>{a.attestation_status}</Badge>
          </div>
          <p className="mt-0.5 line-clamp-2 text-slate-600 dark:text-slate-300">{a.statement}</p>
          <p className="text-[11px] text-slate-500">
            {person(a.signer_principal_id).name} ({a.signer_role}) · {formatDate(a.signed_at)}
          </p>
          {a.revocation_reason && <p className="text-[11px] text-rose-700 dark:text-rose-400">Revoked: {a.revocation_reason}</p>}
          {(a.attestation_status === "ACTIVE" || a.attestation_status === "CHALLENGED") && (
            <div className="mt-1.5">
              <RevokeAttestationForm attestationId={a.attestation_id} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function PolicyEvidence({ detail, subjectRef, today }: { detail: PolicyDetail; subjectRef: string; today: string }) {
  const ev = detail.evaluations;
  return (
    <div className="space-y-3">
      <Section title="Evaluations">
        {ev.error ? (
          <Failed what="Evaluations" error={ev.error} />
        ) : !ev.data?.length ? (
          <Muted>No action has been evaluated against this policy yet.</Muted>
        ) : (
          <ul className="space-y-1.5">
            {ev.data.slice(0, 8).map((e) => (
              <li key={e.evidence_id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[12px] dark:border-slate-700">
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[11px] text-slate-600 dark:text-slate-300" title={e.decision_id}>{e.decision_id}</span>
                  <span className="block text-[11px] text-slate-500">
                    {formatDateTime(e.evaluated_at)} · ledger {e.ledger_status?.toLowerCase() || "—"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={e.result === "WITHIN_THRESHOLD" ? "success" : e.result === "APPROVAL_REQUIRED" ? "warning" : "neutral"}>
                    {e.result === "WITHIN_THRESHOLD" ? "Within" : e.result === "APPROVAL_REQUIRED" ? "Approval" : e.result}
                  </Badge>
                  {e.ledger_status === "FAILED" && <RedeliverForm evidenceId={e.evidence_id} />}
                </span>
              </li>
            ))}
            {ev.data.length > 8 && <Muted>and {ev.data.length - 8} more in the latest 200 evaluations of this type.</Muted>}
          </ul>
        )}
      </Section>
      <Section title="Attestations">
        <Attestations read={detail.attestations} />
        <div className="mt-2">
          <AttestationForm subjectRef={subjectRef} today={today} />
        </div>
      </Section>
    </div>
  );
}

function ControlEvidence({ row, detail, today }: { row: Row; detail: ControlDetail; today: string }) {
  const e = detail.effectiveness.data;
  const executions = row.executions ?? [];
  return (
    <div className="space-y-3">
      <Section title="Effectiveness (policy-svc)">
        {detail.effectiveness.error ? (
          <Failed what="Effectiveness" error={detail.effectiveness.error} />
        ) : e ? (
          <dl>
            <Fact icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Design status">{e.design_status}</Fact>
            <Fact icon={<Gauge className="h-3.5 w-3.5" />} label="Operating">
              {e.operating_effectiveness === "NO_EXECUTIONS_RECORDED" ? (
                <span className="text-slate-500">No test recorded</span>
              ) : (
                <Badge tone={EFF_TONE[effOfResult(e.operating_effectiveness)]} title={e.operating_effectiveness}>{EFF_LABEL[effOfResult(e.operating_effectiveness)]}</Badge>
              )}
            </Fact>
            {e.as_of && <Fact icon={<CalendarClock className="h-3.5 w-3.5" />} label="As of">{formatDateTime(e.as_of)}</Fact>}
          </dl>
        ) : null}
      </Section>
      <Section title={`Test results (${executions.length})`}>
        {!executions.length ? (
          <Muted>No test has been run against this control yet.</Muted>
        ) : (
          <ul className="space-y-1.5">
            {executions.slice(0, 6).map((x) => (
              <li key={x.control_test_execution_id} className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-navy-950 dark:text-slate-100">
                    {formatDate(x.period_start.slice(0, 10))} – {formatDate(x.period_end.slice(0, 10))}
                  </span>
                  <Badge tone={EFF_TONE[effOfResult(x.result)]} title={x.result}>{EFF_LABEL[effOfResult(x.result)]}</Badge>
                </div>
                <p className="text-[11px] text-slate-500">
                  Tested by {person(x.tester_principal_id).name}
                  {x.reviewer_principal_id ? ` · reviewed by ${person(x.reviewer_principal_id).name}` : " · awaiting review"}
                </p>
                {x.exceptions_noted && <p className="mt-0.5 text-[11.5px] text-amber-700 dark:text-amber-400">{x.exceptions_noted}</p>}
                {x.evidence_refs?.length > 0 && <p className="mt-0.5 truncate font-mono text-[10.5px] text-slate-500">{x.evidence_refs.join(", ")}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Record a test result">
        <div id="record-result">
          <RecordExecutionForm definitionId={row.id} />
        </div>
      </Section>
      <Section title="Attestations">
        <Attestations read={detail.attestations} />
        <div className="mt-2">
          <AttestationForm subjectRef={row.control?.control_ref ?? row.ref} today={today} />
        </div>
      </Section>
    </div>
  );
}

type Event = { at: string; title: string; detail?: string; tone?: "ok" | "warn" | "bad" };

function show(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  return typeof v === "string" ? v : JSON.stringify(v);
}

/**
 * GOV-05 ComparePolicyVersions: a plain GET form (?cb, ?ct), rendered on the
 * server. Field changes (dates, scope, status) and payload changes (the rule).
 */
function Compare({ row, detail, query }: { row: Row; detail: PolicyDetail; query: Query }) {
  const versions = [...(row.versions ?? [])].sort((a, b) => (a.version_number ?? 0) - (b.version_number ?? 0));
  if (versions.length < 2) return null;
  const picked = compareOf(query);
  const label = (v: P.PolicyVersion) => `Version ${v.version_number ?? "?"} · ${VERSION_CHIP[v.version_status]?.label ?? v.version_status}`;
  const keep = { ...query, cb: undefined, ct: undefined };
  const c = detail.comparison;
  return (
    <Section title="Compare versions">
      <form action={BASE} method="get" className="space-y-2" data-testid="compare-versions">
        {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <div className="grid grid-cols-2 gap-2">
          <select name="cb" aria-label="Base version" defaultValue={picked?.base ?? versions[versions.length - 2].policy_version_id} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-[12px] dark:border-slate-700 dark:bg-slate-900">
            {versions.map((v) => (
              <option key={v.policy_version_id} value={v.policy_version_id}>{label(v)}</option>
            ))}
          </select>
          <select name="ct" aria-label="Target version" defaultValue={picked?.target ?? versions[versions.length - 1].policy_version_id} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-[12px] dark:border-slate-700 dark:bg-slate-900">
            {versions.map((v) => (
              <option key={v.policy_version_id} value={v.policy_version_id}>{label(v)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className={cn(OUTLINE, "w-full")}>Compare</button>
      </form>
      {c?.error && <Failed what="The comparison" error={c.error} />}
      {c?.data && (
        <div className="mt-2 space-y-1.5 text-[11.5px]" data-testid="comparison">
          {c.data.same_content && <Muted>The two versions carry the same rule.</Muted>}
          {c.data.payload_changes.map((ch) => (
            <p key={`p-${ch.path}`} className="rounded border border-slate-200 px-2 py-1 dark:border-slate-700">
              <span className="font-mono font-semibold">{ch.path}</span> {ch.change}: {show(ch.base)} → {show(ch.target)}
            </p>
          ))}
          {c.data.field_changes.map((ch) => (
            <p key={`f-${ch.field}`} className="text-slate-500">
              {ch.field}: {show(ch.base)} → {show(ch.target)}
            </p>
          ))}
        </div>
      )}
    </Section>
  );
}

function Timeline({ items }: { items: Event[] }) {
  if (!items.length) return <Muted>Nothing has happened to this record yet.</Muted>;
  return (
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
  );
}

const TONE_OF: Record<string, Event["tone"]> = { ACTIVE: "ok", APPROVED: "ok", SUSPENDED: "bad", RETIRED: "warn", REVIEW: "warn" };

function PolicyHistory({ row, detail, query }: { row: Row; detail: PolicyDetail; query: Query }) {
  return (
    <div className="space-y-3">
      <Compare row={row} detail={detail} query={query} />
      <Section title="Lifecycle">
        <PolicyTimeline row={row} detail={detail} />
      </Section>
    </div>
  );
}

function PolicyTimeline({ row, detail }: { row: Row; detail: PolicyDetail }) {
  if (detail.transitions.error) return <Failed what="The version history" error={detail.transitions.error} />;
  const items: Event[] = (detail.transitions.data ?? []).map((t) => ({
    at: t.occurred_at,
    title: `Version ${t.version_number ?? "?"}: ${t.from_status ? `${t.from_status} → ` : ""}${t.to_status}`,
    detail: [`by ${person(t.actor_id).name}`, t.reason, t.approval_reference ? `approval ${t.approval_reference}` : ""].filter(Boolean).join(" · "),
    tone: TONE_OF[t.to_status],
  }));
  if (row.policy) items.push({ at: row.policy.created_at, title: "Policy created", detail: `by ${person(row.policy.created_by_principal_id).name}` });
  if (row.policy?.retired_at) items.push({ at: row.policy.retired_at, title: "Policy retired", detail: row.policy.retirement_reason, tone: "warn" });
  return <Timeline items={items.sort((a, b) => b.at.localeCompare(a.at))} />;
}

function ControlHistory({ row }: { row: Row }) {
  const items: Event[] = [];
  for (const x of row.executions ?? []) {
    const eff = effOfResult(x.result);
    items.push({
      at: x.created_at,
      title: `Test recorded: ${x.result}`,
      detail: `${formatDate(x.period_start.slice(0, 10))} – ${formatDate(x.period_end.slice(0, 10))} · by ${person(x.tester_principal_id).name}`,
      tone: eff === "effective" ? "ok" : eff === "partial" ? "warn" : "bad",
    });
    if (x.reviewer_principal_id && x.reviewed_at) items.push({ at: x.reviewed_at, title: "Test reviewed", detail: `by ${person(x.reviewer_principal_id).name}`, tone: "ok" });
  }
  if (row.control) items.push({ at: row.control.created_at, title: "Control test defined", detail: `by ${person(row.control.created_by_principal_id).name}` });
  return <Timeline items={items.sort((a, b) => b.at.localeCompare(a.at))} />;
}
