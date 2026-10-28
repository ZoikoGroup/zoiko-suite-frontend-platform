// contract-lifecycle-svc (:8119, /contract-lifecycle-svc through the gateway) —
// the agreement register behind the Legal & Contracts domain.
//
// Lifecycle (LEG-05), as the service enforces it:
//
//   DRAFT ──submit-review──▶ REVIEW ──approve──▶ APPROVED
//     APPROVED ──send-for-signature──▶ (signature_status SENT)
//     APPROVED + SENT ──record-execution──▶ EFFECTIVE (signature_status COMPLETED)
//     EFFECTIVE ──amend / renew──▶ EFFECTIVE (new version)
//     APPROVED | EXECUTED | EFFECTIVE ──terminate──▶ TERMINATED
//
// Terms can be revised (PUT) only in DRAFT or REVIEW. Approval is a real gate:
// it needs a governance_decision_id that governance-decision-log-svc confirms
// was GRANTED for CONTRACT_APPROVE on this legal entity, and the principal who
// submitted the contract for review may not approve it (403).
//
// Every write is authorized against authorization-svc by the service itself,
// and every read and write is scoped by X-Tenant-Id: another tenant's contract
// reads as 404, and a request without a tenant is refused with 401.

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
 * Lifecycle states, exactly as domain.ContractStatus declares them.
 *
 * EXECUTED, EXPIRED and ARCHIVED are declared but no endpoint produces them
 * today (record-execution goes straight to EFFECTIVE). They stay in the union so
 * a row written by some future job still renders as a state.
 */
export type ContractStatus =
  | "DRAFT"
  | "REVIEW"
  | "APPROVED"
  | "EXECUTED"
  | "EFFECTIVE"
  | "TERMINATED"
  | "EXPIRED"
  | "ARCHIVED";

/** Signature progress, tracked separately from the lifecycle status. */
export type SignatureStatus =
  | "NOT_REQUESTED"
  | "SENT"
  | "PARTIALLY_SIGNED"
  | "COMPLETED"
  | "DECLINED"
  | "EXPIRED"
  | "PENDING_UNKNOWN"
  | "VOIDED";

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
  signature_status: SignatureStatus;
  version: number;
  /** DATE column — "YYYY-MM-DD", not a timestamp. */
  effective_from: string;
  effective_to?: string | null;
  submitted_at?: string | null;
  submitted_by?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  signature_sent_at?: string | null;
  executed_at?: string | null;
  signed_by?: string | null;
  effective_at?: string | null;
  amended_at?: string | null;
  amended_by?: string | null;
  renewed_at?: string | null;
  renewed_by?: string | null;
  terminated_at?: string | null;
  terminated_by?: string | null;
  termination_note?: string | null;
  currency: string;
  total_value: number;
  document_vault_id?: string | null;
  governance_decision_id?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** Immutable snapshot appended by the service on every material change. */
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
  /** Optional narrowing to one legal entity within the tenant. */
  legalEntityId?: string;
};

/** List contracts for the caller's tenant, newest first. */
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

/** Fetch one contract. 404 both for an unknown id and for another tenant's. */
export async function getContract(
  contractId: string,
  identity: TenantIdentity,
): Promise<ApiResult<Contract>> {
  return apiGet<Contract>("contracts", `/v1/contracts/${encodeURIComponent(contractId)}`, {
    identity,
  });
}

/** Read a contract's immutable version history, oldest first. */
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

/** Create a contract in DRAFT at version 1, signature NOT_REQUESTED. */
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
  /** Stored on the appended version row — the audit record for the change. */
  changeSummary: string;
};

/**
 * Restate a DRAFT or REVIEW contract's terms (409 from APPROVED onward).
 *
 * The service merges field-by-field and treats a zero value as "not supplied",
 * so untouched fields are omitted rather than sent blank.
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

/** DRAFT → REVIEW. The submitter is recorded and later barred from approving. */
export async function submitContractForReview(
  contractId: string,
  identity: WriteIdentity,
): Promise<ApiWriteResult<Contract>> {
  return apiPost<Contract>(
    "contracts",
    `/v1/contracts/${encodeURIComponent(contractId)}/submit-review`,
    { submitted_by: identity.principalId },
    { identity },
  );
}

export type ApproveContractInput = {
  contractId: string;
  identity: WriteIdentity;
  /** The governance-decision-log-svc decision that authorizes this approval. */
  governanceDecisionId: string;
};

/**
 * REVIEW → APPROVED.
 *
 * 400 without a governance decision id, 400 if the decision is unknown to this
 * tenant, 403 if it was not GRANTED or if the caller submitted the contract.
 */
export async function approveContract(
  input: ApproveContractInput,
): Promise<ApiWriteResult<Contract>> {
  return apiPost<Contract>(
    "contracts",
    `/v1/contracts/${encodeURIComponent(input.contractId)}/approve`,
    {
      approved_by: input.identity.principalId,
      governance_decision_id: input.governanceDecisionId,
    },
    { identity: input.identity },
  );
}

/** APPROVED (signature NOT_REQUESTED) → signature SENT. Status stays APPROVED. */
export async function sendContractForSignature(
  contractId: string,
  identity: WriteIdentity,
): Promise<ApiWriteResult<Contract>> {
  return apiPost<Contract>(
    "contracts",
    `/v1/contracts/${encodeURIComponent(contractId)}/send-for-signature`,
    { sent_by: identity.principalId },
    { identity },
  );
}

export type RecordExecutionInput = {
  contractId: string;
  identity: WriteIdentity;
  /** Required by the service. */
  signedBy: string;
  documentVaultId?: string;
};

/**
 * APPROVED + signature SENT → EFFECTIVE, signature COMPLETED.
 *
 * 409 if the signature request was never sent. Execution is caller-asserted:
 * no e-signature adapter feeds this service yet, so the signatory named here is
 * what the record will say.
 */
export async function recordContractExecution(
  input: RecordExecutionInput,
): Promise<ApiWriteResult<Contract>> {
  return apiPost<Contract>(
    "contracts",
    `/v1/contracts/${encodeURIComponent(input.contractId)}/record-execution`,
    {
      signed_by: input.signedBy,
      ...(input.documentVaultId ? { document_vault_id: input.documentVaultId } : {}),
    },
    { identity: input.identity },
  );
}

export type AmendContractInput = {
  contractId: string;
  identity: WriteIdentity;
  title?: string;
  counterpartyName?: string;
  totalValue?: number;
  changeSummary: string;
};

/** Amend an EFFECTIVE contract's terms; appends a version. */
export async function amendContract(
  input: AmendContractInput,
): Promise<ApiWriteResult<Contract>> {
  return apiPost<Contract>(
    "contracts",
    `/v1/contracts/${encodeURIComponent(input.contractId)}/amend`,
    {
      amended_by: input.identity.principalId,
      ...(input.title ? { title: input.title } : {}),
      ...(input.counterpartyName ? { counterparty_name: input.counterpartyName } : {}),
      ...(input.totalValue !== undefined ? { total_value: input.totalValue } : {}),
      change_summary: input.changeSummary,
    },
    { identity: input.identity },
  );
}

export type RenewContractInput = {
  contractId: string;
  identity: WriteIdentity;
  /** "YYYY-MM-DD". Required by the service. */
  newEffectiveTo: string;
  changeSummary: string;
};

/** Extend an EFFECTIVE contract's term; appends a version. */
export async function renewContract(
  input: RenewContractInput,
): Promise<ApiWriteResult<Contract>> {
  return apiPost<Contract>(
    "contracts",
    `/v1/contracts/${encodeURIComponent(input.contractId)}/renew`,
    {
      renewed_by: input.identity.principalId,
      new_effective_to: input.newEffectiveTo,
      change_summary: input.changeSummary,
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
 * Terminate an APPROVED or EFFECTIVE contract. Terminal.
 *
 * 409 for a DRAFT or REVIEW contract (withdrawing a draft is not termination)
 * and for one that is already final.
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
  /** EFFECTIVE — in force. */
  active: number;
  /** REVIEW — waiting on an approver. */
  awaitingApproval: number;
  /** APPROVED — approved, not yet executed. */
  awaitingSignature: number;
  draft: number;
  terminated: number;
  /** Contracted value of EFFECTIVE agreements, by currency. Never summed across
   *  currencies — this service holds no FX rate. */
  activeValueByCurrency: Record<string, number>;
};

/** Roll up a list the caller already has. Pure — no second round trip. */
export function summarise(contracts: Contract[]): ContractStats {
  const activeValueByCurrency: Record<string, number> = {};
  let active = 0;
  let awaitingApproval = 0;
  let awaitingSignature = 0;
  let draft = 0;
  let terminated = 0;

  for (const contract of contracts) {
    switch (contract.status) {
      case "EFFECTIVE":
        active += 1;
        activeValueByCurrency[contract.currency] =
          (activeValueByCurrency[contract.currency] ?? 0) + contract.total_value;
        break;
      case "REVIEW":
        awaitingApproval += 1;
        break;
      case "APPROVED":
        awaitingSignature += 1;
        break;
      case "DRAFT":
        draft += 1;
        break;
      case "TERMINATED":
        terminated += 1;
        break;
      default:
        break;
    }
  }

  return { active, awaitingApproval, awaitingSignature, draft, terminated, activeValueByCurrency };
}

export type ContractTransitions = {
  revise: boolean;
  submit: boolean;
  approve: boolean;
  sendForSignature: boolean;
  recordExecution: boolean;
  amend: boolean;
  renew: boolean;
  terminate: boolean;
};

/** Steps the service's own guards allow from this contract's current state.
 *  Drives which row actions render, so the UI does not offer a 409. */
export function allowedTransitions(
  contract: Pick<Contract, "status" | "signature_status">,
): ContractTransitions {
  const { status } = contract;
  const signature = contract.signature_status ?? "NOT_REQUESTED";
  return {
    revise: status === "DRAFT" || status === "REVIEW",
    submit: status === "DRAFT",
    approve: status === "REVIEW",
    sendForSignature: status === "APPROVED" && signature === "NOT_REQUESTED",
    recordExecution:
      status === "APPROVED" && (signature === "SENT" || signature === "PARTIALLY_SIGNED"),
    amend: status === "EFFECTIVE",
    renew: status === "EFFECTIVE",
    terminate: status === "APPROVED" || status === "EXECUTED" || status === "EFFECTIVE",
  };
}

/**
 * Turn a backend failure into something a legal user can act on.
 *
 * Matches the service's own error strings (domain.Err* and the handler's
 * writeError texts) and the client's transport messages.
 */
export function explainContractError(message: string): string {
  const text = message.toLowerCase();

  if (text.includes("is unreachable at") || text.includes("did not respond within")) {
    return "contract-lifecycle-svc could not be reached, so nothing was written. Try again once it is running.";
  }
  if (text.includes("contract not found")) {
    return "That contract no longer exists, or it belongs to another tenant — both read as not found.";
  }
  if (text.includes("principal may not approve a contract they submitted")) {
    return "You submitted this contract for review, so you cannot approve it. Another approver has to.";
  }
  if (text.includes("governance_decision_id is required")) {
    return "Approval needs the ID of the governance decision that authorizes it.";
  }
  if (text.includes("governance_decision_id not found")) {
    return "That governance decision ID is not on record for your organisation. Check the ID in the governance decision log.";
  }
  if (text.includes("governance decision was not granted")) {
    return "That governance decision was not GRANTED for approving contracts on this legal entity, so the approval was refused.";
  }
  if (text.includes("governance decision log unavailable")) {
    return "The governance decision log could not be reached, so the approval was refused rather than allowed unchecked. Try again shortly.";
  }
  if (text.includes("signature has not been sent")) {
    return "Execution can only be recorded after the contract has been sent for signature.";
  }
  if (text.includes("already terminated")) {
    return "This contract is already TERMINATED. Termination is terminal and cannot be repeated or undone.";
  }
  if (text.includes("only draft or review contracts can be updated")) {
    return "Terms can only be revised while a contract is DRAFT or REVIEW. Once APPROVED, use an amendment after it takes effect.";
  }
  if (text.includes("envelope_incomplete")) {
    return "The request was missing context the service requires on every change. This is a console fault, not something you entered.";
  }
  if (text.includes("not in the required status")) {
    return "That step is not available from the contract's current status — it moved since this page loaded, or the step comes later in the lifecycle. Reload to see where it is now.";
  }
  if (text.includes("not authorized to perform this action")) {
    return "Your account is not authorized to perform this step on this legal entity.";
  }
  if (text.includes("authorization service unavailable")) {
    return "Your permission could not be checked, so the change was refused rather than allowed through unchecked. Try again shortly.";
  }
  if (
    text.includes("tenant scope missing") ||
    text.includes("missing_tenant_scope") ||
    text.includes("x-principal-id header is required")
  ) {
    return "Your session was not recognised by contract-lifecycle-svc — sign in again.";
  }
  if (text.includes("signed_by is required")) {
    return "Name the signatory to record execution.";
  }
  if (text.includes("new_effective_to")) {
    return "A renewal needs the new end date.";
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
  if (text.includes("failed to")) {
    return "contract-lifecycle-svc failed while serving this request. Nothing was written.";
  }

  return message;
}
