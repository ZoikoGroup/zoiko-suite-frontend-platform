// Policies & Controls: one register over two kinds of policy-svc record.
//
// A policy is a family (GET /v1/policy-families) whose state is read off its
// versions (GET /v1/policy-versions). A control is a control-test definition
// (GET /v1/control-test-definitions) whose effectiveness is read off its
// latest execution. Everything here is derived from those reads; nothing is
// stored by the console and no figure is invented. Where the service records
// no value (a policy has no review cadence; a control has no domain column),
// the derivation is stated next to it.

import * as P from "@/lib/api/policies";
import { person } from "@/lib/directory";

// ── domains ──────────────────────────────────────────────────────────────────

export type DomainKey = "governance" | "access" | "finance" | "people" | "procurement" | "legal" | "privacy" | "other";

export const DOMAIN_LABEL: Record<DomainKey, string> = {
  governance: "Governance & Risk",
  access: "Organization & Access",
  finance: "Finance & Tax",
  people: "People & Payroll",
  procurement: "Procurement & Commercial",
  legal: "Legal & Records",
  privacy: "Data & Privacy",
  other: "Other",
};

/** Two-line chart labels ("Finance &" / "Tax"), as in the mock. */
export const DOMAIN_SHORT: Record<DomainKey, [string, string?]> = {
  governance: ["Governance", "& Risk"],
  access: ["Organization", "& Access"],
  finance: ["Finance", "& Tax"],
  people: ["People", "& Payroll"],
  procurement: ["Procurement", "& Commercial"],
  legal: ["Legal", "& Records"],
  privacy: ["Data", "& Privacy"],
  other: ["Other"],
};

export const DOMAIN_ORDER: DomainKey[] = ["governance", "legal", "finance", "people", "procurement", "privacy", "access", "other"];

/**
 * A policy's domain is the business area of the service that decides it at
 * runtime (policy-svc's own catalogue, GET /v1/policy-types): spend rules are
 * decided by Spend Controls, segregation of duties by Authorization, lawful
 * basis by Privacy. policy-svc stores no domain column.
 */
const TYPE_DOMAIN: Record<string, DomainKey> = {
  APPROVAL_THRESHOLD: "governance",
  SIGNATORY_MATRIX: "legal",
  SPEND_CONTROL: "procurement",
  SOD_RULE: "access",
  LEGAL_BASIS: "privacy",
  ACCOUNTING_POLICY: "finance",
};

export function policyDomain(policyType: string): DomainKey {
  return TYPE_DOMAIN[policyType] ?? "other";
}

/**
 * A control's domain: the domain of the policy its control_ref names, when it
 * names one; otherwise read from the reference's leading token (FIN-…, HR-…).
 * control_ref is free text, so anything unrecognised is "Other", not a guess.
 */
const PREFIX_DOMAIN: [RegExp, DomainKey][] = [
  [/^(FIN|GL|AP|AR|TAX|ACC|ACCT|TRE|BANK|CLOSE)$/, "finance"],
  [/^(HR|PAY|PEOPLE|EMP)$/, "people"],
  [/^(PROC|PO|SPEND|VEN|VENDOR|PUR|COM)$/, "procurement"],
  [/^(LEG|LEGAL|CTR|CON|CONTRACT|REC|SIG)$/, "legal"],
  [/^(PRIV|DP|GDPR|DATA)$/, "privacy"],
  [/^(IAM|SOD|AC|ACCESS|ORG|ID)$/, "access"],
  [/^(GOV|RISK|POL|ITGC|COMP|AUD)$/, "governance"],
];

export function controlDomain(controlRef: string, policyByCode: Map<string, P.PolicyFamily>): DomainKey {
  const named = policyByCode.get(controlRef.trim());
  if (named) return policyDomain(named.policy_type);
  const token = controlRef.trim().toUpperCase().split(/[-_.:/\s]/)[0] ?? "";
  return PREFIX_DOMAIN.find(([re]) => re.test(token))?.[1] ?? "other";
}

// ── status and effectiveness ─────────────────────────────────────────────────

export type StatusKey = "active" | "review" | "draft" | "suspended" | "retired";

export const STATUS_LABEL: Record<StatusKey, string> = {
  active: "Active",
  review: "Under Review",
  draft: "Draft",
  suspended: "Suspended",
  retired: "Retired",
};

export const STATUS_TONE: Record<StatusKey, "success" | "warning" | "danger" | "neutral" | "info"> = {
  active: "success",
  review: "warning",
  draft: "info",
  suspended: "danger",
  retired: "neutral",
};

export const STATUS_ORDER: StatusKey[] = ["active", "review", "draft", "suspended", "retired"];

export type EffKey = "effective" | "partial" | "ineffective" | "untested" | "na";

export const EFF_LABEL: Record<EffKey, string> = {
  effective: "Effective",
  partial: "Partially Effective",
  ineffective: "Ineffective",
  untested: "Not Tested",
  na: "Not Applicable",
};

export const EFF_TONE: Record<EffKey, "success" | "warning" | "danger" | "neutral" | "info"> = {
  effective: "success",
  partial: "warning",
  ineffective: "danger",
  untested: "neutral",
  na: "neutral",
};

/**
 * An execution's result is free text in policy-svc (doc7 §E3 keeps it DATA).
 * EFFECTIVE is the only value the service itself counts as passing (its
 * summary's control_tests_failing is "latest result <> EFFECTIVE"), so every
 * other value is a finding: "with exceptions" / "partial" reads as partial,
 * anything else as ineffective.
 */
export function effOfResult(result: string | undefined): EffKey {
  const r = (result ?? "").trim().toUpperCase();
  if (!r) return "untested";
  if (r === "EFFECTIVE") return "effective";
  if (/EXCEPTION|PARTIAL/.test(r)) return "partial";
  return "ineffective";
}

// ── cadence ──────────────────────────────────────────────────────────────────

/** test_frequency is free text; the usual words map to a period. */
export function cadenceOf(frequency: string | undefined): { days?: number; months?: number; label: string } | null {
  const f = (frequency ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!f) return null;
  if (/DAIL/.test(f)) return { days: 1, label: "Daily" };
  if (/FORTNIGHT|BI_?WEEK/.test(f)) return { days: 14, label: "Fortnightly" };
  if (/WEEK/.test(f)) return { days: 7, label: "Weekly" };
  if (/QUARTER/.test(f)) return { months: 3, label: "Quarterly" };
  if (/SEMI|HALF|BI_?ANNUAL/.test(f)) return { months: 6, label: "Semi-annual" };
  if (/MONTH/.test(f)) return { months: 1, label: "Monthly" };
  if (/ANNUAL|YEAR/.test(f)) return { months: 12, label: "Annual" };
  return null;
}

function addCadence(from: Date, c: { days?: number; months?: number }): Date {
  const d = new Date(from);
  if (c.days) d.setUTCDate(d.getUTCDate() + c.days);
  if (c.months) d.setUTCMonth(d.getUTCMonth() + c.months);
  return d;
}

const t = (v: string | null | undefined) => (v ? new Date(v).getTime() : NaN);

// ── the register row ─────────────────────────────────────────────────────────

export type Row = {
  kind: "policy" | "control";
  /** policy_id or control_test_definition_id. */
  id: string;
  /** policy_code or test_code: what the register shows as the ID. */
  ref: string;
  title: string;
  domain: DomainKey;
  status: StatusKey;
  /** Why the status reads as it does, in a sentence. */
  statusNote: string;
  eff: EffKey;
  effNote: string;
  owner: string;
  /** When the record next needs attention: a control's next test, a policy's end date. */
  nextReview: string | null;
  nextReviewNote: string;
  overdue: boolean;
  /** Legal entities the record is scoped to; empty means organisation-wide. */
  entities: string[];
  createdAt: string;
  policy?: P.PolicyFamily;
  versions?: P.PolicyVersion[];
  control?: P.ControlTestDefinition;
  /** Latest period first. */
  executions?: P.ControlTestExecution[];
};

function versionActiveAt(v: P.PolicyVersion, at: number): boolean {
  if (!(t(v.activated_at) <= at)) return false;
  if (t(v.superseded_at) <= at) return false;
  if (t(v.withdrawn_at) <= at) return false;
  return true;
}

function policyRow(f: P.PolicyFamily, versions: P.PolicyVersion[], now: number): Row {
  const has = (s: string) => versions.some((v) => v.version_status === s);
  let status: StatusKey;
  let statusNote: string;
  if (f.policy_status === "RETIRED") {
    status = "retired";
    statusNote = f.retirement_reason ? `Retired: ${f.retirement_reason}` : "The policy has been retired.";
  } else if (has("ACTIVE")) {
    status = "active";
    statusNote = "A version is in force.";
  } else if (has("SUSPENDED")) {
    status = "suspended";
    statusNote = "Its version was suspended and nothing replaced it.";
  } else if (has("REVIEW") || has("APPROVED") || has("SCHEDULED")) {
    status = "review";
    statusNote = has("REVIEW") ? "A version is waiting for approval." : "A version is approved and waiting to be activated.";
  } else {
    status = "draft";
    statusNote = versions.length ? "Only draft versions exist." : "No version has been drafted yet.";
  }

  // policy-svc records no review cadence for a policy. The date that forces a
  // review is the end of the version in force: after it, nothing governs.
  const ends = versions
    .filter((v) => (v.version_status === "ACTIVE" || v.version_status === "SCHEDULED") && v.effective_to)
    .map((v) => v.effective_to!)
    .sort();
  const nextReview = ends[0] ?? null;
  const overdue = nextReview !== null && t(nextReview) < now && has("ACTIVE");

  const entities = [...new Set(versions.map((v) => v.legal_entity_id).filter((x): x is string => !!x))];
  return {
    kind: "policy",
    id: f.policy_id,
    ref: f.policy_code,
    title: f.policy_name,
    domain: policyDomain(f.policy_type),
    status,
    statusNote,
    eff: "na",
    effNote: "Effectiveness is tested on controls; a policy is enforced, not tested.",
    owner: f.created_by_principal_id,
    nextReview,
    nextReviewNote: nextReview ? "End date of the version in force: renew it before then." : "The version in force has no end date.",
    overdue,
    entities,
    createdAt: f.created_at,
    policy: f,
    versions,
  };
}

/** The latest execution known at `at` (recorded by then), latest period first. */
function latestAt(executions: P.ControlTestExecution[], at: number): P.ControlTestExecution | undefined {
  return executions.find((e) => t(e.created_at) <= at);
}

function controlDue(c: P.ControlTestDefinition, executions: P.ControlTestExecution[], at: number): { due: Date | null; overdue: boolean } {
  const cadence = cadenceOf(c.test_frequency);
  if (!cadence || !(t(c.created_at) <= at)) return { due: null, overdue: false };
  const last = latestAt(executions, at);
  const due = addCadence(new Date(last ? last.period_end : c.created_at), cadence);
  return { due, overdue: due.getTime() < at };
}

function controlRow(c: P.ControlTestDefinition, executions: P.ControlTestExecution[] | null, policyByCode: Map<string, P.PolicyFamily>, now: number): Row {
  const ex = executions ?? [];
  const latest = ex[0];
  const eff = executions === null ? "untested" : effOfResult(latest?.result);
  const design = (c.design_status ?? "").toUpperCase();
  const status: StatusKey = /RETIRED|WITHDRAWN/.test(design) ? "retired" : design === "DESIGNED" || design === "TESTED" ? "active" : "review";
  const cadence = cadenceOf(c.test_frequency);
  const { due, overdue } = controlDue(c, ex, now);
  return {
    kind: "control",
    id: c.control_test_definition_id,
    ref: c.test_code,
    title: c.title,
    domain: controlDomain(c.control_ref, policyByCode),
    status,
    statusNote: `Design status ${c.design_status || "not recorded"}: a test methodology is defined.`,
    eff,
    effNote:
      executions === null
        ? "Its executions could not be read."
        : latest
          ? `Latest result ${latest.result}, for ${latest.period_start.slice(0, 10)} – ${latest.period_end.slice(0, 10)}.`
          : "No execution has been recorded yet.",
    owner: c.created_by_principal_id,
    nextReview: due ? due.toISOString() : null,
    nextReviewNote: cadence
      ? latest
        ? `${cadence.label} test, due one period after the last tested period.`
        : `${cadence.label} test, never run: due one period after the control was defined.`
      : c.test_frequency
        ? `Test frequency "${c.test_frequency}" names no period this console can schedule.`
        : "No test frequency is recorded.",
    overdue,
    entities: [],
    createdAt: c.created_at,
    control: c,
    executions: ex,
  };
}

export type Model = {
  rows: Row[];
  policies: Row[];
  controls: Row[];
  /** Controls whose executions could not be read (counted as not tested). */
  unreadControls: number;
};

export function buildModel(
  families: P.PolicyFamily[],
  versions: P.PolicyVersion[],
  controls: P.ControlTestDefinition[],
  executions: Map<string, P.ControlTestExecution[] | null>,
  now = Date.now(),
): Model {
  const byPolicy = new Map<string, P.PolicyVersion[]>();
  for (const v of versions) byPolicy.set(v.policy_id, [...(byPolicy.get(v.policy_id) ?? []), v]);
  const policyByCode = new Map(families.map((f) => [f.policy_code, f]));
  const policies = families.map((f) => policyRow(f, byPolicy.get(f.policy_id) ?? [], now));
  const controlRows = controls.map((c) => controlRow(c, executions.get(c.control_test_definition_id) ?? null, policyByCode, now));
  const rows = [...policies, ...controlRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.ref.localeCompare(b.ref));
  const unreadControls = controls.filter((c) => executions.get(c.control_test_definition_id) === null).length;
  return { rows, policies, controls: controlRows, unreadControls };
}

// ── filters ──────────────────────────────────────────────────────────────────

export type RowFilter = { q?: string; domain?: string; status?: string; type?: string; eff?: string; entity?: string; due?: string };

export function filterRows(rows: Row[], f: RowFilter): Row[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (f.domain && r.domain !== f.domain) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.type && r.kind !== f.type) return false;
    // "issues" is the Control Issues card: partially effective or ineffective.
    if (f.eff && (f.eff === "issues" ? r.eff !== "partial" && r.eff !== "ineffective" : r.eff !== f.eff)) return false;
    if (f.entity && !r.entities.includes(f.entity)) return false;
    if (f.due === "overdue" && !r.overdue) return false;
    if (q) {
      const hay = [
        r.ref,
        r.title,
        DOMAIN_LABEL[r.domain],
        r.policy?.policy_type,
        r.policy ? P.policyTypeLabel(r.policy.policy_type) : "",
        r.control?.control_ref,
        r.control?.methodology,
        person(r.owner).name,
        r.id,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ── over time ────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

/** Twelve weekly points ending now: the cards' sparklines. */
export function weekPoints(now = Date.now(), weeks = 12): number[] {
  return Array.from({ length: weeks + 1 }, (_, i) => now - (weeks - i) * 7 * DAY);
}

export type Snapshot = { policies: number; controls: number; compliant: number; issues: number; overdue: number };

/** The KPI figures as they stood at `at`, from the records' own timestamps. */
export function snapshotAt(model: Model, at: number): Snapshot {
  const policies = model.policies.filter((r) => t(r.createdAt) <= at);
  const controls = model.controls.filter((r) => t(r.createdAt) <= at);
  let compliant = 0;
  let issues = 0;
  let overdue = 0;
  for (const r of controls) {
    const e = effOfResult(latestAt(r.executions ?? [], at)?.result);
    if (e === "effective") compliant++;
    if (e === "partial" || e === "ineffective") issues++;
    if (controlDue(r.control!, r.executions ?? [], at).overdue) overdue++;
  }
  for (const r of policies) {
    const lapsed = (r.versions ?? []).some((v) => versionActiveAt(v, at) && v.effective_to && t(v.effective_to) < at);
    if (lapsed) overdue++;
  }
  return { policies: policies.length, controls: controls.length, compliant, issues, overdue };
}

/** Month buckets for the Control Reviews chart, oldest first. */
export type ReviewMonth = { key: string; label: string; completed: number; inProgress: number; overdue: number };

export function reviewMonths(model: Model, months: number, now = Date.now()): ReviewMonth[] {
  const end = new Date(now);
  const out: ReviewMonth[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1);
    const next = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i + 1, 1);
    const cut = Math.min(next - 1, now);
    const d = new Date(start);
    out.push({
      key: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      completed: 0,
      inProgress: 0,
      // Controls past their test date at the month's end (or now, for this month).
      overdue: model.controls.filter((r) => controlDue(r.control!, r.executions ?? [], cut).overdue).length,
    });
    const bucket = out[out.length - 1];
    for (const r of model.controls) {
      for (const e of r.executions ?? []) {
        // A reviewed execution is a completed review, in the month it was
        // reviewed; one with no reviewer is still in progress, counted in the
        // month it was recorded.
        const when = e.reviewer_principal_id ? t(e.reviewed_at ?? e.created_at) : t(e.created_at);
        if (when >= start && when < next) {
          if (e.reviewer_principal_id) bucket.completed++;
          else bucket.inProgress++;
        }
      }
    }
  }
  return out;
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Change against 30 days ago, as a signed whole percentage (null: new). */
export function delta(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null;
  return Math.round(((now - before) / before) * 100);
}
