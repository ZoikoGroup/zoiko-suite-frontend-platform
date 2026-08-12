// spend-controls-svc (:8131, /spend-controls-svc through the gateway) — the limit
// that sits across procurement: what an entity may spend on a category, and
// whether a proposed spend fits inside it.
//
// A spend check is a DECISION, not a write, and it has four readings the console
// must keep apart. Collapsing them is the whole risk here:
//
//   ALLOWED / within_threshold     a policy was evaluated and it fits
//   ALLOWED / no_policy_configured nothing was evaluated, because no limit exists
//   BLOCKED / threshold_exceeded   a policy was evaluated and it refuses
//   422 currency_mismatch          the policy is in another currency, so the two
//                                  amounts cannot be compared at all
//
// The second is the dangerous one. It answers 200 ALLOWED like a pass, but no
// control was applied — reading it as "approved" would report an ungoverned
// category as a governed one that agreed. It renders neutral, never green.
//
// A refusal is not a failure either: BLOCKED means the control did its job, so it
// renders as a refusal rather than as an error.

import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

/** The enforcement window. PER_TRANSACTION judges each spend alone; the other
 *  two accumulate over the calendar month or year, in UTC. */
export type SpendPeriod = "PER_TRANSACTION" | "MONTHLY" | "ANNUAL";

export const SPEND_PERIODS: SpendPeriod[] = ["PER_TRANSACTION", "MONTHLY", "ANNUAL"];

export type SpendDecisionOutcome = "ALLOWED" | "BLOCKED";

/** Wire shape. Field names match the Go json tags exactly. */
export type SpendPolicy = {
  spend_policy_id: string;
  tenant_id: string;
  legal_entity_id: string;
  category: string;
  period: SpendPeriod;
  threshold_amount: number;
  currency_code: string;
  active_flag: boolean;
  created_by_principal_id: string;
  created_at: string;
  updated_at: string;
};

export type SpendConsumption = {
  consumption_id: string;
  tenant_id: string;
  legal_entity_id: string;
  spend_policy_id: string;
  amount: number;
  currency_code: string;
  source_reference?: string;
  correlation_id: string;
  /** BLOCKED rows are refused attempts, kept for audit and excluded from the
   *  running total. Before the service recorded them they existed only as Kafka
   *  events, so a refusal left no queryable trace. */
  decision_outcome: SpendDecisionOutcome;
  recorded_by_principal_id: string;
  recorded_at: string;
};

export type SpendCheckDecision = {
  decision_outcome: SpendDecisionOutcome;
  decision_basis: string;
  spend_policy_id?: string;
  prior_consumption: number;
  threshold_amount?: number;
  consumption_id?: string;
  /** Prior consumption plus this attempt — the number the threshold was compared
   *  against, so a refusal does not leave the reader adding up its own figures. */
  projected_total: number;
  currency_code?: string;
  /** A retry replaying a stored decision. Not a second spend against the budget. */
  replayed: boolean;
};

export type ListPoliciesInput = {
  identity: Identity & { tenantId: string };
  legalEntityId?: string;
  category?: string;
  /**
   * Include withdrawn and superseded limits. Defaults to false — only what is
   * actually in force.
   *
   * This matters because `active_flag` was, until recently, written TRUE on create
   * and never changed: a category could carry several "active" limits of which
   * exactly one was enforced, and a register listing them all showed limits that
   * were not in force beside the one that was.
   */
  includeInactive?: boolean;
};

/**
 * List spend policies for the caller's tenant, newest first.
 *
 * Both filters are applied by the service and compose with AND. Authorization is
 * checked on this route even with no filter — the tenant is the scope when no
 * entity is named — so a principal without SPEND_POLICY_VIEW gets 403 rather than
 * a list.
 */
export async function listSpendPolicies(
  input: ListPoliciesInput,
): Promise<ApiResult<SpendPolicy[]>> {
  const result = await apiGet<SpendPolicy[] | null>("spendControls", "/v1/spend-policies/", {
    query: {
      legal_entity_id: input.legalEntityId,
      category: input.category,
      // The service defaults to active-only; `active=false` widens it. Sent only
      // when widening, so the default path carries no redundant parameter.
      ...(input.includeInactive ? { active: "false" } : {}),
    },
    identity: input.identity,
  });

  if (!result.ok) return result;
  if (result.data === null) return { ok: true, data: [] };
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "spend-controls-svc returned a non-array policy list" },
    };
  }
  return { ok: true, data: result.data };
}

export type ListConsumptionsInput = {
  identity: Identity & { tenantId: string };
  legalEntityId?: string;
  spendPolicyId?: string;
};

/** List recorded spend against policies, newest first. Includes refused attempts. */
export async function listSpendConsumptions(
  input: ListConsumptionsInput,
): Promise<ApiResult<SpendConsumption[]>> {
  const result = await apiGet<SpendConsumption[] | null>(
    "spendControls",
    "/v1/spend-consumptions/",
    {
      query: {
        legal_entity_id: input.legalEntityId,
        spend_policy_id: input.spendPolicyId,
      },
      identity: input.identity,
    },
  );

  if (!result.ok) return result;
  if (result.data === null) return { ok: true, data: [] };
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "spend-controls-svc returned a non-array consumption list",
      },
    };
  }
  return { ok: true, data: result.data };
}

export type CreatePolicyInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  category: string;
  period: SpendPeriod;
  thresholdAmount: number;
  currencyCode: string;
};

/**
 * Set a spend limit. Lands active immediately and constrains every later check
 * against the same entity and category.
 *
 * There is no update route: creating a second policy for the same entity and
 * category **supersedes** the first, which the service does in the same
 * transaction as the insert and reports as `superseded`. The older row stays but is
 * no longer active, so the history of what the limit used to be survives without
 * it being presented as still in force.
 *
 * To remove a limit entirely rather than replace it, see deactivateSpendPolicy.
 */
export async function createSpendPolicy(
  input: CreatePolicyInput,
): Promise<ApiWriteResult<SpendPolicy & { superseded: number }>> {
  return apiPost<SpendPolicy & { superseded: number }>(
    "spendControls",
    "/v1/spend-policies/",
    {
      legal_entity_id: input.identity.legalEntityId,
      category: input.category,
      period: input.period,
      threshold_amount: input.thresholdAmount,
      currency_code: input.currencyCode,
    },
    { identity: input.identity },
  );
}

export type DeactivateResult = {
  spend_policy_id: string;
  active_flag: boolean;
  /** False when the limit was already not in force, so nothing changed. */
  withdrawn: boolean;
  detail?: string;
};

/**
 * Withdraw a limit so the category stops being governed.
 *
 * Until the service gained this route there was no way to remove a limit at all:
 * `active_flag` could only ever be TRUE, so the closest available action was to set
 * an absurdly high threshold and pretend. The row is kept, so every consumption
 * recorded against it — and the fact that it was once enforced — survives.
 *
 * Takes SPEND_POLICY_MANAGE, the same grant as setting one: removing a control is
 * at least as consequential as adding it.
 */
export async function deactivateSpendPolicy(
  spendPolicyId: string,
  identity: Identity & { principalId: string; tenantId: string },
): Promise<ApiWriteResult<DeactivateResult>> {
  return apiPost<DeactivateResult>(
    "spendControls",
    `/v1/spend-policies/${spendPolicyId}/deactivate`,
    {},
    { identity },
  );
}

export type SubmitCheckInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  category: string;
  amount: number;
  currencyCode: string;
  sourceReference?: string;
  /** Idempotency key. The service replays the stored decision for a repeat, so a
   *  retry cannot book the same spend against the budget twice. */
  correlationId: string;
};

/**
 * Ask whether a proposed spend is permitted, and — when it is, and a policy
 * exists — record it against the budget.
 *
 * Always 200 on a decision, whichever way it goes: BLOCKED is an answer, not an
 * error. The exceptions are a cross-currency check (422) and the usual identity
 * and authorization failures.
 */
export async function submitSpendCheck(
  input: SubmitCheckInput,
): Promise<ApiWriteResult<SpendCheckDecision>> {
  return apiPost<SpendCheckDecision>(
    "spendControls",
    "/v1/spend-checks/",
    {
      legal_entity_id: input.identity.legalEntityId,
      category: input.category,
      amount: input.amount,
      currency_code: input.currencyCode,
      // Omitted rather than sent empty: the service now rejects unknown fields,
      // and an empty string would store a reference to nothing.
      ...(input.sourceReference ? { source_reference: input.sourceReference } : {}),
      correlation_id: input.correlationId,
    },
    { identity: input.identity },
  );
}

// ─── Derived views ───────────────────────────────────────────────────────────

/** How much of a policy's budget is committed, for the meter on each row. */
export type PolicyUsage = {
  policy: SpendPolicy;
  /** ALLOWED spend in the policy's own currency. Refused attempts are excluded —
   *  they consumed nothing. */
  consumed: number;
  /** Refused attempts against this policy, which are worth surfacing: a limit
   *  that keeps refusing is either working hard or set too low. */
  refusedCount: number;
  /** consumed / threshold, clamped to 1 for display. */
  ratio: number;
};

export type PolicyUsageTotal = {
  spend_policy_id: string;
  consumed: number;
  refused_count: number;
};

/**
 * Committed spend and refusals per active policy, aggregated by the service.
 *
 * Prefer this over summing consumption rows client-side. It is one query
 * regardless of how much history exists, and — the part that matters — it applies
 * each policy's own enforcement window, so the number it returns is the one a spend
 * check will be judged against.
 */
export async function listPolicyUsage(input: {
  identity: Identity & { tenantId: string };
  legalEntityId?: string;
  category?: string;
}): Promise<ApiResult<PolicyUsageTotal[]>> {
  const result = await apiGet<PolicyUsageTotal[] | null>(
    "spendControls",
    "/v1/spend-policies/usage",
    {
      query: { legal_entity_id: input.legalEntityId, category: input.category },
      identity: input.identity,
    },
  );
  if (!result.ok) return result;
  if (result.data === null) return { ok: true, data: [] };
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "spend-controls-svc returned a non-array usage list" },
    };
  }
  return { ok: true, data: result.data };
}

/**
 * Join policies to their aggregated usage.
 *
 * This used to sum raw consumption rows in the browser, which was wrong twice
 * over: it fetched the tenant's whole history on every render, and it applied **no
 * period window**, so a MONTHLY limit's meter showed lifetime spend while
 * enforcement counted only the current month. A budget could therefore read as
 * exhausted when this month was empty and the next check would in fact pass. The
 * window now lives in one place — SQL, beside the enforcement query.
 *
 * PER_TRANSACTION policies have no running budget: each spend is judged alone, so
 * `ratio` is 0 and no meter implies an allowance filling up. Their `consumed` is a
 * lifetime total, which is what the row's caption says.
 */
export function summarisePolicyUsage(
  policies: SpendPolicy[],
  usage: PolicyUsageTotal[],
): PolicyUsage[] {
  const byPolicy = new Map(usage.map((u) => [u.spend_policy_id, u]));

  return policies.map((policy) => {
    const totals = byPolicy.get(policy.spend_policy_id);
    const consumed = totals?.consumed ?? 0;
    const refusedCount = totals?.refused_count ?? 0;

    const ratio =
      policy.period === "PER_TRANSACTION" || policy.threshold_amount <= 0
        ? 0
        : Math.min(consumed / policy.threshold_amount, 1);

    return { policy, consumed, refusedCount, ratio };
  });
}

export type SpendStats = {
  policies: number;
  /** Policies whose committed spend has reached their threshold. */
  exhausted: number;
  refusals: number;
  /** Committed spend by currency. Never summed across currencies — nothing in
   *  this suite holds an FX rate. */
  committedByCurrency: Record<string, number>;
};

export function summariseSpend(usage: PolicyUsage[]): SpendStats {
  const stats: SpendStats = {
    policies: usage.length,
    exhausted: 0,
    refusals: 0,
    committedByCurrency: {},
  };

  for (const u of usage) {
    stats.refusals += u.refusedCount;
    if (u.policy.period !== "PER_TRANSACTION" && u.consumed >= u.policy.threshold_amount) {
      stats.exhausted += 1;
    }
    stats.committedByCurrency[u.policy.currency_code] =
      (stats.committedByCurrency[u.policy.currency_code] ?? 0) + u.consumed;
  }

  return stats;
}

/**
 * How a decision should read, as distinct from what it says.
 *
 * `unevaluated` is the reading that matters: 200 ALLOWED with
 * `no_policy_configured` means no control was applied, and showing it green would
 * report an ungoverned category as an approval.
 */
export type DecisionReading = "permitted" | "unevaluated" | "refused" | "replayed";

export function readDecision(decision: SpendCheckDecision): DecisionReading {
  if (decision.replayed) return "replayed";
  if (decision.decision_basis === "no_policy_configured") return "unevaluated";
  return decision.decision_outcome === "BLOCKED" ? "refused" : "permitted";
}

/** Turn a backend failure into something an operator can act on. */
export function explainSpendError(message: string): string {
  if (message.includes("currency_mismatch")) {
    return "This category's limit is set in a different currency, so the two amounts cannot be compared — nothing in this platform holds an FX rate. Submit the check in the policy's currency, or set a separate policy for this one. Nothing was recorded.";
  }
  if (message.includes("forbidden")) {
    return "Authorization denied — this principal does not hold the required permission on this legal entity. Setting a limit (SPEND_POLICY_MANAGE), reading them (SPEND_POLICY_VIEW), and spending against them (SPEND_CHECK_SUBMIT) are three separate grants, so holding one does not imply the others.";
  }
  if (message.includes("authz_unavailable")) {
    return "Could not verify authorization, so the action was refused. authorization-svc is unreachable — this is a fail-closed refusal, not a denial.";
  }
  if (message.includes("identity_missing")) {
    return "No caller identity or tenant scope reached the service, so it failed closed. Sign in again.";
  }
  if (message.includes("invalid_threshold")) {
    return "A threshold must be greater than zero. A limit of zero would refuse everything, which is better expressed by not granting the spend permission at all.";
  }
  if (message.includes("invalid_amount")) {
    return "An amount must be greater than zero.";
  }
  if (message.includes("invalid_period")) {
    return "A period must be PER_TRANSACTION, MONTHLY, or ANNUAL.";
  }
  if (message.includes("missing_fields")) {
    return `A required field was empty: ${message.split("missing_fields").pop()?.replace(/[^a-z_, ]/gi, " ").trim() || "check the form"}.`;
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
  if (message.includes("store_unavailable")) {
    return "spend-controls-svc could not reach its database. Nothing was written.";
  }
  return message;
}
