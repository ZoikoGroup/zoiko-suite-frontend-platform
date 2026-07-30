// contract-lifecycle-svc (:8119, /contract-lifecycle-svc through the gateway) —
// the agreement register behind the Legal & Contracts domain.
//
// Lifecycle: DRAFT -> PENDING_APPROVAL -> ACTIVE -> TERMINATED. Revising a
// contract does not change its status; it bumps `version` and appends an
// immutable row to contract_versions, so every restatement of the terms stays
// attributable. Activation and termination also snapshot a version, which is
// why an ACTIVE contract is already at v3 rather than v1.
//
// TWO DIFFERENCES FROM purchase-order-svc THAT THE UI MUST NOT PAPER OVER:
//
//  1. There is NO authorization check. The service constructs an authz client
//     and stores it on its handler, but no handler ever calls it — so unlike a
//     purchase order, a contract write is not checked against authorization-svc
//     and cannot fail closed. Any caller the gateway admits may write.
//  2. Activation does not require approval. POST /{id}/activate refuses only
//     ACTIVE and TERMINATED contracts, so a DRAFT can be signed into force
//     without ever passing through PENDING_APPROVAL.
//
// Both are properties of the backend, not of this console, and the Legal pages
// say so rather than implying a control that isn't there.
//
// Tenant isolation IS real: every store call opens a transaction and sets
// `app.tenant_id` from the X-Tenant-Id header, and Postgres row-level security
// filters on it. A read without the header falls back to the literal tenant
// "default" and returns that tenant's rows — an empty register, not an error.

import {
  apiGet,
  apiPost,
  apiPut,
  type ApiResult,
  type ApiWriteResult,
  type Identity,
} from "./client";

/**
 * Contract types the service enumerates. It does not reject an unknown value,
 * so this list constrains the console's own forms rather than describing a
 * backend guarantee.
 */
export const CONTRACT_TYPES = [
  "VENDOR",
  "EMPLOYMENT",
  "NDA",
  "MSA",
  "SLA",
  "PARTNERSHIP",
  "OTHER",
] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number];

/**
 * Lifecycle states.
 *
 * EXPIRED and SUSPENDED are declared by the service but no endpoint produces
 * them — there is no deadline sweep and no suspend transition. They are kept in
 * the union so a row written by some future job still renders instead of
 * falling through to an unstyled badge.
 */
export type ContractStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "ACTIVE"
  | "EXPIRED"
  | "TERMINATED"
  | "SUSPENDED";

/** Wire shape. Field names match the Go json tags exactly. */
export type Contract = {
  contract_id: string;
  tenant_id: string;
  legal_entity_id: string;
  contract_type: ContractType | string;
  title: string;
  description?: string;
  counterparty_id: string;
  counterparty_name: string;
  status: ContractStatus;
  version: number;
  /** DATE column — "YYYY-MM-DD", not a timestamp. */
  effective_from: string;
  effective_to?: string | null;
  signed_at?: string | null;
  signed_by?: string | null;
  terminated_at?: string | null;
  terminated_by?: string | null;
  termination_note?: string | null;
  currency: string;
  total_value: number;
  document_vault_id?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** Immutable snapshot appended on create, revise, activate, and terminate. */
export type ContractVersion = {
  version_id: string;
  contract_id: string;
  tenant_id: string;
  version_number: number;
  status: ContractStatus;
  title: string;
  description?: string;
  effective_from: string;
  effective_to?: string | null;
  change_summary: string;
  created_by: string;
  created_at: string;
};

/** This service wraps collections in an envelope rather than returning a bare
 *  array, unlike purchase-order-svc. */
type ContractListEnvelope = { contracts: Contract[] | null; total: number };
type VersionListEnvelope = { versions: ContractVersion[] | null; total: number };

export type TenantIdentity = Identity & { tenantId: string };
export type WriteIdentity = Identity & { principalId: string; tenantId: string };

export type ListContractsInput = {
  identity: TenantIdentity;
  /** Optional narrowing. Tenant scoping is already enforced by RLS; this filters
   *  further to one legal entity within the tenant. */
  legalEntityId?: string;
};

/**
 * List contracts for the caller's tenant, newest first.
 *
 * Unlike purchase-order-svc there is no `tenant_id` query parameter — the
 * service reads X-Tenant-Id and lets row-level security do the filtering. That
 * makes the identity header the only thing standing between this call and
 * another tenant's agreements, so it is never optional.
 */
export async function listContracts(
  input: ListContractsInput,
): Promise<ApiResult<Contract[]>> {
  const result = await apiGet<ContractListEnvelope>("contracts", "/v1/contracts", {
    query: { legal_entity_id: input.legalEntityId },
    identity: input.identity,
  });

  if (!result.ok) return result;

  const contracts = result.data?.contracts;
  if (contracts == null) return { ok: true, data: [] };

  if (!Array.isArray(contracts)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "contract-lifecycle-svc returned a non-array contract list",
      },
    };
  }

  // The service already orders by created_at DESC. Repeated here so the
  // register's ordering is a property of this module rather than an assumption
  // about the service.
  const sorted = [...contracts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return { ok: true, data: sorted };
}

/**
 * Fetch one contract.
 *
 * Answers 404 both for an id that does not exist and for one that belongs to
 * another tenant — RLS hides the row before the handler can distinguish them,
 * which is the correct behaviour and worth knowing when reading the error.
 */
export async function getContract(
  contractId: string,
  identity: TenantIdentity,
): Promise<ApiResult<Contract>> {
  return apiGet<Contract>("contracts", `/v1/contracts/${encodeURIComponent(contractId)}`, {
    identity,
  });
}

/**
 * Read a contract's immutable version history, oldest first.
 *
 * The service returns 200 with an empty list for a contract that does not
 * exist, rather than 404 — it never loads the contract to check. An empty
 * history therefore means "no such contract, or none visible to this tenant",
 * not "a contract with no versions": every contract gets a v1 snapshot at
 * creation.
 */
export async function listContractVersions(
  contractId: string,
  identity: TenantIdentity,
): Promise<ApiResult<ContractVersion[]>> {
  const result = await apiGet<VersionListEnvelope>(
    "contracts",
    `/v1/contracts/${encodeURIComponent(contractId)}/versions`,
    { identity },
  );

  if (!result.ok) return result;

  const versions = result.data?.versions;
  if (versions == null) return { ok: true, data: [] };

  if (!Array.isArray(versions)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "contract-lifecycle-svc returned a non-array version list",
      },
    };
  }

  return { ok: true, data: versions };
}

export type DraftContractInput = {
  identity: Identity & { principalId: string; tenantId: string; legalEntityId: string };
  contractType: ContractType;
  title: string;
  description?: string;
  counterpartyId: string;
  counterpartyName?: string;
  /** "YYYY-MM-DD". Required by the service. */
  effectiveFrom: string;
  effectiveTo?: string;
  currency: string;
  totalValue: number;
};

/**
 * Create a contract in DRAFT at version 1, with an "Initial draft" snapshot.
 *
 * `created_by` is taken from the request body, not from the identity headers,
 * and the service does not check that the two agree. The console always sends
 * the session principal so the attribution is true, but nothing downstream
 * enforces that.
 */
export async function draftContract(
  input: DraftContractInput,
): Promise<ApiWriteResult<Contract>> {
  return apiPost<Contract>(
    "contracts",
    "/v1/contracts",
    {
      legal_entity_id: input.identity.legalEntityId,
      contract_type: input.contractType,
      title: input.title,
      description: input.description ?? "",
      counterparty_id: input.counterpartyId,
      counterparty_name: input.counterpartyName ?? "",
      effective_from: input.effectiveFrom,
      ...(input.effectiveTo ? { effective_to: input.effectiveTo } : {}),
      currency: input.currency,
      total_value: input.totalValue,
      created_by: input.identity.principalId,
    },
    { identity: input.identity },
  );
}

export type ReviseContractInput = {
  contractId: string;
  identity: WriteIdentity;
  title?: string;
  counterpartyName?: string;
  effectiveTo?: string;
  currency?: string;
  totalValue?: number;
  /** Stored on the appended version row. This is the audit record for the
   *  restatement, so the console requires it even though the service does not. */
  changeSummary: string;
};

/**
 * Restate a DRAFT or PENDING_APPROVAL contract's terms.
 *
 * The service merges field-by-field and treats a zero-value as "not supplied":
 * an empty string leaves the old title, and `total_value: 0` leaves the old
 * value. So a field cannot be *cleared* through this endpoint, only changed —
 * which is why the console omits untouched fields entirely instead of sending
 * blanks and expecting them to apply.
 */
export async function reviseContract(
  input: ReviseContractInput,
): Promise<ApiWriteResult<Contract>> {
  return apiPut<Contract>(
    "contracts",
    `/v1/contracts/${encodeURIComponent(input.contractId)}`,
    {
      ...(input.title ? { title: input.title } : {}),
      ...(input.counterpartyName ? { counterparty_name: input.counterpartyName } : {}),
      ...(input.effectiveTo ? { effective_to: input.effectiveTo } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.totalValue !== undefined ? { total_value: input.totalValue } : {}),
      change_summary: input.changeSummary,
      updated_by: input.identity.principalId,
    },
    { identity: input.identity },
  );
}

/**
 * Move a DRAFT contract to PENDING_APPROVAL. Legal only from DRAFT.
 *
 * This transition does NOT bump `version` and appends no snapshot — it is the
 * one lifecycle step that leaves no trace in contract_versions. It also records
 * no actor: the service declares a `submitted_by` field but never reads the
 * request body, so who submitted a contract for approval is not stored
 * anywhere.
 */
export async function submitContractForApproval(
  contractId: string,
  identity: WriteIdentity,
): Promise<ApiWriteResult<Contract>> {
  return apiPost<Contract>(
    "contracts",
    `/v1/contracts/${encodeURIComponent(contractId)}/submit`,
    { submitted_by: identity.principalId },
    { identity },
  );
}

export type ActivateContractInput = {
  contractId: string;
  identity: WriteIdentity;
  /** Required by the service. */
  signedBy: string;
  /** RFC3339. The service parses this into a time.Time and stores it verbatim,
   *  so an omitted value would be recorded as the zero time, not as now. */
  signedAt: string;
  documentVaultId?: string;
};

/**
 * Sign a contract into force.
 *
 * Refuses only ACTIVE and TERMINATED — a DRAFT activates without ever having
 * been submitted for approval. The console surfaces that rather than hiding it,
 * because a reader who assumes approval was enforced would draw the wrong
 * conclusion from an ACTIVE row.
 */
export async function activateContract(
  input: ActivateContractInput,
): Promise<ApiWriteResult<Contract>> {
  return apiPost<Contract>(
    "contracts",
    `/v1/contracts/${encodeURIComponent(input.contractId)}/activate`,
    {
      signed_by: input.signedBy,
      signed_at: input.signedAt,
      ...(input.documentVaultId ? { document_vault_id: input.documentVaultId } : {}),
    },
    { identity: input.identity },
  );
}

export type TerminateContractInput = {
  contractId: string;
  identity: WriteIdentity;
  terminationNote: string;
};

/**
 * Terminate a contract.
 *
 * Backdates nothing and closes nothing off gradually: the service sets
 * `effective_to` to today, so the agreement reads as having ended the moment it
 * was terminated. Terminal — a TERMINATED contract cannot be revived, though
 * note the service will still let it be revised if it were somehow returned to
 * DRAFT.
 */
export async function terminateContract(
  input: TerminateContractInput,
): Promise<ApiWriteResult<Contract>> {
  return apiPost<Contract>(
    "contracts",
    `/v1/contracts/${encodeURIComponent(input.contractId)}/terminate`,
    {
      terminated_by: input.identity.principalId,
      termination_note: input.terminationNote,
    },
    { identity: input.identity },
  );
}

export type ContractStats = {
  active: number;
  awaitingApproval: number;
  draft: number;
  terminated: number;
  /** Contracted value of ACTIVE agreements, by currency. Never summed across
   *  currencies — this service holds no FX rate, and inventing one would
   *  misstate the committed position. */
  activeValueByCurrency: Record<string, number>;
};

/** Roll up a list the caller already has. Pure — no second round trip. */
export function summarise(contracts: Contract[]): ContractStats {
  const activeValueByCurrency: Record<string, number> = {};
  let active = 0;
  let awaitingApproval = 0;
  let draft = 0;
  let terminated = 0;

  for (const contract of contracts) {
    switch (contract.status) {
      case "ACTIVE":
        active += 1;
        activeValueByCurrency[contract.currency] =
          (activeValueByCurrency[contract.currency] ?? 0) + contract.total_value;
        break;
      case "PENDING_APPROVAL":
        awaitingApproval += 1;
        break;
      case "DRAFT":
        draft += 1;
        break;
      case "TERMINATED":
        terminated += 1;
        break;
      default:
        // EXPIRED / SUSPENDED are counted in none of the tiles because no
        // transition produces them. Deliberately not folded into `terminated`:
        // an expired contract and a terminated one are different facts.
        break;
    }
  }

  return { active, awaitingApproval, draft, terminated, activeValueByCurrency };
}

/** Lifecycle steps that are legal from a given status, per the service's own
 *  guards. Drives which row actions render at all, so the UI does not offer a
 *  transition the service will answer 409 to. */
export function allowedTransitions(status: ContractStatus): {
  revise: boolean;
  submit: boolean;
  activate: boolean;
  terminate: boolean;
} {
  return {
    revise: status === "DRAFT" || status === "PENDING_APPROVAL",
    submit: status === "DRAFT",
    activate: status !== "ACTIVE" && status !== "TERMINATED",
    terminate: status !== "TERMINATED",
  };
}

/**
 * Turn a backend failure into something a legal user can act on.
 *
 * This service answers in prose rather than machine codes — `{"error": "only
 * DRAFT contracts can be submitted for approval"}` — so matching is on those
 * sentences. Where the prose omits the consequence, it is added: a 409 here
 * means the contract moved under the reader since the page was rendered, and
 * knowing that is the difference between retrying and investigating.
 */
export function explainContractError(message: string): string {
  const text = message.toLowerCase();

  if (text.includes("contract not found")) {
    return "That contract no longer exists, or it belongs to another tenant. Row-level security hides the two cases from each other, so both read as not found.";
  }
  if (text.includes("already active")) {
    return "This contract is already ACTIVE — it was activated elsewhere since this page was rendered. Reload to see the current state.";
  }
  if (text.includes("already terminated")) {
    return "This contract is already TERMINATED. Termination is terminal and cannot be repeated or undone.";
  }
  if (text.includes("contract is terminated")) {
    return "This contract is TERMINATED and can no longer be activated.";
  }
  if (text.includes("only draft contracts can be submitted")) {
    return "Only a DRAFT can be submitted for approval — this contract has already moved past DRAFT. Reload to see where it is now.";
  }
  if (text.includes("only draft or pending_approval contracts can be updated")) {
    return "Terms can only be revised while a contract is DRAFT or PENDING_APPROVAL. Once ACTIVE, the agreement is fixed and a change needs a new contract.";
  }
  if (text.includes("signed_by is required")) {
    return "A signatory is required to activate a contract.";
  }
  if (text.includes("terminated_by is required")) {
    return "No caller identity reached the service, so termination could not be attributed. Sign in again.";
  }
  if (text.includes("title, counterparty_id, and effective_from are required")) {
    return "Title, counterparty ID, and an effective-from date are all required to draft a contract.";
  }
  if (text.includes("invalid request body")) {
    return "contract-lifecycle-svc could not parse the request. This is a console bug, not a data problem.";
  }
  if (text.includes("failed to create") || text.includes("failed to update")) {
    return "contract-lifecycle-svc could not reach its database. Nothing was written.";
  }
  if (text.includes("failed to")) {
    return "contract-lifecycle-svc failed while serving this request. Its database may be unreachable.";
  }

  return message;
}
