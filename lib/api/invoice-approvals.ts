import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type ApprovalRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type InvoiceApprovalRequest = {
  approval_request_id: string;
  tenant_id: string;
  legal_entity_id: string;
  invoice_id: string;
  workflow_instance_id: string;
  invoice_amount: number;
  currency_code: string;
  status: ApprovalRequestStatus;
  current_step: number;
  total_steps: number;
  created_by_principal_id: string;
  created_at: string;
  updated_at: string;
};

export type ApprovalDecision = {
  approval_decision_id: string;
  tenant_id: string;
  approval_request_id: string;
  step_number: number;
  decided_by_principal_id: string;
  decision: "APPROVED" | "REJECTED";
  decision_reason: string;
  decided_at: string;
};

export type ApprovalDetailResponse = {
  request: InvoiceApprovalRequest;
  decisions: ApprovalDecision[];
};

export type CreateInvoiceApprovalInput = {
  invoice_id: string;
  legal_entity_id: string;
  invoice_amount: number;
  currency_code: string;
  total_steps?: number;
};

export type SubmitApprovalDecisionInput = {
  decision: "APPROVED" | "REJECTED";
  decision_reason: string;
};

/**
 * Initiate an invoice approval workflow on invoice-approval-svc (:8107).
 */
export async function createInvoiceApproval(
  input: CreateInvoiceApprovalInput,
  identity: Identity
): Promise<ApiWriteResult<InvoiceApprovalRequest>> {
  return apiPost<InvoiceApprovalRequest>(
    "invoiceApproval",
    "/v1/invoice-approvals",
    {
      invoice_id: input.invoice_id,
      legal_entity_id: input.legal_entity_id,
      invoice_amount: input.invoice_amount,
      currency_code: input.currency_code,
      total_steps: input.total_steps ?? 1,
    },
    { identity }
  );
}

/**
 * List invoice approval requests from invoice-approval-svc (:8107).
 */
export async function listInvoiceApprovals(
  params: {
    legal_entity_id?: string;
    invoice_id?: string;
    status?: string;
  } = {},
  identity?: Identity
): Promise<ApiResult<InvoiceApprovalRequest[]>> {
  const query = new URLSearchParams();
  if (params.legal_entity_id) query.set("legal_entity_id", params.legal_entity_id);
  if (params.invoice_id) query.set("invoice_id", params.invoice_id);
  if (params.status) query.set("status", params.status);

  const qs = query.toString();
  const path = qs ? `/v1/invoice-approvals?${qs}` : "/v1/invoice-approvals";

  return apiGet<InvoiceApprovalRequest[]>("invoiceApproval", path, { identity });
}

/**
 * Fetch a single approval request with its decision history.
 */
export async function getInvoiceApproval(
  id: string,
  identity?: Identity
): Promise<ApiResult<ApprovalDetailResponse>> {
  return apiGet<ApprovalDetailResponse>("invoiceApproval", `/v1/invoice-approvals/${id}`, { identity });
}

/**
 * Submit an approval decision (APPROVE / REJECT) for a specific step.
 */
export async function submitApprovalDecision(
  id: string,
  input: SubmitApprovalDecisionInput,
  identity: Identity
): Promise<ApiWriteResult<InvoiceApprovalRequest>> {
  return apiPost<InvoiceApprovalRequest>(
    "invoiceApproval",
    `/v1/invoice-approvals/${id}/decide`,
    input,
    { identity }
  );
}
