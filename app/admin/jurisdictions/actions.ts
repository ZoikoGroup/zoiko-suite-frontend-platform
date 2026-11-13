"use server";

// Server Actions for jurisdiction-rules-svc (:8082).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action. The service authorizes every write
// itself (JURISDICTION_* on the platform scope), enforces maker-checker, and
// fails closed; the console only relays its answer, in words.
//
// One action, `commandAction`, serves every dialog on the page: the form's
// hidden `command` names the step, and the table below maps it to one call.
// Every result is the AuthzResult shape the shared ActionDialog shows.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, toIdentity, type SessionIdentity } from "@/lib/auth";
import type { ApiError, ApiWriteResult } from "@/lib/api/client";
import type { AuthzResult } from "@/app/admin/authorization/state";
import { createWorkflow, decideWorkflow, getWorkflow } from "@/lib/api/workflow";
import { person } from "@/lib/directory";
import * as J from "@/lib/api/jurisdictions";

type Caller = SessionIdentity & { principalId: string; tenantId: string };
type Handler = (fd: FormData, me: Caller) => Promise<AuthzResult>;

const EXPIRED: AuthzResult = { status: "signin", message: "Your session has expired — sign in again." };

async function requireIdentity(): Promise<Caller | null> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email || !session.principalId || !session.tenantId) return null;
  return toIdentity(session) as Caller;
}

// ── form helpers ─────────────────────────────────────────────────────────────

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => text(fd, k) || undefined;
const num = (fd: FormData, k: string): number | undefined => {
  const v = text(fd, k);
  return v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v);
};
const list = (fd: FormData, k: string) =>
  text(fd, k)
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A date input as the instant the service parses (time.Time fields). */
function instant(v: string | undefined): string | undefined {
  if (!v) return undefined;
  if (DAY.test(v)) return `${v}T00:00:00Z`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

class FormProblem extends Error {}

function need(fd: FormData, k: string, what: string): string {
  const v = text(fd, k);
  if (!v) throw new FormProblem(`${what} is required.`);
  return v;
}

function json(fd: FormData, k: string, what: string, optional = false): unknown {
  const raw = text(fd, k);
  if (!raw) {
    if (optional) return undefined;
    throw new FormProblem(`${what} is required.`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new FormProblem(`${what} is not valid JSON: ${(e as Error).message}.`);
  }
}

function fail(error: ApiError): AuthzResult {
  const code = J.problemCode(error);
  if (error.status === 401 || code === "identity_not_verified") return { status: "signin", message: J.explainJurisdictionProblem(error) };
  return { status: J.isRefusal(error) ? "refused" : "error", message: J.explainJurisdictionProblem(error) };
}

/** Run one write; on success refresh the page and say what happened. */
async function write<T>(call: Promise<ApiWriteResult<T>>, ok: (data: T, status: number) => AuthzResult): Promise<AuthzResult> {
  const r = await call;
  if (!r.ok) return fail(r.error);
  refresh();
  return ok(r.data, r.status);
}

const done = (message: string, details: { label: string; value: string | number | boolean | null | undefined }[] = []): AuthzResult => ({
  status: "done",
  message,
  details: details.filter((d) => d.value !== undefined && d.value !== null && d.value !== "").map((d) => ({ label: d.label, value: String(d.value) })),
});

const short = (s: string | null | undefined) => (s ? (s.length > 24 ? `${s.slice(0, 14)}…${s.slice(-6)}` : s) : "—");

function explanation(lines: string[] | null | undefined): AuthzResult["table"] {
  return lines?.length ? { headers: ["Step"], rows: lines.map((l) => [l]) } : undefined;
}

// ── commands ─────────────────────────────────────────────────────────────────

const COMMANDS: Record<string, Handler> = {
  // Registry
  "jur.create": (fd, me) =>
    write(
      J.createJurisdiction(
        {
          jurisdictionCode: need(fd, "jurisdiction_code", "A code").toUpperCase(),
          jurisdictionName: need(fd, "jurisdiction_name", "A name"),
          jurisdictionType: need(fd, "jurisdiction_type", "A type").toUpperCase(),
          authorityType: need(fd, "authority_type", "An authority type").toUpperCase(),
          effectiveFrom: instant(need(fd, "effective_from", "Effective from"))!,
          effectiveTo: instant(opt(fd, "effective_to")),
          parentJurisdictionId: opt(fd, "parent_jurisdiction_id"),
        },
        me,
      ),
      (j, status) =>
        done(status === 201 ? `Registered ${j.jurisdiction_name} (${j.jurisdiction_code}). Rules, sources and packs can now name it.` : `${j.jurisdiction_code} was already registered; nothing new was written.`, [
          { label: "Code", value: j.jurisdiction_code },
          { label: "Type", value: j.jurisdiction_type },
          { label: "Id", value: j.jurisdiction_id },
        ]),
    ),
  "jur.retire": (fd, me) =>
    write(
      J.retireJurisdiction(
        { jurisdiction_id: need(fd, "id", "The jurisdiction"), row_version: num(fd, "row_version") },
        { reason: need(fd, "reason", "A reason"), evidenceRef: opt(fd, "evidence_ref"), supersededBy: opt(fd, "superseded_by") },
        me,
      ),
      (j) =>
        done(`${j.jurisdiction_code} is retired and end-dated. It stays in the register with its history, but no longer resolves: services that validate against it now fail closed.`, [
          { label: "Effective to", value: j.effective_to?.slice(0, 10) },
          { label: "Reason", value: j.retirement_reason },
        ]),
    ),
  "jur.alias.add": (fd, me) =>
    write(
      J.addAlias(
        need(fd, "id", "The jurisdiction"),
        {
          aliasSystem: need(fd, "alias_system", "The code system").toUpperCase(),
          aliasCode: need(fd, "alias_code", "The alias code"),
          sourceStandard: need(fd, "source_standard", "The source standard"),
          sourceVersion: need(fd, "source_version", "The source version"),
          mappingRationale: need(fd, "mapping_rationale", "A rationale"),
          evidenceRef: opt(fd, "evidence_ref"),
          validFrom: instant(need(fd, "valid_from", "Valid from"))!,
          validTo: instant(opt(fd, "valid_to")),
        },
        me,
      ),
      (a) => done(`${a.alias_system} ${a.alias_code} now maps to this jurisdiction from ${a.valid_from.slice(0, 10)}.`, [{ label: "Alias id", value: a.alias_id }]),
    ),
  "jur.alias.end": (fd, me) =>
    write(
      J.endAlias(need(fd, "id", "The jurisdiction"), need(fd, "alias_id", "The alias"), { validTo: instant(need(fd, "valid_to", "The end date"))!, reason: need(fd, "reason", "A reason") }, me),
      (a) => done(`${a.alias_system} ${a.alias_code} stops mapping on ${a.valid_to?.slice(0, 10)}. Its history is kept.`),
    ),
  "import.propose": (fd, me) => {
    const items = json(fd, "items", "The import rows");
    if (!Array.isArray(items) || items.length === 0) throw new FormProblem("The import rows must be a non-empty JSON array.");
    return write(
      J.proposeImport(
        {
          sourceStandard: need(fd, "source_standard", "The source standard"),
          sourceVersion: need(fd, "source_version", "The source version"),
          evidenceRef: need(fd, "evidence_ref", "Evidence"),
          summary: need(fd, "summary", "A summary"),
          items: items as J.ImportItemInput[],
        },
        me,
      ),
      (b) => ({
        status: "pending",
        message: `Import proposed with ${b.item_count} row(s)${b.invalid_count ? `, ${b.invalid_count} of them invalid` : ""}. Nothing changes until a second person approves it.`,
        details: [
          { label: "Batch", value: b.batch_id },
          { label: "Import hash", value: short(b.import_hash) },
        ],
      }),
    );
  },
  "import.approve": (fd, me) =>
    write(J.decideImport(need(fd, "id", "The batch"), "approve", text(fd, "reason"), me), (b) =>
      done(`Import approved and applied: ${b.added_count ?? 0} added, ${b.updated_count ?? 0} updated, ${b.retired_count ?? 0} retired, ${b.unchanged_count ?? 0} unchanged.`),
    ),
  "import.reject": (fd, me) =>
    write(J.decideImport(need(fd, "id", "The batch"), "reject", need(fd, "reason", "A reason"), me), () => done("Import rejected. Nothing was applied; the proposal and the reason are kept.")),

  // Rules
  "rule.create": (fd, me) => {
    const payload = json(fd, "rule_payload", "The rule payload", true) ?? {};
    if (typeof payload !== "object" || Array.isArray(payload)) throw new FormProblem("The rule payload must be a JSON object.");
    return write(
      J.createRule(
        {
          jurisdictionId: need(fd, "jurisdiction_id", "The jurisdiction"),
          ruleDomain: need(fd, "rule_domain", "A domain").toUpperCase(),
          ruleCode: need(fd, "rule_code", "A rule code").toUpperCase(),
          ruleName: need(fd, "rule_name", "A rule name"),
          effectiveFrom: instant(need(fd, "effective_from", "Effective from"))!,
          effectiveTo: instant(opt(fd, "effective_to")),
          rulePayload: payload,
          sourceReference: opt(fd, "source_reference"),
          externalFeedReference: opt(fd, "external_feed_reference"),
          supersedesRuleId: opt(fd, "supersedes_rule_id"),
        },
        me,
      ),
      (r) => ({
        status: "pending",
        message: `${r.rule_code} is recorded as DRAFT. It does not apply until a second person activates it, citing an approval workflow-svc confirms. Request that approval from the rule's drawer.`,
        details: [
          { label: "Rule", value: `${r.rule_domain} · ${r.rule_code}` },
          { label: "Effective from", value: r.effective_from.slice(0, 10) },
          { label: "Rule id", value: r.jurisdiction_rule_id },
        ],
      }),
    );
  },
  "rule.request-approval": async (fd, me) => {
    const ruleId = need(fd, "id", "The rule");
    const approver = need(fd, "approver", "An approver");
    if (approver === me.principalId) throw new FormProblem("Choose someone else: the rule's author cannot approve it.");
    const r = await createWorkflow({
      identity: me,
      legalEntityId: me.legalEntityId,
      workflowType: "JURISDICTION_RULE_ACTIVATION",
      subjectType: "jurisdiction_rule",
      subjectId: ruleId,
      stages: [{ stage_type: "SINGLE", approver_principal_id: approver }],
      idempotencyKey: crypto.randomUUID(),
    });
    if (!r.ok) return { status: J.isRefusal(r.error) ? "refused" : "error", message: `workflow-svc did not open the approval: ${r.error.message}` };
    refresh();
    return {
      status: "pending",
      message: `Approval requested from ${person(approver).name}. They approve and activate the rule from its drawer, citing this approval.`,
      details: [
        { label: "Approval reference", value: r.data.workflow_instance_id },
        { label: "Approver", value: person(approver).name },
      ],
    };
  },
  "rule.approve-activate": async (fd, me) => {
    const ruleId = need(fd, "id", "The rule");
    const ref = need(fd, "approval_reference", "The approval reference");
    const wf = await getWorkflow(ref, me);
    if (!wf.ok) return { status: "refused", message: `workflow-svc does not show that approval to you: ${wf.error.message}` };
    if (wf.data.subject_type !== "jurisdiction_rule" || wf.data.subject_id !== ruleId) return { status: "refused", message: "That approval is not bound to this rule." };
    if (wf.data.workflow_status === "PENDING" || wf.data.workflow_status === "ESCALATED") {
      const decided = await decideWorkflow({ identity: me, workflowInstanceId: ref, decision: "APPROVE", rationale: opt(fd, "rationale"), quorum: false, idempotencyKey: crypto.randomUUID() });
      if (!decided.ok) return { status: J.isRefusal(decided.error) ? "refused" : "error", message: `workflow-svc did not record your approval: ${decided.error.message}` };
    }
    const rule = await J.getRule(ruleId, me);
    return write(J.transitionRule({ jurisdiction_rule_id: ruleId, row_version: rule.ok ? rule.data.row_version : undefined }, { newStatus: "ACTIVE", approvalReference: ref }, me), (r) =>
      done(`${r.rule_code} is ACTIVE. It now resolves into rule packs for its jurisdiction and everything nested in it; the approval is recorded on its status history.`, [
        { label: "Approval reference", value: ref },
        { label: "Effective from", value: r.effective_from.slice(0, 10) },
      ]),
    );
  },
  "rule.reject-approval": async (fd, me) => {
    const ref = need(fd, "approval_reference", "The approval reference");
    const r = await decideWorkflow({ identity: me, workflowInstanceId: ref, decision: "REJECT", rationale: need(fd, "rationale", "A reason"), quorum: false, idempotencyKey: crypto.randomUUID() });
    if (!r.ok) return { status: J.isRefusal(r.error) ? "refused" : "error", message: `workflow-svc did not record the rejection: ${r.error.message}` };
    refresh();
    return done("Approval rejected. The rule stays DRAFT; its author can revise it and ask again.");
  },
  "rule.close": (fd, me) => {
    const to = need(fd, "new_status", "The new status") as "SUPERSEDED" | "RETIRED";
    if (to !== "SUPERSEDED" && to !== "RETIRED") throw new FormProblem("Choose SUPERSEDED or RETIRED.");
    return write(
      J.transitionRule({ jurisdiction_rule_id: need(fd, "id", "The rule"), row_version: num(fd, "row_version") }, { newStatus: to, effectiveTo: instant(opt(fd, "effective_to")) }, me),
      (r) => done(`${r.rule_code} is ${r.rule_status}, end-dated ${r.effective_to ? `to ${r.effective_to.slice(0, 10)}` : "now"}. Point-in-time reads after that date no longer match it.`),
    );
  },
  "rule.drift": (fd, me) =>
    write(
      J.recordDrift({ jurisdiction_rule_id: need(fd, "id", "The rule"), row_version: num(fd, "row_version") }, need(fd, "drift_state", "A drift state"), need(fd, "reason", "A reason"), me),
      (r) =>
        done(
          r.changed
            ? `${r.rule.rule_code} is now ${r.rule.legal_drift_state}. The transition is in the append-only drift history${r.rule.rule_status === "ACTIVE" && r.rule.legal_drift_state !== "CURRENT" ? "; the rule is still in force while it is reviewed" : ""}.`
            : `${r.rule.rule_code} was already ${r.rule.legal_drift_state}; nothing changed.`,
        ),
    ),
  "rule.provenance": (fd, me) =>
    write(
      J.setProvenance(
        need(fd, "id", "The rule"),
        { regimeId: opt(fd, "regime_id"), interpretationId: opt(fd, "interpretation_id"), precedence: num(fd, "precedence"), publishedOn: opt(fd, "published_on"), sourceIds: list(fd, "source_ids") },
        me,
      ),
      (p) => done("Provenance recorded: the rule now names the sources and interpretation it rests on.", [{ label: "Sources", value: (p.source_ids ?? []).length }]),
    ),
  "rule.parameters": (fd, me) => write(J.setParameters(need(fd, "id", "The rule"), json(fd, "parameters", "The parameters"), me), () => done("Typed parameters recorded. Calculations read them exactly (no floating point).")),
  "rule.validate": async (fd, me) => {
    const r = await J.validateAction(
      {
        actionType: need(fd, "action_type", "An action type").toUpperCase(),
        jurisdictionId: need(fd, "jurisdiction_id", "The jurisdiction"),
        entityType: need(fd, "entity_type", "An entity type").toUpperCase(),
        effectiveAt: instant(opt(fd, "effective_at")),
        payload: json(fd, "payload", "The payload", true),
      },
      me,
    );
    const body = (r.ok ? r.data : (r.error.body as J.ValidateActionResult | undefined)) ?? null;
    if (!r.ok && (!body || typeof body.permitted !== "boolean")) return fail(r.error);
    return {
      status: body!.permitted ? "done" : "refused",
      message: body!.permitted ? `Permitted: ${body!.detail || "the rule in force allows it"}.` : `Not permitted: ${body!.detail || "no rule in force allows it"}.`,
      details: [
        { label: "Rule", value: body!.rule ? `${body!.rule.rule_domain} · ${body!.rule.rule_code}` : "—" },
        { label: "Pack digest", value: short(body!.pack_digest) },
        { label: "Insufficient", value: (body!.insufficient ?? []).join(", ") || "—" },
        { label: "Conflicts", value: String((body!.conflicts ?? []).length) },
      ],
    };
  },

  // Sources, regimes, interpretations
  "regime.create": (fd, me) =>
    write(J.createRegime({ regimeCode: need(fd, "regime_code", "A code").toUpperCase(), regimeName: need(fd, "regime_name", "A name"), description: opt(fd, "description") }, me), (r, s) =>
      done(s === 201 ? `Regime ${r.regime_code} registered.` : `Regime ${r.regime_code} already exists.`),
    ),
  "source.create": (fd, me) =>
    write(
      J.createSource(
        {
          jurisdictionId: need(fd, "jurisdiction_id", "The jurisdiction"),
          authority: need(fd, "authority", "The authority"),
          sourceType: need(fd, "source_type", "A source type"),
          authorityLevel: need(fd, "authority_level", "An authority level"),
          title: need(fd, "title", "A title"),
          location: need(fd, "location", "The location"),
          snapshotHash: need(fd, "snapshot_hash", "The snapshot hash"),
          officialIdentifier: opt(fd, "official_identifier"),
          publishedOn: opt(fd, "published_on"),
          effectiveOn: opt(fd, "effective_on"),
          language: opt(fd, "language"),
        },
        me,
      ),
      (s) => ({ status: "pending", message: `"${s.title}" is captured. A second person must review it before interpretations, rules or packs can cite it.`, details: [{ label: "Source id", value: s.source_id }] }),
    ),
  "source.review": (fd, me) => write(J.reviewSource(need(fd, "id", "The source"), opt(fd, "etag"), me), (s) => done(`Reviewed. "${s.title}" can now be cited.`)),
  "source.supersede": (fd, me) =>
    write(J.supersedeSource(need(fd, "id", "The source"), need(fd, "replacement_source_id", "The replacement source"), opt(fd, "etag"), me), () =>
      done("Superseded. The old source is kept as it was (decisions that cited it still explain themselves); new citations use the replacement."),
    ),
  "interp.create": (fd, me) =>
    write(
      J.createInterpretation(
        {
          jurisdictionId: need(fd, "jurisdiction_id", "The jurisdiction"),
          regimeId: opt(fd, "regime_id"),
          subject: need(fd, "subject", "A subject"),
          decision: need(fd, "decision", "The decision"),
          rationale: need(fd, "rationale", "A rationale"),
          sourceIds: list(fd, "source_ids"),
        },
        me,
      ),
      (i) => ({ status: "pending", message: "Interpretation recorded. A second person must approve it before rules cite it.", details: [{ label: "Interpretation id", value: i.interpretation_id }] }),
    ),
  "interp.approve": (fd, me) => write(J.approveInterpretation(need(fd, "id", "The interpretation"), opt(fd, "etag"), me), () => done("Interpretation approved.")),
  "notice.create": (fd, me) =>
    write(
      J.createNotice(
        {
          jurisdictionId: opt(fd, "jurisdiction_id"),
          authority: need(fd, "authority", "The authority"),
          changeType: need(fd, "change_type", "The change type"),
          title: need(fd, "title", "A title"),
          location: opt(fd, "location"),
          affectedSourceId: opt(fd, "affected_source_id"),
          detail: opt(fd, "detail"),
        },
        me,
      ),
      (n) => ({ status: "pending", message: "Source-change notice opened. A reviewer takes it, then closes it with an outcome; nothing is published automatically.", details: [{ label: "Notice id", value: n.notice_id }] }),
    ),
  "notice.review": (fd, me) => write(J.startNoticeReview(need(fd, "id", "The notice"), opt(fd, "etag"), me), () => done("You are now the notice's reviewer.")),
  "notice.close": (fd, me) =>
    write(
      J.closeNotice(need(fd, "id", "The notice"), { outcome: need(fd, "outcome", "An outcome"), note: need(fd, "note", "A note"), linkedInterpretationId: opt(fd, "linked_interpretation_id") }, opt(fd, "etag"), me),
      (n) => done(`Notice closed: ${n.outcome?.replaceAll("_", " ").toLowerCase()}.`),
    ),

  // Packs
  "pack.create": (fd, me) =>
    write(
      J.createPack({ packRef: need(fd, "pack_ref", "A pack ref").toLowerCase(), packName: need(fd, "pack_name", "A name"), owner: need(fd, "owner", "An owner"), supportOwner: opt(fd, "support_owner") }, me),
      (p, s) => done(s === 201 ? `Pack ${p.pack_ref} registered. Add a version with its manifest next.` : `Pack ${p.pack_ref} already exists.`),
    ),
  "pack.version": (fd, me) => {
    const ref = need(fd, "ref", "The pack");
    const manifest: J.PackManifest = {
      pack_id: ref,
      pack_version: need(fd, "pack_version", "A version"),
      jurisdiction_ids: list(fd, "jurisdiction_codes").map((c) => c.toUpperCase()),
      regimes: list(fd, "regimes").map((c) => c.toUpperCase()),
      effective_from: need(fd, "effective_from", "Effective from"),
      dependencies: (json(fd, "dependencies", "Dependencies", true) as J.PackManifest["dependencies"]) ?? [],
      rule_modules: list(fd, "rule_modules"),
      ...(num(fd, "source_register_version") !== undefined ? { source_register_version: num(fd, "source_register_version") } : {}),
    };
    return write(J.createPackVersion(ref, manifest, me), (v) => done(`Version ${v.version} of ${v.pack_ref} is DRAFT. Submit it for review, compile it, then certify, sign and publish.`, [{ label: "Manifest digest", value: short(v.manifest_digest) }]));
  },
  "pack.step": async (fd, me) => {
    const ref = need(fd, "ref", "The pack");
    const v = need(fd, "version", "The version");
    const step = need(fd, "step", "The step") as J.PackStep;
    const reason = opt(fd, "reason");
    const evidence = opt(fd, "evidence_ref");
    return write(J.packStep<Record<string, unknown>>(ref, v, step, me, reason || evidence ? { reason, evidence_ref: evidence } : undefined, opt(fd, "etag")), (d) => {
      const to = (d?.to_status ?? d?.status) as string | undefined;
      const lines: Record<string, string> = {
        "submit-review": "Submitted for review. Reviewers record their decisions on the compiled artifact.",
        compile: "Compiled. The artifact is immutable and named by its digest.",
        sign: "Signed with the service's signing key. Verify it to check digest and signature.",
        certify: "Certified: the test run passed and the required independent reviews approve this artifact.",
        publish: "Released. Deploy it to a ring and region for resolvers to serve it.",
        withdraw: "Withdrawn: no new decision may use it. A remediation case lists the decisions already made with it.",
        block: "Emergency-blocked pending incident review.",
        unblock: "Unblocked: back to RELEASED.",
        "test-runs": `Test run ${(d?.passed as boolean | undefined) ? "passed" : "finished"}.`,
      };
      return done(lines[step] ?? "Done.", [
        { label: "Status", value: to },
        { label: "Artifact digest", value: short(d?.artifact_digest as string | undefined) },
        { label: "Remediation case", value: d?.remediation_case_id as string | undefined },
      ]);
    });
  },
  "pack.verify": async (fd, me) => {
    const r = await J.verifyPack(need(fd, "ref", "The pack"), need(fd, "version", "The version"), me);
    if (!r.ok) return fail(r.error);
    const v = "verification" in r.data ? r.data.verification : r.data;
    return {
      status: v.verified ? "done" : "refused",
      message: v.verified ? "Verified: the stored artifact matches its digest and its signature checks against a trusted key." : `Does NOT verify: ${(v.reasons ?? []).join("; ")}.`,
      details: [
        { label: "Computed digest", value: short(v.computed_digest) },
        { label: "Stored digest", value: short(v.stored_digest) },
        { label: "Signing key", value: v.signature_key_ref ?? "—" },
      ],
    };
  },
  "pack.test-bundle": (fd, me) =>
    write(J.submitTestBundle(need(fd, "ref", "The pack"), need(fd, "version", "The version"), json(fd, "bundle", "The test bundle"), me), (b) =>
      done(`Test bundle revision ${b.revision} recorded. Run the tests against the compiled artifact next.`, [{ label: "Bundle digest", value: short(b.bundle_digest) }]),
    ),
  "pack.review": (fd, me) => {
    const decision = need(fd, "decision", "A decision") as "APPROVE" | "REJECT";
    return write(
      J.addReview(need(fd, "ref", "The pack"), need(fd, "version", "The version"), { role: need(fd, "role", "A role").toUpperCase(), decision, findings: decision === "REJECT" ? need(fd, "findings", "Findings") : text(fd, "findings") }, me),
      (r) => done(`Review recorded: ${r.role} ${r.decision.toLowerCase()}s the artifact.`),
    );
  },
  "pack.deploy": (fd, me) =>
    write(J.deployPack(need(fd, "ref", "The pack"), need(fd, "version", "The version"), { ring: need(fd, "ring", "A ring"), region: need(fd, "region", "A region"), exceptionReason: opt(fd, "exception_reason") }, me), (d) =>
      done(`Deployed to ${d.ring_code} / ${d.region_code}. Resolvers in that ring and region now serve it.`),
    ),
  "pack.rollback": (fd, me) =>
    write(
      J.rollbackPack(need(fd, "ref", "The pack"), need(fd, "version", "The version"), { ring: need(fd, "ring", "A ring"), region: need(fd, "region", "A region"), restoreVersion: need(fd, "restore_version", "The version to restore"), reason: need(fd, "reason", "A reason") }, me),
      (r) => {
        const x = r as { decisions_made_with_rolled_back_version?: number; remediation_case_id?: string | null };
        return done(`Rolled back. ${x.decisions_made_with_rolled_back_version ?? 0} decision(s) were made with the rolled-back version${x.remediation_case_id ? "; a remediation case lists them" : ""}.`, [{ label: "Remediation case", value: x.remediation_case_id }]);
      },
    ),
  "pack.supersede": (fd, me) =>
    write(J.supersedePack(need(fd, "ref", "The pack"), need(fd, "version", "The version"), { supersededBy: need(fd, "superseded_by", "The replacing version"), reason: need(fd, "reason", "A reason"), evidenceRef: need(fd, "evidence_ref", "Evidence") }, me), () =>
      done("Superseded by the newer version."),
    ),
  "pack.hotfix": (fd, me) =>
    write(
      J.declareHotfix(
        need(fd, "ref", "The pack"),
        need(fd, "version", "The version"),
        {
          severity: need(fd, "severity", "A severity") as "P0" | "P1",
          scopeSummary: need(fd, "scope_summary", "The scope"),
          incidentRef: need(fd, "incident_ref", "The incident"),
          incidentCommander: need(fd, "incident_commander", "The incident commander"),
          rollbackTargetVersion: need(fd, "rollback_target_version", "The rollback target"),
        },
        me,
      ),
      (h) => done(`Hotfix declared (${h.severity}). Its retrospective is due by ${h.retro_due_at.slice(0, 10)}.`),
    ),
  "pack.retro": (fd, me) => write(J.completeRetrospective(need(fd, "ref", "The pack"), need(fd, "version", "The version"), need(fd, "note", "A note"), me), () => done("Retrospective recorded.")),
  "key.register": (fd, me) =>
    write(J.registerSigningKey({ keyRef: need(fd, "key_ref", "A key ref"), publicKey: need(fd, "public_key", "The public key"), algorithm: opt(fd, "algorithm") }, me), (k, s) =>
      done(s === 201 ? `Public key ${k.key_ref} is trusted for verification.` : `${k.key_ref} was already registered with this key.`),
    ),
  "key.status": (fd, me) => {
    const to = need(fd, "to", "The change") as "retire" | "revoke";
    return write(J.setSigningKeyStatus(need(fd, "id", "The key"), to, need(fd, "reason", "A reason"), me), (k) => done(`${k.key_ref} is ${k.status}.`));
  },
  "ring.create": (fd, me) =>
    write(J.createRing({ ringCode: need(fd, "ring_code", "A ring code").toUpperCase(), ordinal: num(fd, "ordinal") ?? 0, minSoakSeconds: num(fd, "min_soak_seconds") ?? 0, description: opt(fd, "description") }, me), (r) => done(`Ring ${r.ring_code} created.`)),
  "region.create": (fd, me) => write(J.createRegion({ regionCode: need(fd, "region_code", "A region code").toUpperCase(), description: opt(fd, "description") }, me), (r) => done(`Region ${r.region_code} created.`)),

  // Runtime
  "resolve.rule": async (fd, me) => {
    const r = await J.resolveRule(
      { jurisdiction: need(fd, "jurisdiction", "A jurisdiction code").toUpperCase(), ruleDomain: need(fd, "rule_domain", "A domain").toUpperCase(), ruleCode: need(fd, "rule_code", "A rule code").toUpperCase(), effectiveAt: instant(opt(fd, "effective_at")) },
      me,
    );
    if (!r.ok) return fail(r.error);
    const d = r.data;
    return {
      status: d.outcome === "RESOLVED" ? "done" : "refused",
      message: d.outcome === "RESOLVED" ? `Resolved ${d.rule_code} from ${d.pack?.pack_ref}@${d.pack?.version}. The decision is recorded as evidence.` : `No single rule answers: ${d.outcome.replaceAll("_", " ").toLowerCase()}. ${d.basis ?? ""}`,
      details: [
        { label: "Outcome", value: d.outcome },
        { label: "Rule", value: d.rule ? `${d.rule.rule_name} (${short(d.rule.content_digest)})` : "—" },
        { label: "Pack", value: d.pack ? `${d.pack.pack_ref}@${d.pack.version}` : "—" },
        { label: "Decision id", value: d.decision_id ?? "—" },
      ],
      table: explanation(d.explanation),
    };
  },
  "determine.jurisdiction": async (fd, me) => {
    const r = await J.determineJurisdiction(
      { legalEntityId: need(fd, "legal_entity_id", "A legal entity"), purpose: need(fd, "purpose", "A purpose"), effectiveAt: instant(opt(fd, "effective_at")), claimedJurisdiction: opt(fd, "claimed_jurisdiction") },
      me,
    );
    if (!r.ok) return fail(r.error);
    const d = r.data;
    return {
      status: d.outcome === "JURISDICTION_DETERMINED" ? "done" : "refused",
      message: d.jurisdiction ? `Determined: ${d.jurisdiction.jurisdiction_code} (${d.basis}).` : `Not determined: ${d.outcome.replaceAll("_", " ").toLowerCase()}.`,
      details: [
        { label: "Outcome", value: d.outcome },
        { label: "Candidates", value: (d.candidates ?? []).map((c) => c.jurisdiction_code).join(", ") || "—" },
        { label: "Claim", value: d.claim?.claimed ? `${d.claim.claimed}: ${d.claim.status}` : "—" },
      ],
      table: explanation(d.explanation),
    };
  },
  evaluate: async (fd, me) => {
    const kind = need(fd, "kind", "The evaluator") as J.EvaluatorKey;
    if (!J.EVALUATORS[kind]) throw new FormProblem("Choose an evaluator.");
    const body = json(fd, "body", "The request");
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new FormProblem("The request must be a JSON object.");
    const r = await J.evaluate(kind, body as Record<string, unknown>, me);
    if (!r.ok) return fail(r.error);
    const d = r.data;
    const inner = Object.values(d).find((v) => v && typeof v === "object" && !Array.isArray(v) && "explanation" in (v as object)) as { explanation?: string[] } | undefined;
    const facts = Object.entries(d)
      .filter(([k, v]) => k !== "resolution" && k !== "explanation" && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
      .slice(0, 8)
      .map(([k, v]) => ({ label: k.replaceAll("_", " "), value: String(v) }));
    return { status: "done", message: `${J.EVALUATORS[kind].label}: ${d.outcome ?? "answered"}.`, details: facts, table: explanation(d.explanation ?? inner?.explanation) };
  },
  "resolver.invalidate": (_fd, me) => write(J.invalidateResolverCache(me), () => done("This replica's resolver cache was dropped. The next resolution reads the released packs again.")),
  "entity.backfill": (fd, me) =>
    write(J.backfillApplicability(opt(fd, "legal_entity_id"), me), (b) =>
      done(`Backfill read ${b.mappings_read} mapping(s) for ${b.entities_scanned} entit${b.entities_scanned === 1 ? "y" : "ies"}: ${b.applied} restored, ${b.unchanged} already current.`, [{ label: "Skipped", value: (b.skipped ?? []).length }]),
    ),
  "submission.register": (fd, me) =>
    write(
      J.registerSubmission(
        { jurisdiction: need(fd, "jurisdiction", "A jurisdiction code").toUpperCase(), kind: need(fd, "kind", "A kind").toUpperCase(), profileCode: need(fd, "profile_code", "A profile code").toUpperCase(), effectiveAt: instant(opt(fd, "effective_at")), subjectRef: need(fd, "subject_ref", "A subject reference"), payloadHash: need(fd, "payload_hash", "The payload hash") },
        me,
      ),
      (s) => {
        const x = "submission" in s ? s.submission : s;
        return done(`Submission registered as ${x.status}. Provider callbacks are recorded against it in order; a late callback cannot regress it.`, [{ label: "Submission id", value: x.submission_id }]);
      },
    ),
  "submission.event": (fd, me) =>
    write(J.recordSubmissionEvent(need(fd, "id", "The submission"), { providerEventId: need(fd, "provider_event_id", "The provider event id"), status: need(fd, "status", "A status").toUpperCase(), receiptId: opt(fd, "receipt_id"), occurredAt: instant(need(fd, "occurred_at", "When it occurred"))! }, me), () =>
      done("Provider event recorded."),
    ),
  "outbox.requeue": (fd, me) =>
    write(J.requeueEvent(need(fd, "id", "The event"), { reason: need(fd, "reason", "A reason"), evidenceRef: opt(fd, "evidence_ref") }, me), (r) =>
      done(`Requeued after ${r.attempts_before} failed attempt(s). The relay publishes it on its next pass; the requeue is kept as evidence.`),
    ),
  "operation.cancel": (fd, me) => write(J.cancelOperation(need(fd, "id", "The operation"), me), (o) => done(`Operation ${o.state}.`)),

  // Calendars, payment terms, obligation rules
  "calendar.create": (fd, me) =>
    write(J.createCalendar({ calendarCode: need(fd, "calendar_code", "A code").toUpperCase(), jurisdictionId: need(fd, "jurisdiction_id", "The jurisdiction"), authority: need(fd, "authority", "The authority"), description: opt(fd, "description") }, me), (c) =>
      done(`Calendar ${c.calendar_code} created. Add a version with its holidays, then a second person publishes it.`),
    ),
  "calendar.version": (fd, me) =>
    write(
      J.createCalendarVersion(
        need(fd, "id", "The calendar"),
        { effectiveFrom: need(fd, "effective_from", "Effective from"), timezone: need(fd, "timezone", "A time zone"), weekendDays: list(fd, "weekend_days").map(Number), cutoffTime: opt(fd, "cutoff_time"), holidays: parseHolidays(text(fd, "holidays")) },
        me,
      ),
      (v) => ({ status: "pending", message: `Version ${v.version} is DRAFT with ${(v.holidays ?? []).length} holiday(s). A second person publishes it.`, details: [{ label: "Content digest", value: short(v.content_digest) }] }),
    ),
  "calendar.sources": (fd, me) => write(J.setCalendarSources(need(fd, "id", "The calendar"), num(fd, "version") ?? 0, list(fd, "source_ids"), me), () => done("Sources recorded on the calendar version.")),
  "calendar.publish": (fd, me) => write(J.publishCalendarVersion(need(fd, "id", "The calendar"), num(fd, "version") ?? 0, me), (v) => done(`Version ${v.version} is published and in force from ${v.effective_from}. It cannot change; an amendment is a new version.`)),
  "calendar.import": (fd, me) =>
    write(
      J.importHolidays(
        need(fd, "id", "The calendar"),
        {
          sourceAuthority: need(fd, "source_authority", "The source authority"),
          sourceReference: need(fd, "source_reference", "The source reference"),
          sourceVersion: need(fd, "source_version", "The source version"),
          effectiveFrom: need(fd, "effective_from", "Effective from"),
          timezone: need(fd, "timezone", "A time zone"),
          weekendDays: list(fd, "weekend_days").map(Number),
          holidays: parseHolidays(text(fd, "holidays")),
        },
        me,
      ),
      () => ({ status: "pending", message: "Holiday list imported as a DRAFT version with observed days applied. A second person publishes it." }),
    ),
  "calendar.check": async (fd, me) => {
    const code = need(fd, "id", "The calendar");
    const date = need(fd, "date", "A date");
    const days = num(fd, "days");
    const day = await J.isBusinessDay(code, date, me);
    if (!day.ok) return fail(day.error);
    const add = days ? await J.addBusinessDays(code, date, days, me) : null;
    if (add && !add.ok) return fail(add.error);
    return {
      status: "done",
      message: `${date} is ${day.data.is_business_day ? "a business day" : `not a business day (${day.data.reason}${day.data.holiday_name ? `: ${day.data.holiday_name}` : ""})`}${add && add.ok ? `; ${days} business day(s) later is ${add.data.result_date}` : ""}.`,
      details: [
        { label: "Calendar version", value: `${day.data.calendar.calendar_code} v${day.data.calendar.calendar_version}` },
        { label: "Content digest", value: short(day.data.calendar.content_digest) },
      ],
      table: add && add.ok && add.data.skipped?.length ? { headers: ["Skipped", "Why"], rows: add.data.skipped.map((s) => [s.date, s.name || s.reason]) } : undefined,
    };
  },
  "term.create": (fd, me) =>
    write(J.createPaymentTerm({ termCode: need(fd, "term_code", "A code").toUpperCase(), termName: need(fd, "term_name", "A name"), jurisdictionId: opt(fd, "jurisdiction_id") }, me), (t) =>
      done(`Payment term ${t.term_code} created. Add a version (its formula), then a second person approves it.`),
    ),
  "term.version": (fd, me) =>
    write(
      J.createPaymentTermVersion(
        need(fd, "id", "The term"),
        {
          basis_date_rule: need(fd, "basis_date_rule", "A basis date"),
          due_method: need(fd, "due_method", "A due method"),
          due_days: num(fd, "due_days"),
          due_day_of_month: num(fd, "due_day_of_month"),
          business_day_convention: need(fd, "business_day_convention", "A business-day convention"),
          calendar_code: opt(fd, "calendar_code"),
          grace_days: num(fd, "grace_days"),
          rationale: need(fd, "rationale", "A rationale"),
          source_ref: opt(fd, "source_ref"),
          effective_from: need(fd, "effective_from", "Effective from"),
        },
        me,
      ),
      (v) => ({ status: "pending", message: `Version ${v.version} (${v.formula_text}) is DRAFT. A second person approves it.` }),
    ),
  "term.decide": (fd, me) => {
    const step = need(fd, "step", "The step") as "approve" | "supersede" | "retire";
    const body = step === "supersede" ? { supersedes_version: num(fd, "supersedes_version") } : step === "retire" ? { reason: need(fd, "reason", "A reason"), ...(opt(fd, "ends_on") ? { ends_on: opt(fd, "ends_on") } : {}) } : undefined;
    return write(J.decidePaymentTermVersion(need(fd, "id", "The term"), num(fd, "version") ?? 0, step, body, me), () =>
      done(step === "approve" ? "Approved: the version is ACTIVE from its effective date." : step === "supersede" ? "The new version supersedes the old one." : "Retired."),
    );
  },
  "term.due": async (fd, me) => {
    const r = await J.dueDate(need(fd, "id", "The term"), { invoiceDate: need(fd, "invoice_date", "The invoice date"), receiptDate: opt(fd, "receipt_date"), deliveryDate: opt(fd, "delivery_date") }, true, me);
    if (!r.ok) return fail(r.error);
    const d = r.data;
    return {
      status: "done",
      message: `Due ${d.due_date}${d.adjusted ? ` (moved from ${d.unadjusted_due_date}, ${d.adjustment_convention.toLowerCase().replaceAll("_", " ")})` : ""}.`,
      details: [
        { label: "Term", value: `${d.term.term_code} v${d.term.term_version}: ${d.term.formula_text}` },
        { label: "Basis date", value: `${d.basis_date} (${d.basis_date_rule})` },
        { label: "Grace until", value: d.grace_until || "—" },
        { label: "Discount", value: d.discount ? `${d.discount.percent}% until ${d.discount.until}` : "—" },
      ],
      table: explanation(d.steps),
    };
  },
  "obligation.create": (fd, me) =>
    write(
      J.createObligationRule(
        {
          jurisdiction_id: need(fd, "jurisdiction_id", "The jurisdiction"),
          obligation_code: need(fd, "obligation_code", "An obligation code").toUpperCase(),
          name: need(fd, "name", "A name"),
          period_basis: need(fd, "period_basis", "A period basis"),
          anchor: need(fd, "anchor", "An anchor"),
          offset_months: num(fd, "offset_months") ?? 0,
          offset_days: num(fd, "offset_days") ?? 0,
          offset_to_month_end: text(fd, "offset_to_month_end") === "true",
          business_day_adjustment: need(fd, "business_day_adjustment", "A business-day adjustment"),
          calendar_code: opt(fd, "calendar_code") ?? "",
          effective_from: need(fd, "effective_from", "Effective from"),
          extension_allowed: false,
          cutoff_applies: false,
        },
        me,
      ),
      (o) => ({ status: "pending", message: `${o.obligation_code} v${o.rule_version} is DRAFT. Record its provenance, then a second person publishes it.` }),
    ),
  "obligation.provenance": (fd, me) =>
    write(J.setObligationProvenance(need(fd, "id", "The obligation rule"), { regimeId: opt(fd, "regime_id"), interpretationId: opt(fd, "interpretation_id"), sourceIds: list(fd, "source_ids") }, me), () => done("Provenance recorded.")),
  "obligation.publish": (fd, me) => write(J.publishObligationRule(need(fd, "id", "The obligation rule"), me), (o) => done(`${o.obligation_code} v${o.rule_version} is published.`)),

  // Rollouts and remediation
  "rollout.create": (fd, me) =>
    write(
      J.createRollout(
        { familyRef: need(fd, "family_ref", "A family ref"), displayName: need(fd, "display_name", "A name"), layer: need(fd, "layer", "A layer"), jurisdictionCode: opt(fd, "jurisdiction_code")?.toUpperCase(), scopeNote: need(fd, "scope_note", "A scope note"), owner: need(fd, "owner", "An owner"), supportOwner: opt(fd, "support_owner") },
        me,
      ),
      (r) => done(`Rollout ${r.display_name} is ${r.status}.`, [{ label: "Rollout id", value: r.rollout_id }]),
    ),
  "rollout.seed": (_fd, me) => write(J.seedRolloutPortfolio(me), () => done("The standard rollout portfolio is seeded (existing rollouts are left as they are).")),
  "rollout.owner": (fd, me) => write(J.setRolloutOwner(need(fd, "id", "The rollout"), { owner: need(fd, "owner", "An owner"), supportOwner: opt(fd, "support_owner") }, me), () => done("Owner recorded.")),
  "rollout.packs": (fd, me) => write(J.linkRolloutPacks(need(fd, "id", "The rollout"), list(fd, "pack_refs"), me), () => done("Packs linked to the rollout.")),
  "rollout.attest": (fd, me) =>
    write(J.attestRollout(need(fd, "id", "The rollout"), { checklist: need(fd, "checklist", "The checklist"), itemCode: need(fd, "item_code", "The item"), met: text(fd, "met") !== "false", evidenceRef: need(fd, "evidence_ref", "Evidence") }, me), () =>
      done("Checklist item attested with its evidence."),
    ),
  "rollout.expert": (fd, me) =>
    write(
      J.approveRolloutAsExpert(need(fd, "id", "The rollout"), { qualification: need(fd, "qualification", "Your qualification"), scope: need(fd, "scope", "The scope"), decision: need(fd, "decision", "A decision") as "APPROVE" | "REJECT", notes: text(fd, "notes") }, me),
      () => done("Expert decision recorded."),
    ),
  "rollout.transition": (fd, me) => write(J.transitionRollout(need(fd, "id", "The rollout"), need(fd, "to", "The new status"), need(fd, "reason", "A reason"), me), () => done("Rollout moved.")),
  "remediation.open": (fd, me) =>
    write(
      J.openRemediationCase({ packRef: need(fd, "pack_ref", "The pack"), version: need(fd, "version", "The version"), ring: opt(fd, "ring"), region: opt(fd, "region"), reason: need(fd, "reason", "A reason"), evidenceRef: need(fd, "evidence_ref", "Evidence") }, me),
      (c) => done(`Case opened with ${c.decisions_total} decision(s) to disposition.`, [{ label: "Case id", value: c.case_id }]),
    ),
  "remediation.disposition": (fd, me) =>
    write(
      J.recordDispositions(
        need(fd, "id", "The case"),
        [{ decision_id: need(fd, "decision_id", "The decision"), disposition: need(fd, "disposition", "A disposition"), evidence_ref: need(fd, "evidence_ref", "Evidence"), note: opt(fd, "note"), new_decision_id: opt(fd, "new_decision_id") }],
        me,
      ),
      (r) => done(r.recorded ? "Disposition recorded." : "That disposition was already recorded."),
    ),
  "remediation.close": (fd, me) => write(J.closeRemediationCase(need(fd, "id", "The case"), need(fd, "note", "A closing note"), me), () => done("Case closed.")),
};

/** "2026-12-25 Christmas Day" per line, or a JSON array of holidays. */
function parseHolidays(raw: string): J.Holiday[] {
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      return JSON.parse(raw) as J.Holiday[];
    } catch (e) {
      throw new FormProblem(`The holidays are not valid JSON: ${(e as Error).message}.`);
    }
  }
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(l);
      if (!m) throw new FormProblem(`"${l}" is not "YYYY-MM-DD Name".`);
      return { date: m[1], name: m[2] };
    });
}

export async function commandAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const me = await requireIdentity();
  if (!me) return EXPIRED;
  const handler = COMMANDS[text(fd, "command")];
  if (!handler) return { status: "error", message: "Unknown command." };
  try {
    return await handler(fd, me);
  } catch (e) {
    if (e instanceof FormProblem) return { status: "error", message: e.message };
    throw e;
  }
}
