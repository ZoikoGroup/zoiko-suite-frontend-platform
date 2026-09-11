import { apiGet, apiPost, type ApiResult, type ApiWriteResult } from "./client";
import type { Identity } from "./client";

export type DestinationStatus =
  | "CANDIDATE"
  | "VERIFICATION_PENDING"
  | "VERIFIED"
  | "APPROVAL_PENDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "SUPERSEDED";

export type SourceType =
  | "SUPPLIER_PORTAL"
  | "INVOICE_OCR"
  | "EMAIL"
  | "MANUAL_ENTRY";

export type PayeeDestination = {
  DestinationID: string;
  TenantID?: string | null;
  LegalEntityID: string;
  PartyRef: string;
  Scope: string;
  FinancialInstitution: string;
  AccountIdentifier?: string;
  AccountLast4: string;
  CountryCode: string;
  Currency: string;
  PayeeName: string;
  SourceType: SourceType;
  Fingerprint: string;
  Status: DestinationStatus;
  VerificationMethod?: string;
  VerificationEvidenceRef?: string;
  VerifiedByPrincipalID?: string;
  VerifiedAt?: string | null;
  ApprovedByPrincipalID?: string;
  ApprovedAt?: string | null;
  SupersededByDestinationID?: string;
  SuspendReason?: string;
  ProposedByPrincipalID: string;
  CreatedAt: string;
  UpdatedAt: string;
};

export type ChangeEvent = {
  EventID: string;
  TenantID?: string | null;
  DestinationID: string;
  EventType: string;
  Detail: string;
  ActorPrincipalID: string;
  CreatedAt: string;
};

export type ProposeDestinationInput = {
  LegalEntityID: string;
  PartyRef: string;
  Scope?: string;
  FinancialInstitution: string;
  AccountIdentifier: string;
  CountryCode: string;
  Currency: string;
  PayeeName: string;
  SourceType: SourceType;
};

export type VerifyDestinationInput = {
  VerificationMethod: string;
  VerificationEvidenceRef: string;
};

export type SuspendDestinationInput = {
  Reason: string;
};

export type SupersedeDestinationInput = {
  Reason: string;
};

export async function proposePayeeDestination(
  input: ProposeDestinationInput,
  identity: Identity
): Promise<ApiWriteResult<PayeeDestination>> {
  return apiPost<PayeeDestination>(
    "payeeBankingIdentity",
    "/org10/destinations",
    {
      LegalEntityID: input.LegalEntityID,
      PartyRef: input.PartyRef,
      Scope: input.Scope || "DEFAULT",
      FinancialInstitution: input.FinancialInstitution,
      AccountIdentifier: input.AccountIdentifier,
      CountryCode: input.CountryCode,
      Currency: input.Currency,
      PayeeName: input.PayeeName,
      SourceType: input.SourceType,
    },
    { identity }
  );
}

export async function getPayeeDestination(
  destinationId: string,
  identity: Identity
): Promise<ApiResult<PayeeDestination>> {
  return apiGet<PayeeDestination>(
    "payeeBankingIdentity",
    `/org10/destinations/${encodeURIComponent(destinationId)}`,
    { identity }
  );
}

export async function getPayeeChangeHistory(
  destinationId: string,
  identity: Identity
): Promise<ApiResult<{ data: ChangeEvent[]; count: number }>> {
  return apiGet<{ data: ChangeEvent[]; count: number }>(
    "payeeBankingIdentity",
    `/org10/destinations/${encodeURIComponent(destinationId)}/history`,
    { identity }
  );
}

export async function verifyPayeeDestination(
  destinationId: string,
  input: VerifyDestinationInput,
  identity: Identity
): Promise<ApiWriteResult<PayeeDestination>> {
  return apiPost<PayeeDestination>(
    "payeeBankingIdentity",
    `/org10/destinations/${encodeURIComponent(destinationId)}/verify`,
    {
      VerificationMethod: input.VerificationMethod,
      VerificationEvidenceRef: input.VerificationEvidenceRef,
    },
    { identity }
  );
}

export async function approvePayeeDestination(
  destinationId: string,
  identity: Identity
): Promise<ApiWriteResult<PayeeDestination>> {
  return apiPost<PayeeDestination>(
    "payeeBankingIdentity",
    `/org10/destinations/${encodeURIComponent(destinationId)}/approve`,
    {},
    { identity }
  );
}

export async function activatePayeeDestination(
  destinationId: string,
  identity: Identity
): Promise<ApiWriteResult<PayeeDestination>> {
  return apiPost<PayeeDestination>(
    "payeeBankingIdentity",
    `/org10/destinations/${encodeURIComponent(destinationId)}/activate`,
    {},
    { identity }
  );
}

export async function suspendPayeeDestination(
  destinationId: string,
  input: SuspendDestinationInput,
  identity: Identity
): Promise<ApiWriteResult<PayeeDestination>> {
  return apiPost<PayeeDestination>(
    "payeeBankingIdentity",
    `/org10/destinations/${encodeURIComponent(destinationId)}/suspend`,
    {
      Reason: input.Reason,
    },
    { identity }
  );
}

export async function supersedePayeeDestination(
  destinationId: string,
  input: SupersedeDestinationInput,
  identity: Identity
): Promise<ApiWriteResult<PayeeDestination>> {
  return apiPost<PayeeDestination>(
    "payeeBankingIdentity",
    `/org10/destinations/${encodeURIComponent(destinationId)}/supersede`,
    {
      Reason: input.Reason,
    },
    { identity }
  );
}

export async function listPayeeVersions(
  partyRef: string,
  identity: Identity
): Promise<ApiResult<{ data: PayeeDestination[]; count: number }>> {
  return apiGet<{ data: PayeeDestination[]; count: number }>(
    "payeeBankingIdentity",
    `/org10/parties/${encodeURIComponent(partyRef)}/versions`,
    { identity }
  );
}

export async function getActivePayeeDestination(
  partyRef: string,
  scope = "DEFAULT",
  identity: Identity
): Promise<ApiResult<PayeeDestination>> {
  return apiGet<PayeeDestination>(
    "payeeBankingIdentity",
    `/org10/parties/${encodeURIComponent(partyRef)}/active?scope=${encodeURIComponent(scope)}`,
    { identity }
  );
}
