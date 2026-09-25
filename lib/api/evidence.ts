// evidence-requirements-svc (:8130, /evidence-requirements-svc through the
// gateway) — the gate that decides whether the evidence required before an
// action may complete actually exists.
//
// Two halves. A catalog of effective-dated requirements, keyed on
// (domain_code, action_type), each saying what artifact must be present. And an
// evaluator that takes a list of asserted artifacts and answers SATISFIED,
// MISSING, or NO_REQUIREMENTS_DEFINED.
//
// THREE OUTCOMES, NOT TWO — and this is the whole point of the service. An empty
// requirement catalog is a legitimate data state, and reporting it as SATISFIED
// would make "nobody has configured this yet" indistinguishable from "verified
// complete". NO_REQUIREMENTS_DEFINED exists so a caller cannot mistake the first
// for the second, and the console never merges the two into a green tick.
//
// This is the strictest service in the suite about its own boundaries, and every
// one of these is a real behaviour rather than a claim:
//
//   - Catalog writes are authorization-gated against authorization-svc, and the
//     check fails CLOSED: an unreachable authorization-svc refuses the write.
//   - A missing X-Tenant-Id is a 400, never defaulted to a placeholder tenant.
//   - A missing X-Principal-Id is a 401.
//   - A body tenant_id that disagrees with the header is a 403, so a caller
//     cannot write into another tenant's catalog.
//   - Artifacts of type SUPPORTING_DOCUMENT are verified against
//     document-vault-svc, and an unreachable vault yields 503 rather than a
//     MISSING verdict — writing a false fact into an append-only ledger is worse
//     than admitting the determination could not be made.
//
// Evaluations are append-only records, so the gate's own decisions are auditable
// evidence too.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";
import { humanizeCode } from "../humanize";

export type EvidenceOutcome = "SATISFIED" | "MISSING" | "NO_REQUIREMENTS_DEFINED";

export type TenantIdentity = Identity & { tenantId: string };
export type WriteIdentity = Identity & { principalId: string; tenantId: string };

/** Wire shape. Field names match the Go json tags exactly. */
export type EvidenceRequirement = {
  evidence_requirement_id: string;
  tenant_id: string;
  /** null / absent means the requirement applies tenant-wide. */
  legal_entity_id?: string | null;
  domain_code: string;
  action_type: string;
  evidence_type: string;
  /** Sufficiency parameters as data — see RequirementSpec. */
  requirement_payload: unknown;
  effective_from: string;
  /** Set means retired. There is no delete route and no is_deleted flag. */
  effective_to?: string | null;
  created_at: string;
  created_by_principal_id: string;
  correlation_id: string;
};

/** The decoded shape of requirement_payload. Every field optional; a completely
 *  empty payload means "one artifact of this evidence_type must be present". */
export type RequirementSpec = {
  /** Absent or zero is treated as 1. */
  minimum_count?: number;
  /** When set, matching artifacts must also declare this subtype. */
  artifact_subtype?: string;
  /** Surfaced in the unmet reason, so a blocked caller learns what to produce. */
  description?: string;
};

export type UnmetRequirement = {
  evidence_requirement_id: string;
  evidence_type: string;
  /** Why this requirement did not count. Individually reported — a bare boolean
   *  is not explainable evidence. */
  reason: string;
};

export type EvidenceEvaluationResult = {
  evaluation_id: string;
  outcome: EvidenceOutcome;
  unmet: UnmetRequirement[] | null;
  evaluated_at: string;
  correlation_id: string;
};

/** The stored evaluation record, as returned by the lookup route. Carries the
 *  payloads frozen at decision time, so it stays truthful after the catalog
 *  changes underneath it. */
export type EvidenceEvaluation = {
  evaluation_id: string;
  tenant_id: string;
  legal_entity_id: string;
  domain_code: string;
  action_type: string;
  outcome: EvidenceOutcome;
  unmet_payload: unknown;
  present_artifacts_payload: unknown;
  evaluated_at: string;
  evaluated_for_principal_id: string;
  correlation_id: string;
};

/** One artifact the caller asserts exists. */
export type PresentArtifact = {
  evidence_type: string;
  /** For SUPPORTING_DOCUMENT this is a document-vault-svc document_id and IS
   *  verified. Other types are taken on the caller's word. */
  reference_id: string;
  artifact_subtype?: string;
};

/** The one evidence type whose references are verifiable against another
 *  service. Not a business constant — a reference-resolution rule. */
export const VERIFIED_EVIDENCE_TYPE = "SUPPORTING_DOCUMENT";

/** Evidence types the console offers when creating a requirement. Free-form data
 *  in the service — nothing there enumerates a permitted set. */
export const EVIDENCE_TYPES = [
  "SUPPORTING_DOCUMENT",
  "SIGNATURE",
  "APPROVAL_RECORD",
  "RECONCILIATION_PROOF",
  "THIRD_PARTY_CONFIRMATION",
] as const;

export type RequirementFilters = {
  /** Required by the service — 400 without it. */
  tenantId: string;
  legalEntityId?: string;
  domainCode?: string;
  actionType?: string;
  /**
   * "now" for currently-effective only, an RFC3339 instant for a point-in-time
   * view, or omitted for EVERYTHING including retired requirements.
   *
   * Omitted is the auditor's view and it is the console's default here: a
   * catalog listing that silently hid retired rows would misrepresent what the
   * gate used to require.
   */
  asOf?: string;
};

/**
 * The requirement catalog.
 *
 * Note the identity asymmetry: tenant_id is a QUERY PARAMETER here, not read
 * from the header, so this read is scoped by what the caller asks for. The
 * console always passes the session tenant.
 */
export async function listEvidenceRequirements(
  filters: RequirementFilters,
  identity: TenantIdentity,
): Promise<ApiResult<EvidenceRequirement[]>> {
  const result = await apiGet<EvidenceRequirement[]>(
    "evidence",
    "/v1/evidence-requirements/",
    {
      query: {
        tenant_id: filters.tenantId,
        legal_entity_id: filters.legalEntityId,
        domain_code: filters.domainCode,
        action_type: filters.actionType,
        as_of: filters.asOf,
      },
      identity,
    },
  );

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "evidence-requirements-svc returned a non-array requirement list",
      },
    };
  }

  // Effective-from descending, retired rows last — the order an operator reads
  // a catalog in. The service promises no ordering on this route.
  const sorted = [...result.data].sort((a, b) => {
    const retired = Number(Boolean(a.effective_to)) - Number(Boolean(b.effective_to));
    if (retired !== 0) return retired;
    return new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime();
  });
  return { ok: true, data: sorted };
}

/** One requirement by id. Requires the tenant header — a 400 means it never
 *  arrived, which is a different problem from a 404. */
export async function getEvidenceRequirement(
  requirementId: string,
  identity: TenantIdentity,
): Promise<ApiResult<EvidenceRequirement>> {
  return apiGet<EvidenceRequirement>(
    "evidence",
    `/v1/evidence-requirements/${encodeURIComponent(requirementId)}`,
    { identity },
  );
}

export type CreateRequirementInput = {
  identity: WriteIdentity;
  domainCode: string;
  actionType: string;
  evidenceType: string;
  /** Optional. Omitted means "one artifact of this type must be present". */
  spec?: RequirementSpec;
  /** Scope. Omit to apply the requirement tenant-wide, which also widens the
   *  authorization check to the tenant itself. */
  legalEntityId?: string;
  /** RFC3339. Defaults to now server-side when omitted. */
  effectiveFrom?: string;
  correlationId: string;
};

/**
 * Add a requirement to the catalog.
 *
 * Authorization-gated on EVIDENCE_REQUIREMENT_CREATE, checked against the legal
 * entity when the requirement is entity-scoped and against the tenant when it is
 * tenant-wide — the broader scope for the broader rule. The check fails closed.
 *
 * The body's tenant_id must equal the header's; the service answers 403
 * `tenant_scope_mismatch` otherwise, so this always sends the session tenant.
 */
export async function createEvidenceRequirement(
  input: CreateRequirementInput,
): Promise<ApiWriteResult<EvidenceRequirement>> {
  return apiPost<EvidenceRequirement>(
    "evidence",
    "/v1/admin/evidence-requirements/",
    {
      tenant_id: input.identity.tenantId,
      ...(input.legalEntityId ? { legal_entity_id: input.legalEntityId } : {}),
      domain_code: input.domainCode,
      action_type: input.actionType,
      evidence_type: input.evidenceType,
      ...(input.spec ? { requirement_payload: input.spec } : {}),
      ...(input.effectiveFrom ? { effective_from: input.effectiveFrom } : {}),
      correlation_id: input.correlationId,
    },
    { identity: input.identity, correlationId: input.correlationId },
  );
}

/**
 * Retire a requirement by end-dating it.
 *
 * There is no DELETE route and no soft-delete flag anywhere in this service —
 * retirement is effective end-dating, and the retired row stays readable so a
 * past evaluation remains explicable.
 *
 * A reason is mandatory. End-dating one that already carries an effective_to is
 * 422 `already_retired`, never a silent no-op.
 */
export async function retireEvidenceRequirement(input: {
  requirementId: string;
  identity: WriteIdentity;
  reason: string;
  /** RFC3339. Defaults to now server-side. */
  effectiveTo?: string;
}): Promise<ApiWriteResult<EvidenceRequirement>> {
  return apiPost<EvidenceRequirement>(
    "evidence",
    `/v1/admin/evidence-requirements/${encodeURIComponent(input.requirementId)}/end-date`,
    {
      reason: input.reason,
      ...(input.effectiveTo ? { effective_to: input.effectiveTo } : {}),
    },
    { identity: input.identity },
  );
}

export type EvaluateEvidenceInput = {
  identity: WriteIdentity;
  legalEntityId: string;
  domainCode: string;
  actionType: string;
  presentArtifacts: PresentArtifact[];
  /** Required. Also the replay key — a repeat evaluation returns the ORIGINAL
   *  determination rather than re-deciding against a changed catalog. */
  correlationId: string;
};

/**
 * Determine whether the required evidence exists.
 *
 * Always answers 200 on a completed determination — MISSING is a verdict, not an
 * error, so `ok: true` here does NOT mean the action may proceed. Read `outcome`.
 *
 * A replayed correlation_id returns the stored determination unchanged. That is
 * deliberate: the recorded decision must not be rewritten because the catalog
 * moved, so a replay can legitimately disagree with what a fresh evaluation
 * would now say.
 */
export async function evaluateEvidence(
  input: EvaluateEvidenceInput,
): Promise<ApiWriteResult<EvidenceEvaluationResult>> {
  return apiPost<EvidenceEvaluationResult>(
    "evidence",
    "/v1/evidence/evaluate",
    {
      legal_entity_id: input.legalEntityId,
      domain_code: input.domainCode,
      action_type: input.actionType,
      present_artifacts: input.presentArtifacts,
      correlation_id: input.correlationId,
    },
    { identity: input.identity, correlationId: input.correlationId },
  );
}

/** One stored evaluation by id. */
export async function getEvidenceEvaluation(
  evaluationId: string,
  identity: TenantIdentity,
): Promise<ApiResult<EvidenceEvaluation>> {
  return apiGet<EvidenceEvaluation>(
    "evidence",
    `/v1/evidence/evaluations/${encodeURIComponent(evaluationId)}`,
    { identity },
  );
}

// ─── Derived views ───────────────────────────────────────────────────────────

export type CatalogStats = {
  effective: number;
  retired: number;
  /** Distinct (domain_code, action_type) pairs the catalog gates. */
  gatedActions: number;
};

export function summariseCatalog(
  requirements: EvidenceRequirement[],
  now = Date.now(),
): CatalogStats {
  const actions = new Set<string>();
  let effective = 0;
  let retired = 0;

  for (const requirement of requirements) {
    actions.add(`${requirement.domain_code}::${requirement.action_type}`);
    const endsAt = requirement.effective_to
      ? new Date(requirement.effective_to).getTime()
      : null;
    if (endsAt !== null && endsAt <= now) retired += 1;
    else effective += 1;
  }

  return { effective, retired, gatedActions: actions.size };
}

/** Whether a requirement is in force right now. Retirement is a date, not a flag,
 *  so a future effective_to still counts as in force. */
export function isRequirementEffective(
  requirement: EvidenceRequirement,
  now = Date.now(),
): boolean {
  if (new Date(requirement.effective_from).getTime() > now) return false;
  if (!requirement.effective_to) return true;
  return new Date(requirement.effective_to).getTime() > now;
}

/** Decode requirement_payload defensively — it is free-form JSON in the column. */
export function readSpec(payload: unknown): RequirementSpec {
  if (typeof payload !== "object" || payload === null) return {};
  const spec = payload as RequirementSpec;
  return {
    minimum_count: typeof spec.minimum_count === "number" ? spec.minimum_count : undefined,
    artifact_subtype:
      typeof spec.artifact_subtype === "string" ? spec.artifact_subtype : undefined,
    description: typeof spec.description === "string" ? spec.description : undefined,
  };
}

// ─── Plain English ───────────────────────────────────────────────────────────
//
// The console's readers are the operators and auditors who run these gates, not
// the people who wrote the Go service. SUPPORTING_DOCUMENT, MISSING and
// NO_REQUIREMENTS_DEFINED are precise and unreadable, and an outcome nobody can
// read is an outcome nobody can act on.
//
// Two rules hold throughout, and both are about not overstating what we know:
//
//   - The stored code always travels with the label. Every describe*/explain*
//     result carries `raw`, and every call site renders it (see StoredAs) —
//     the plain wording is this console's reading of a record, and an auditor
//     citing that record needs the value the service actually holds.
//   - An unrecognised code never reads as a pass. A value this console has not
//     been taught could as easily mean "blocked", and for an evidence gate the
//     permissive guess is the one mistake with a real cost.

export type EvidenceTypeExplanation = {
  /** The type in prose, e.g. "Supporting document". */
  label: string;
  /** Plural form, for "Two supporting documents". */
  plural: string;
  /** One line on what this kind of evidence is. */
  meaning: string;
  /** Whether the platform checks the reference itself, or takes the caller's
   *  word for it. Only SUPPORTING_DOCUMENT is checked. */
  verified: boolean;
  raw: string;
};

const EVIDENCE_TYPE_COPY: Record<
  string,
  { label: string; plural: string; meaning: string }
> = {
  SUPPORTING_DOCUMENT: {
    label: "Supporting document",
    plural: "supporting documents",
    meaning:
      "A document that has to be on file in the document store. This is the only kind of evidence the platform checks for itself — it looks the document up rather than taking anyone's word that it exists.",
  },
  SIGNATURE: {
    label: "Signature",
    plural: "signatures",
    meaning: "A signature that has to have been captured before the action can go ahead.",
  },
  APPROVAL_RECORD: {
    label: "Approval record",
    plural: "approval records",
    meaning: "A record showing that someone with the authority to approve this actually did.",
  },
  RECONCILIATION_PROOF: {
    label: "Reconciliation proof",
    plural: "reconciliation proofs",
    meaning: "Evidence that the figures were reconciled and agreed before this went ahead.",
  },
  THIRD_PARTY_CONFIRMATION: {
    label: "Third-party confirmation",
    plural: "third-party confirmations",
    meaning: "Written confirmation from someone outside the business.",
  },
};

/**
 * What a kind of evidence is, and whether the platform verifies it.
 *
 * The second half is the part a reader cannot get from the code. Four of the
 * five types are recorded exactly as asserted — nothing looks them up — so a
 * requirement for a signature is satisfied by someone claiming a signature
 * exists. That is a real limit of the gate and the console says so rather than
 * letting a green tick imply more checking than happened.
 */
export function describeEvidenceType(evidenceType: string): EvidenceTypeExplanation {
  const stored = evidenceType?.trim() ?? "";
  const copy = EVIDENCE_TYPE_COPY[stored];
  const label = copy?.label || humanizeCode(stored) || stored;

  return {
    label,
    plural: copy?.plural || pluralise(label.toLowerCase()),
    meaning:
      copy?.meaning ??
      "This console has no description for this kind of evidence — it was added to the service after this page was written.",
    // Computed from the code, never from the copy table: an unrecognised type is
    // not verified, and must not be presented as though it were.
    verified: stored === VERIFIED_EVIDENCE_TYPE,
    raw: stored || "(empty)",
  };
}

/** The short label on its own, for a dropdown or a table cell. */
export function evidenceTypeLabel(evidenceType: string): string {
  return describeEvidenceType(evidenceType).label;
}

/** Business areas, as they are written rather than as they are stored.
 *  humanizeCode gets most of these right on its own; the ones here are the
 *  cases where it would abbreviate ("Commercial ops"). */
const DOMAIN_COPY: Record<string, string> = {
  COMMERCIAL_OPS: "Commercial operations",
  HR: "People",
};

/** A domain code as a business area a reader recognises. */
export function domainLabel(domainCode: string): string {
  const stored = domainCode?.trim() ?? "";
  return DOMAIN_COPY[stored] || humanizeCode(stored) || stored;
}

/** An action type as prose. Free-form in the service, so anything that is not
 *  an UPPER_SNAKE code comes back exactly as stored. */
export function actionLabel(actionType: string): string {
  const stored = actionType?.trim() ?? "";
  return humanizeCode(stored) || stored;
}

/** Small counts read as words; past that a numeral is clearer than "seventeen". */
const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

/** First letter up. The count words above are lower case because most of them
 *  land mid-sentence; the ones that open a sentence go through this. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Enough pluralisation for the evidence-type labels above and for an
 *  unrecognised type this console has never seen. */
function pluralise(noun: string): string {
  if (/(s|x|z|ch|sh)$/.test(noun)) return `${noun}es`;
  if (/[^aeiou]y$/.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}

/**
 * What a requirement demands, as a noun phrase.
 *
 * "Two supporting documents", "One approval record" — the thing that has to be
 * on file, not the row that says so. Used in the catalog table and in every
 * summary of a single requirement.
 */
export function describeRequirement(requirement: EvidenceRequirement): string {
  const spec = readSpec(requirement.requirement_payload);
  const type = describeEvidenceType(requirement.evidence_type);
  const count = spec.minimum_count && spec.minimum_count > 0 ? spec.minimum_count : 1;

  const noun = count === 1 ? type.label.toLowerCase() : type.plural;
  const phrase = `${countWord(count)} ${noun}`;
  const subtype = spec.artifact_subtype ? `, of the kind “${humanizeCode(spec.artifact_subtype)}”` : "";

  // Sentence case on the count word, which is the first thing in the phrase.
  return capitalise(phrase) + subtype;
}

/** The same requirement as a full sentence, for a summary with room for one. */
export function describeRequirementRule(requirement: EvidenceRequirement): string {
  return `${describeRequirement(requirement)} must be on file before ${actionLabel(
    requirement.action_type,
  ).toLowerCase()} can go ahead in ${domainLabel(requirement.domain_code)}.`;
}

export type RequirementScope = { label: string; meaning: string };

/** Who a requirement applies to. A null legal_entity_id is meaningful: the
 *  requirement is tenant-wide. */
export function describeRequirementScope(requirement: {
  legal_entity_id?: string | null;
}): RequirementScope {
  if (requirement.legal_entity_id) {
    return {
      label: "One company only",
      meaning:
        "It gates this action for a single company. Other companies in the group are unaffected by it.",
    };
  }
  return {
    label: "Every company",
    meaning:
      "It gates this action for every company in the group. Because it is that broad, permission to create it is checked against the whole business rather than one company.",
  };
}

export type RequirementStatus = {
  label: string;
  meaning: string;
  tone: "success" | "warning" | "neutral" | "info";
  /** True only while the requirement is actually gating anything. */
  inForce: boolean;
};

/**
 * Whether a requirement is gating anything right now.
 *
 * Three states, not two. Retirement here is a date rather than a flag, so a
 * requirement can be written but not started yet, in force, or ended — and a
 * future end date is still in force today. "Retired" alone would collapse the
 * first and the last, which are opposite situations.
 */
export function describeRequirementStatus(
  requirement: EvidenceRequirement,
  now = Date.now(),
): RequirementStatus {
  const startsAt = new Date(requirement.effective_from).getTime();
  const endsAt = requirement.effective_to ? new Date(requirement.effective_to).getTime() : null;

  if (endsAt !== null && endsAt <= now) {
    return {
      label: "No longer in force",
      meaning:
        "This has been withdrawn and gates nothing now. It is kept, rather than deleted, so that decisions made while it applied can still be explained.",
      tone: "neutral",
      inForce: false,
    };
  }

  if (Number.isFinite(startsAt) && startsAt > now) {
    return {
      label: "Not started yet",
      meaning:
        "This is dated to begin in the future and gates nothing until then. An action checked today is not held to it.",
      tone: "info",
      inForce: false,
    };
  }

  if (endsAt !== null) {
    return {
      label: "In force, ending soon",
      meaning: "This is gating the action now, and is dated to stop doing so.",
      tone: "warning",
      inForce: true,
    };
  }

  return {
    label: "In force",
    meaning: "This is gating the action now, with no end date set.",
    tone: "success",
    inForce: true,
  };
}

export type OutcomeKind = "satisfied" | "missing" | "none-defined" | "unrecognised";

export type OutcomeExplanation = {
  /** The answer in one line. */
  headline: string;
  /** What that answer means for whoever asked. */
  meaning: string;
  /** Two or three words, for a badge. */
  shortLabel: string;
  tone: "success" | "danger" | "warning";
  kind: OutcomeKind;
  raw: string;
};

/**
 * What an evaluation actually decided.
 *
 * The three outcomes are the reason this service exists, and the middle one is
 * the reason it has three instead of two. An empty catalog is a legitimate data
 * state, and "nobody has set this up" must not read like "checked and complete"
 * — so it is amber here and the wording says the action is ungated rather than
 * approved.
 *
 * MISSING is the other one worth wording carefully: it is not an error and it
 * is not a refusal by the platform, it is a block with a fix, so the copy points
 * at what to produce rather than just reporting a failure.
 */
export function explainEvidenceOutcome(
  outcome: string,
  unmetCount = 0,
): OutcomeExplanation {
  const stored = outcome?.trim() ?? "";

  if (stored === "SATISFIED") {
    return {
      headline: "Everything required is on file",
      meaning:
        "Every requirement that applies to this action was matched by the evidence supplied, so it can go ahead. Bear in mind that only documents are looked up by the platform — other kinds of evidence are recorded as asserted.",
      shortLabel: "Can go ahead",
      tone: "success",
      kind: "satisfied",
      raw: stored,
    };
  }

  if (stored === "MISSING") {
    const items =
      unmetCount === 1
        ? "One requirement was not met"
        : `${capitalise(countWord(unmetCount))} requirements were not met`;
    return {
      headline:
        unmetCount > 0
          ? `${items} — this action must not go ahead`
          : "Something required is not on file — this action must not go ahead",
      meaning:
        "This is a block with a fix, not a refusal: produce the evidence listed below and check again. Nothing here has been rejected on its merits.",
      shortLabel: "Must be blocked",
      tone: "danger",
      kind: "missing",
      raw: stored,
    };
  }

  if (stored === "NO_REQUIREMENTS_DEFINED") {
    return {
      headline: "Nothing has been set up to check",
      meaning:
        "No requirements exist for this action, so nothing was checked. This is not approval — the action is simply not being gated at all. If it ought to be, add a requirement for it.",
      shortLabel: "Not being checked",
      tone: "warning",
      kind: "none-defined",
      raw: stored,
    };
  }

  return {
    headline: "The answer is not one this console recognises",
    meaning:
      `The service answered “${stored || "(empty)"}”, which this console has not been taught to read. ` +
      "It is deliberately not being treated as a pass — check with whoever operates this service before letting the action go ahead.",
    shortLabel: "Needs checking",
    tone: "warning",
    kind: "unrecognised",
    raw: stored || "(empty)",
  };
}

/**
 * Decode the unmet list frozen on a stored evaluation.
 *
 * `unmet_payload` is a jsonb column, so it arrives as `unknown` and an empty
 * array and a null are both legitimate. Anything that is not a usable entry is
 * dropped rather than rendered half-formed — but the raw payload stays on screen
 * under a disclosure, so a dropped entry is still discoverable.
 */
export function readUnmet(payload: unknown): UnmetRequirement[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const entry = item as Partial<UnmetRequirement>;
    if (typeof entry.reason !== "string") return [];
    return [
      {
        evidence_requirement_id: String(entry.evidence_requirement_id ?? ""),
        evidence_type: String(entry.evidence_type ?? ""),
        reason: entry.reason,
      },
    ];
  });
}

/** Decode the artifacts the caller asserted, as frozen at decision time. */
export function readPresentArtifacts(payload: unknown): PresentArtifact[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const entry = item as Partial<PresentArtifact>;
    if (typeof entry.reference_id !== "string") return [];
    return [
      {
        evidence_type: String(entry.evidence_type ?? ""),
        reference_id: entry.reference_id,
        ...(typeof entry.artifact_subtype === "string"
          ? { artifact_subtype: entry.artifact_subtype }
          : {}),
      },
    ];
  });
}

export type UnmetExplanation = {
  /** What was required against what turned up, in one line. */
  headline: string;
  /** Why something that WAS offered did not count. */
  rejected?: string;
  /** The catalog's own note on what to produce — written by whoever created the
   *  requirement, for exactly this moment. */
  description?: string;
  /** The requirement is unusable rather than unmet. */
  unreadable?: boolean;
  /** The service's own wording, kept so nothing is lost in translation. */
  raw: string;
};

/**
 * One unmet requirement, taken apart into its pieces.
 *
 * The service composes this into a single string for a blocked machine caller:
 *
 *     requires 2 matching artifact(s), 1 present (artifact_subtype "X"); an
 *     offered artifact did not count: …; <description>
 *
 * Precise, and unreadable to the person who has to go and produce the evidence.
 * Pulled apart it becomes a shortfall, a reason something was rejected, and the
 * catalog's own instruction — three different facts that were only ever joined
 * by semicolons.
 *
 * Parsing a message rather than reading fields is a real coupling to the
 * service's wording, so it fails soft: anything that does not match comes back
 * whole as the headline, which is no worse than what this replaced.
 */
export function explainUnmetReason(reason: string, evidenceType: string): UnmetExplanation {
  const raw = reason?.trim() ?? "";

  if (raw.includes("payload is unreadable")) {
    return {
      headline:
        "This requirement cannot be checked at all — what it asks for was not recorded in a usable form.",
      unreadable: true,
      raw,
    };
  }

  const counts = /^requires (\d+) matching artifact\(s\), (\d+) present/.exec(raw);
  if (!counts) return { headline: raw, raw };

  const required = Number(counts[1]);
  const present = Number(counts[2]);
  let rest = raw.slice(counts[0].length);

  // The subtype, when the requirement names one. Consumed rather than shown as
  // a code — it is already part of what the requirement asks for.
  let subtype: string | undefined;
  const subtypeMatch = /^ \(artifact_subtype "([^"]*)"\)/.exec(rest);
  if (subtypeMatch) {
    subtype = subtypeMatch[1];
    rest = rest.slice(subtypeMatch[0].length);
  }

  // `rejected` is one of two fixed phrases in the service and contains no
  // semicolon, so the first one after it ends the segment. A description is
  // free text and comes last, so it keeps whatever punctuation it was given.
  let rejected: string | undefined;
  const REJECT_MARKER = "; an offered artifact did not count: ";
  if (rest.startsWith(REJECT_MARKER)) {
    rest = rest.slice(REJECT_MARKER.length);
    const end = rest.indexOf("; ");
    rejected = (end === -1 ? rest : rest.slice(0, end)).trim();
    rest = end === -1 ? "" : rest.slice(end);
  }

  const description = rest.startsWith("; ") ? rest.slice(2).trim() : undefined;

  const type = describeEvidenceType(evidenceType);
  const noun = required === 1 ? type.label.toLowerCase() : type.plural;
  const qualifier = subtype ? ` of the kind “${humanizeCode(subtype)}”` : "";
  const supplied = present === 0 ? "none" : countWord(present);
  const headline = `${countWord(required)} ${noun}${qualifier} required, ${supplied} supplied`;

  return {
    headline: capitalise(headline),
    rejected: rejected ? explainRejection(rejected) : undefined,
    description,
    raw,
  };
}

/** The two reasons the service gives for discounting an artifact that was
 *  offered, without naming the service that did the looking. */
function explainRejection(rejected: string): string {
  if (rejected.includes("does not exist")) {
    return "A document was listed, but no such document is on file — so it does not count towards this.";
  }
  if (rejected.includes("different tenant or legal entity")) {
    return "A document was listed, but it belongs to another company — so it does not count towards this.";
  }
  return rejected;
}

/**
 * Turn a backend failure into something an operator can act on.
 *
 * These say what happened and what to do about it, in the reader's terms. Two
 * distinctions are kept because they change what the reader should do next:
 *
 *   - "You are not allowed to" versus "we could not check whether you are
 *     allowed to". Both stop the write, but the first needs a permission change
 *     and the second needs someone to look at an outage.
 *   - "The evidence is missing" versus "we could not find out". This service
 *     refuses to answer when it cannot verify, rather than reporting evidence
 *     as absent on the strength of an outage — the record it writes is permanent,
 *     so a wrong entry in it is worse than no entry.
 *
 * Internal service names and error codes stay out of the wording. The exact code
 * is still on screen wherever one is available, under the humanised label.
 */
export function explainEvidenceError(message: string): string {
  if (message.includes("authorization_denied")) {
    return "You do not have permission to do this. A requirement that covers every company is checked against the whole business, so it needs broader permission than one covering a single company.";
  }
  if (message.includes("authorization_service_unavailable")) {
    return "Your permission to do this could not be checked, so nothing was saved. That is a deliberate refusal rather than a denial — the service that grants permissions is unreachable, and it will not proceed without an answer. Try again shortly, and report it if it persists.";
  }
  if (message.includes("tenant_scope_mismatch")) {
    return "This request tried to write into a different business's records, so it was refused. Sign out and back in; if it happens again, report it.";
  }
  if (message.includes("missing_tenant")) {
    return "The request did not say which business it was for, so it was refused rather than guessed at. Sign out and back in.";
  }
  if (message.includes("identity_missing")) {
    return "The request did not say who was making it, so it was refused. Sign in again.";
  }
  if (message.includes("already_retired")) {
    return "This requirement has already been withdrawn. Nothing has changed, and the original withdrawal date still stands — you are told rather than left to assume this second attempt did something.";
  }
  if (message.includes("requirement_not_found")) {
    return "There is no requirement with that reference. Check it against the catalog above — references are exact, and one belonging to another business reads the same as one that does not exist.";
  }
  if (message.includes("evaluation_not_found")) {
    return "There is no past check with that reference. Check it against the reference returned when the check was run.";
  }
  if (message.includes("document_service_unavailable")) {
    return "The documents you listed could not be looked up, so no answer was given. This is deliberate: recording evidence as missing because of an outage would put something untrue into a permanent record. Try again once the document store is reachable.";
  }
  if (message.includes("as_of")) {
    return "The date to check against could not be read. Use a full date and time, or leave it as “now”.";
  }
  if (message.includes("missing_field")) {
    const field = message.split("missing_field").pop()?.trim();
    return field
      ? `A required field was left empty: ${humanizeCode(field.replace(/[^A-Za-z0-9_]/g, " ").trim()) || field}.`
      : "A required field was left empty — check the form above.";
  }
  if (message.includes("store_unavailable")) {
    return "The service could not reach its records, so nothing was saved. Try again shortly, and report it if it persists.";
  }
  return message;
}
