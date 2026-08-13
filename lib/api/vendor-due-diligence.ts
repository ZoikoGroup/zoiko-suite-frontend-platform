// vendor-due-diligence-svc (:8135, /vendor-due-diligence-svc through the gateway)
// — the screening that runs on a counterparty before commercial exposure to it.
//
// ONE THING MATTERS MORE THAN ANYTHING ELSE HERE, so it is at the top.
//
// **A CLEAR outcome from this service is not a sanctions clearance.** The only
// screening implemented is an exact, case-insensitive match against a hardcoded
// list of two names. There is no sanctions or watchlist feed on this platform to
// call — external-data-feed-svc carries MARKET_DATA, CREDIT_SCORE, COMPANY_INFO,
// FX_RATE, and ESG_DATA and nothing else — so the stub is not a shortcut around a
// real integration, it is standing in for one that does not exist. Because the
// match is exact, "Acme Sanctioned Holdings Ltd" screens CLEAR while "Acme
// Sanctioned Holdings" is flagged.
//
// Rendering CLEAR as a green "cleared" badge would therefore report an
// effectively unscreened vendor as a screened one that passed. That is the same
// defect class as reading spend-controls' `no_policy_configured` as an approval,
// or evidence-requirements' `NO_REQUIREMENTS_DEFINED` as a pass — and it is worse
// here, because the thing being asserted is that a counterparty is not sanctioned.
//
// The service puts `screening_source` on the wire precisely so a consumer does not
// have to know any of this by convention. readCheck() below is the only place the
// console decides how an outcome reads, and it refuses to call a stub-screened
// CLEAR a clearance.
//
// The four readings, none of which collapse into pass/fail:
//
//   COMPLETED / CLEAR    screening ran and matched nothing  -> `screened-no-match`
//   COMPLETED / FLAGGED  screening ran and matched          -> `flagged`
//   STARTED   / -        recorded, never concluded          -> `unconcluded`
//   FAILED    / -        could not be concluded, and says so-> `failed`
//
// STARTED is not "in progress": the screening is synchronous, so a row still in
// STARTED is one whose conclusion was lost. It carries no risk outcome and must
// never read as clean.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type CheckStatus = "STARTED" | "COMPLETED" | "FAILED";
export type RiskOutcome = "CLEAR" | "FLAGGED";

/** The only screening implemented. A second value here would mean a real feed
 *  exists; until then every concluded check carries this one. */
export const STUB_DENYLIST = "STUB_DENYLIST";

/** Wire shape. Field names match the Go json tags exactly. */
export type VendorCheck = {
  check_id: string;
  tenant_id: string;
  legal_entity_id: string;
  counterparty_id: string;
  vendor_name: string;
  status: CheckStatus;
  /** Absent until the check concludes, and absent on FAILED. */
  risk_outcome?: RiskOutcome;
  /** Human-readable reason, populated whether or not there was a match. */
  screening_basis?: string;
  /** What did the screening. See the module comment — this is the field that
   *  stops CLEAR being read as a clearance. */
  screening_source?: string;
  correlation_id?: string;
  initiated_by_principal_id: string;
  started_at: string;
  completed_at?: string;
};

export type VendorEvidence = {
  evidence_id: string;
  check_id: string;
  tenant_id: string;
  evidence_type: string;
  description: string;
  /** Optional pointer to a document held elsewhere. Absent rather than empty:
   *  the column stored "" for every row until the write path accepted one. */
  document_reference?: string;
  recorded_at: string;
};

export type VendorCheckDetail = {
  check: VendorCheck;
  evidence: VendorEvidence[];
  /** True when this response resolved an already-processed correlation_id rather
   *  than running a new check. Reported on the body and not left to be inferred
   *  from 200-vs-201, because a replay can resolve to a check an earlier attempt
   *  abandoned in STARTED. */
  replayed?: boolean;
};

// ─── Reads ───────────────────────────────────────────────────────────────────

export type ListChecksInput = {
  identity: Identity & { tenantId: string };
  legalEntityId?: string;
  counterpartyId?: string;
  limit?: number;
  offset?: number;
};

/**
 * List screening checks for the caller's tenant, newest first.
 *
 * Both filters are applied by the service and compose with AND. Authorization is
 * checked on this route even with no filter — the tenant is the scope when no
 * entity is named — so a principal without VENDOR_DD_VIEW gets 403 rather than a
 * list. It did not used to be: omitting `legal_entity_id` skipped the
 * authorization call entirely and returned the tenant's whole screening history,
 * including which vendors were flagged.
 *
 * Returns a bare JSON array, not an envelope. Checked rather than assumed —
 * `listPurchaseOrders` read `d.purchase_orders ?? []` against a service that
 * returns a bare array, so it was always empty and a fallback substituted invented
 * rows in its place.
 *
 * Note both filters are VARCHAR columns in this service, not uuid ones as in
 * purchase-order-svc and purchase-request-svc. A malformed filter therefore
 * matches nothing rather than dying in the Postgres driver as a 503, so it needs
 * no UUID pre-check to avoid one — the empty register is the honest answer.
 */
export async function listVendorChecks(
  input: ListChecksInput,
): Promise<ApiResult<VendorCheck[]>> {
  const result = await apiGet<VendorCheck[] | null>("vendorDueDiligence", "/v1/vendor-checks/", {
    query: {
      legal_entity_id: input.legalEntityId,
      counterparty_id: input.counterpartyId,
      limit: input.limit,
      offset: input.offset,
    },
    identity: input.identity,
  });

  if (!result.ok) return result;
  if (result.data === null) return { ok: true, data: [] };
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "vendor-due-diligence-svc returned a non-array check list",
      },
    };
  }
  return { ok: true, data: result.data };
}

/** One check with the evidence gathered for it. */
export async function getVendorCheck(
  checkId: string,
  identity: Identity & { tenantId: string },
): Promise<ApiResult<VendorCheckDetail>> {
  return apiGet<VendorCheckDetail>("vendorDueDiligence", `/v1/vendor-checks/${checkId}`, {
    identity,
  });
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export type StartCheckInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  counterpartyId: string;
  vendorName: string;
  /** Optional pointer to supporting material held elsewhere, recorded on the
   *  evidence row. */
  documentReference?: string;
  /** Idempotency key. The service replays the stored check for a repeat, so a
   *  retry cannot record a second screening of the same request. */
  correlationId: string;
};

/**
 * Screen a counterparty and record the result with its evidence.
 *
 * Synchronous: the check is started, screened, and concluded in one request, so
 * 201 carries a finished outcome rather than a job id. 200 means the service
 * recognised the correlation id and replayed what is already on record.
 *
 * The outcome and the evidence supporting it are written in one transaction — a
 * conclusion cannot outlive its evidence. When that transaction fails the service
 * answers 503, marks the check FAILED, and publishes `vendor.dd.failed`; it does
 * not report a result it did not record.
 *
 * 409 means another request concluded this check first. The outcome stands; read
 * it back rather than re-running.
 */
export async function startVendorCheck(
  input: StartCheckInput,
): Promise<ApiWriteResult<VendorCheckDetail>> {
  return apiPost<VendorCheckDetail>(
    "vendorDueDiligence",
    "/v1/vendor-checks/",
    {
      counterparty_id: input.counterpartyId,
      legal_entity_id: input.identity.legalEntityId,
      vendor_name: input.vendorName,
      correlation_id: input.correlationId,
      // Omitted rather than sent empty: the service rejects unknown fields and
      // stores an absent reference as NULL, so an empty string would record a
      // pointer to nothing.
      ...(input.documentReference ? { document_reference: input.documentReference } : {}),
    },
    { identity: input.identity },
  );
}

// ─── Readings ────────────────────────────────────────────────────────────────

/**
 * How a check should READ, as distinct from what it says.
 *
 * `screened-no-match` is deliberately not called "clear" or "passed". See the
 * module comment: the only screening is a two-name denylist, so the honest claim
 * is "we looked and found nothing", not "this vendor is clear".
 */
export type CheckReading = "screened-no-match" | "flagged" | "unconcluded" | "failed";

export function readCheck(check: VendorCheck): CheckReading {
  if (check.status === "FAILED") return "failed";
  // A COMPLETED check with no risk outcome should be impossible — the 000002 CHECK
  // constraint forbids it — but treating it as unconcluded rather than as clean is
  // the safe reading if one ever appears.
  if (check.status !== "COMPLETED" || !check.risk_outcome) return "unconcluded";
  return check.risk_outcome === "FLAGGED" ? "flagged" : "screened-no-match";
}

/** True when this outcome came from the stub denylist rather than a real feed. */
export function isStubScreened(check: VendorCheck): boolean {
  return check.screening_source === STUB_DENYLIST;
}

/**
 * Whether a check answers the question "has this counterparty been screened?"
 *
 * Only `flagged` is a finding. `screened-no-match` is the absence of a finding
 * from a screening that barely looked — useful, recorded, and not the same thing
 * as an approval.
 */
export function isFinding(check: VendorCheck): boolean {
  return readCheck(check) === "flagged";
}

export type VendorCheckStats = {
  total: number;
  flagged: number;
  screenedNoMatch: number;
  /** STARTED plus FAILED. Both mean there is no outcome for that counterparty,
   *  which is the number worth surfacing — a register that only counted flags
   *  would present a lost screening as a quiet pass. */
  withoutOutcome: number;
  /** Distinct counterparties that have at least one FLAGGED check. */
  flaggedCounterparties: number;
};

export function summariseVendorChecks(checks: VendorCheck[]): VendorCheckStats {
  const flaggedCounterparties = new Set<string>();
  const stats: VendorCheckStats = {
    total: checks.length,
    flagged: 0,
    screenedNoMatch: 0,
    withoutOutcome: 0,
    flaggedCounterparties: 0,
  };

  for (const check of checks) {
    switch (readCheck(check)) {
      case "flagged":
        stats.flagged += 1;
        flaggedCounterparties.add(check.counterparty_id);
        break;
      case "screened-no-match":
        stats.screenedNoMatch += 1;
        break;
      default:
        stats.withoutOutcome += 1;
    }
  }

  stats.flaggedCounterparties = flaggedCounterparties.size;
  return stats;
}

/**
 * The latest check per counterparty.
 *
 * A counterparty can be screened repeatedly, and the register lists every run —
 * that history is the audit trail. But "is this counterparty flagged?" is answered
 * by its most recent concluded check, not by whether any check ever flagged it.
 * Unconcluded runs are skipped for this purpose: a lost screening does not
 * supersede the answer that came before it, and treating it as though it did would
 * turn an infrastructure blip into a vendor changing status.
 *
 * `checks` is expected newest-first, as the service returns it.
 */
export function latestConcludedPerCounterparty(checks: VendorCheck[]): Map<string, VendorCheck> {
  const latest = new Map<string, VendorCheck>();
  for (const check of checks) {
    if (!latest.has(check.counterparty_id) && check.status === "COMPLETED") {
      latest.set(check.counterparty_id, check);
    }
  }
  return latest;
}

/** Turn a backend failure into something an operator can act on. */
export function explainVendorDDError(message: string): string {
  if (message.includes("check_already_concluded")) {
    return "Another request concluded this check first, so this attempt changed nothing. The outcome that was recorded stands — read the check back rather than re-running it. Re-running would not overwrite it either: a concluded check refuses a second conclusion, which is what stops a FLAGGED result being replaced with CLEAR.";
  }
  if (message.includes("forbidden")) {
    return "Authorization denied — this principal does not hold the required permission on this legal entity. Starting a screening (VENDOR_DD_INITIATE) and reading the register (VENDOR_DD_VIEW) are separate grants, so holding one does not imply the other.";
  }
  if (message.includes("authz_unavailable")) {
    return "Could not verify authorization, so the action was refused. authorization-svc is unreachable — this is a fail-closed refusal, not a denial.";
  }
  if (message.includes("identity_missing")) {
    return "No caller identity or tenant scope reached the service, so it failed closed. Sign in again.";
  }
  if (message.includes("invalid_limit") || message.includes("invalid_offset")) {
    return "The page parameters were out of range. limit must be between 1 and 200; offset must not be negative.";
  }
  if (message.includes("missing_fields")) {
    return "A required field was empty or blank: counterparty_id, legal_entity_id, vendor_name, and correlation_id are all required. A whitespace-only vendor name is refused rather than screened — it would otherwise match nothing on the denylist and conclude CLEAR, producing a clean due-diligence result for a vendor with no name.";
  }
  if (message.includes("unknown_field")) {
    return `The service refused a field it does not recognise: ${message.split("unknown field").pop()?.replace(/["}{]/g, "").trim() || "check the payload"}. Unknown fields are rejected rather than ignored, so a misspelled key cannot produce a record that silently lacks the value you thought you sent.`;
  }
  if (message.includes("request_too_large")) {
    return "The request body was larger than the service accepts (64 KiB). Nothing was written.";
  }
  if (message.includes("invalid_json")) {
    return "The service could not parse the request body.";
  }
  if (message.includes("check_not_found")) {
    return "No check with that id exists for this tenant. Row-level security hides another tenant's check the same way, so both read as not found.";
  }
  if (message.includes("store_unavailable")) {
    return "vendor-due-diligence-svc could not record the screening outcome, so there is NO due diligence result — the screening ran but its conclusion and evidence were not written. The check is marked FAILED and a vendor.dd.failed event is published. Do not treat the counterparty as screened; run the check again.";
  }
  return message;
}
