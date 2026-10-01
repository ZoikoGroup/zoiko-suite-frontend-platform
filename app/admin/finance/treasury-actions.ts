"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  registerBankAccount,
  recordBankBalance,
  updateAccountStatus,
  setLiquidityThreshold,
  initiateTransfer,
  decideTransfer,
  type AccountStatus,
  type BankAccount,
} from "@/lib/api/treasury";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const decoded = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!decoded) {
    throw new Error("unauthenticated");
  }
  return decoded;
}

async function identityOrError(): Promise<SessionIdentity | null> {
  try {
    return await requireIdentity();
  } catch {
    return null;
  }
}

const SESSION_EXPIRED = { status: "error" as const, message: "Session expired — please log in again." };
const CURRENCY_RE = /^[A-Z]{3}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function asIdentity(identity: SessionIdentity, legalEntityId = identity.legalEntityId) {
  return { principalId: identity.principalId, tenantId: identity.tenantId, legalEntityId };
}

export type TreasuryActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  account?: BankAccount;
};

export type ThresholdActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type TransferActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  correlationId?: string;
};

export type SimpleActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function registerBankAccountAction(
  _previous: TreasuryActionState,
  formData: FormData
): Promise<TreasuryActionState> {
  const identity = await identityOrError();
  if (!identity) return SESSION_EXPIRED;

  const accountName = str(formData, "account_name");
  const currencyCode = str(formData, "currency_code").toUpperCase();
  const bankIdentifier = str(formData, "bank_identifier").toUpperCase();
  const maskedAccountNumber = str(formData, "masked_account_number");
  const legalEntityId = str(formData, "legal_entity_id") || identity.legalEntityId;

  if (!accountName) {
    return { status: "error", message: "Negative Rule: Treasury/Account Name is required." };
  }
  if (!/^[A-Z0-9]{4,34}$/.test(bankIdentifier)) {
    return { status: "error", message: "Negative Rule: Bank Identifier must be 4–34 letters/digits (IFSC, BIC or routing code)." };
  }
  const digits = (maskedAccountNumber.match(/\d/g) ?? []).length;
  if (!/[*xX•]/.test(maskedAccountNumber) || digits > 4) {
    return {
      status: "error",
      message: "Negative Rule: Account number must be masked (e.g. ****-****-8821) and show at most the last 4 digits.",
    };
  }
  if (!CURRENCY_RE.test(currencyCode)) {
    return { status: "error", message: "Negative Rule: A valid 3-letter currency code (e.g. INR, GBP, USD) is required." };
  }

  const res = await registerBankAccount(
    {
      legal_entity_id: legalEntityId,
      account_name: accountName,
      masked_account_number: maskedAccountNumber,
      bank_identifier: bankIdentifier,
      currency_code: currencyCode,
    },
    asIdentity(identity, legalEntityId),
  );
  if (!res.ok) {
    return { status: "error", message: `Failed to register treasury account: ${res.error.message}` };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    message: `Treasury account "${res.data.account_name}" (${res.data.currency_code}) registered with ID ${res.data.bank_account_id}. Record a bank balance to fund it.`,
    account: res.data,
  };
}

/**
 * Records a bank-reported balance. `as_of_local` is a datetime-local value and
 * `tz_offset_minutes` the browser's getTimezoneOffset(), so the instant is the
 * one the operator meant rather than the server's local time.
 */
export async function recordBalanceAction(
  _previous: SimpleActionState,
  formData: FormData
): Promise<SimpleActionState> {
  const identity = await identityOrError();
  if (!identity) return SESSION_EXPIRED;

  const bankAccountId = str(formData, "bank_account_id");
  const ledger = Number(str(formData, "ledger_balance"));
  const availableRaw = str(formData, "available_balance");
  const available = availableRaw === "" ? ledger : Number(availableRaw);
  const asOfLocal = str(formData, "as_of_local");
  const offset = Number(str(formData, "tz_offset_minutes") || "0");
  const sourceReference = str(formData, "source_reference");
  const formKey = str(formData, "form_key");

  if (!UUID_RE.test(bankAccountId)) {
    return { status: "error", message: "Negative Rule: Select the bank account the statement belongs to." };
  }
  if (!Number.isFinite(ledger) || !Number.isFinite(available)) {
    return { status: "error", message: "Negative Rule: Ledger and available balances must be numbers." };
  }
  const parsed = Date.parse(`${asOfLocal}:00Z`);
  if (!asOfLocal || Number.isNaN(parsed) || !Number.isFinite(offset)) {
    return { status: "error", message: "Negative Rule: Statement as-of date and time is required." };
  }
  const asOf = new Date(parsed + offset * 60_000);
  if (!sourceReference) {
    return { status: "error", message: "Negative Rule: Statement / feed reference is required as evidence for the balance." };
  }

  const res = await recordBankBalance(
    bankAccountId,
    {
      ledger_balance: ledger,
      available_balance: available,
      as_of_timestamp: asOf.toISOString(),
      source_reference: sourceReference,
    },
    formKey || `bal-${crypto.randomUUID()}`,
    asIdentity(identity),
  );
  if (!res.ok) {
    return { status: "error", message: `Balance not recorded: ${res.error.message}` };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    message:
      res.status === 201
        ? `Bank balance recorded: available ${res.data.available_balance.toLocaleString()} as of ${new Date(res.data.as_of_timestamp).toLocaleString()} (ref ${sourceReference}).`
        : `This statement was already recorded — no duplicate balance was written.`,
  };
}

export async function updateAccountStatusAction(
  _previous: SimpleActionState,
  formData: FormData
): Promise<SimpleActionState> {
  const identity = await identityOrError();
  if (!identity) return SESSION_EXPIRED;

  const bankAccountId = str(formData, "bank_account_id");
  const status = str(formData, "account_status").toUpperCase() as AccountStatus;
  const reason = str(formData, "reason");

  if (!UUID_RE.test(bankAccountId)) {
    return { status: "error", message: "Negative Rule: Select a bank account." };
  }
  if (!["ACTIVE", "SUSPENDED", "CLOSED"].includes(status)) {
    return { status: "error", message: "Negative Rule: Choose ACTIVE, SUSPENDED or CLOSED." };
  }
  if (!reason) {
    return { status: "error", message: "Negative Rule: A reason is required for an account status change." };
  }

  const res = await updateAccountStatus(bankAccountId, status, reason, asIdentity(identity));
  if (!res.ok) {
    return { status: "error", message: `Status change refused: ${res.error.message}` };
  }
  revalidatePath("/admin/finance");
  return { status: "success", message: `"${res.data.account_name}" is now ${res.data.account_status}.` };
}

export async function setLiquidityThresholdAction(
  _previous: ThresholdActionState,
  formData: FormData
): Promise<ThresholdActionState> {
  const identity = await identityOrError();
  if (!identity) return SESSION_EXPIRED;

  const currencyCode = str(formData, "currency_code").toUpperCase();
  const minBalance = Number(str(formData, "minimum_required_balance"));
  const escalationEmail = str(formData, "escalation_email");
  const legalEntityId = str(formData, "legal_entity_id") || identity.legalEntityId;

  if (!Number.isFinite(minBalance) || minBalance < 0) {
    return { status: "error", message: "Negative Rule: Minimum Required Balance must be a non-negative number." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(escalationEmail)) {
    return { status: "error", message: "Negative Rule: A valid escalation email address is required." };
  }
  if (!CURRENCY_RE.test(currencyCode)) {
    return { status: "error", message: "Negative Rule: A valid 3-letter currency code is required." };
  }

  const res = await setLiquidityThreshold(
    {
      legal_entity_id: legalEntityId,
      currency_code: currencyCode,
      minimum_required_balance: minBalance,
      escalation_email: escalationEmail,
    },
    asIdentity(identity, legalEntityId),
  );
  if (!res.ok) {
    return { status: "error", message: `Failed to set liquidity threshold: ${res.error.message}` };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    message: `Liquidity threshold for ${res.data.currency_code} set to ${res.data.minimum_required_balance.toLocaleString()} with alerts to ${res.data.escalation_email}.`,
  };
}

/** Maker step: submits a transfer for approval. No money moves here. */
export async function initiateTransferAction(
  _previous: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  const identity = await identityOrError();
  if (!identity) return SESSION_EXPIRED;

  const srcAcctId = str(formData, "source_bank_account_id");
  const tgtAcctId = str(formData, "target_bank_account_id");
  const amount = Number(str(formData, "amount"));
  const currencyCode = str(formData, "currency_code").toUpperCase();
  const correlationId = str(formData, "correlation_id");
  const purpose = str(formData, "purpose");
  const valueDate = str(formData, "value_date");

  if (!srcAcctId || !tgtAcctId) {
    return { status: "error", message: "Negative Rule: Both Source and Target bank accounts must be selected." };
  }
  if (srcAcctId === tgtAcctId) {
    return { status: "error", message: "Negative Rule: Source and Target bank accounts cannot be identical." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { status: "error", message: "Negative Rule: Transfer amount must be strictly greater than 0.00." };
  }
  if (!correlationId) {
    return { status: "error", message: "Negative Rule: A correlation / idempotency reference is required." };
  }
  if (!purpose) {
    return { status: "error", message: "Negative Rule: State the business purpose of the transfer for the approver." };
  }

  const res = await initiateTransfer(
    {
      source_bank_account_id: srcAcctId,
      target_bank_account_id: tgtAcctId,
      amount,
      currency_code: currencyCode,
      correlation_id: correlationId,
      purpose,
      value_date: valueDate || undefined,
    },
    asIdentity(identity),
  );
  if (!res.ok) {
    return { status: "error", message: `Transfer rejected: ${res.error.message}` };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    message:
      res.status === 201
        ? `Transfer of ${currencyCode} ${amount.toLocaleString()} submitted for approval (${res.data.transfer_type.replace("_", "-").toLowerCase()}). A different user must approve it before any money moves.`
        : `This transfer (${correlationId}) was already submitted — current status ${res.data.transfer_status}. Nothing was duplicated.`,
    correlationId: res.data.correlation_id,
  };
}

/** Checker step (approve / reject) or maker withdrawal (cancel). */
export async function decideTransferAction(
  _previous: SimpleActionState,
  formData: FormData
): Promise<SimpleActionState> {
  const identity = await identityOrError();
  if (!identity) return SESSION_EXPIRED;

  const transferId = str(formData, "transfer_id");
  const decision = str(formData, "decision") as "approve" | "reject" | "cancel";
  const reason = str(formData, "reason");
  const approverPrincipalId = str(formData, "approver_principal_id") || identity.principalId;

  if (!UUID_RE.test(transferId)) {
    return { status: "error", message: "Negative Rule: Unknown transfer." };
  }
  if (!["approve", "reject", "cancel"].includes(decision)) {
    return { status: "error", message: "Negative Rule: Unknown decision." };
  }
  if (decision !== "approve" && !reason) {
    return { status: "error", message: `Negative Rule: A reason is required to ${decision} a transfer.` };
  }

  const caller = {
    ...asIdentity(identity),
    principalId: approverPrincipalId,
  };

  const res = await decideTransfer(transferId, decision, reason, caller);
  if (!res.ok) {
    return { status: "error", message: `Could not ${decision} transfer: ${res.error.message}` };
  }
  revalidatePath("/admin/finance");
  const verb = { approve: "approved and executed", reject: "rejected", cancel: "cancelled" }[decision];
  return {
    status: "success",
    message: `Transfer of ${res.data.currency_code} ${res.data.amount.toLocaleString()} ${verb}.`,
  };
}
