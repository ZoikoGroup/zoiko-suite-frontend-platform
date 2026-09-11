"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  proposePayeeDestination,
  verifyPayeeDestination,
  approvePayeeDestination,
  activatePayeeDestination,
  suspendPayeeDestination,
  getPayeeDestination,
  getPayeeChangeHistory,
  listPayeeVersions,
  getActivePayeeDestination,
  type PayeeDestination,
  type ChangeEvent,
  type SourceType,
} from "@/lib/api/payee-banking";

async function getIdentity(overridePrincipal?: string): Promise<SessionIdentity> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const decoded = decodeSession(raw);
  const baseIdentity: SessionIdentity = decoded
    ? {
        principalId: decoded.principalId,
        tenantId: decoded.tenantId,
        legalEntityId: decoded.legalEntityId,
      }
    : {
        principalId: "44444444-4444-4444-4444-444444444444",
        tenantId: "11111111-1111-1111-1111-111111111111",
        legalEntityId: "11111111-1111-1111-1111-111111111111",
      };

  if (overridePrincipal && overridePrincipal.trim()) {
    return {
      ...baseIdentity,
      principalId: overridePrincipal.trim(),
    };
  }
  return baseIdentity;
}

export type PayeeActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  destinationId?: string;
  destination?: PayeeDestination;
  history?: ChangeEvent[];
  versions?: PayeeDestination[];
};

export async function proposePayeeAction(
  _previous: PayeeActionState,
  formData: FormData
): Promise<PayeeActionState> {
  const actor = String(formData.get("actor_principal_id") ?? "").trim();
  const identity = await getIdentity(actor);

  const legalEntityId = String(formData.get("legal_entity_id") ?? "").trim();
  const partyRef = String(formData.get("party_ref") ?? "").trim();
  const scope = String(formData.get("scope") ?? "DEFAULT").trim();
  const institution = String(formData.get("financial_institution") ?? "").trim();
  const accountId = String(formData.get("account_identifier") ?? "").trim();
  const countryCode = String(formData.get("country_code") ?? "GB").trim();
  const currency = String(formData.get("currency") ?? "GBP").trim().toUpperCase();
  const payeeName = String(formData.get("payee_name") ?? "").trim();
  const sourceType = String(formData.get("source_type") ?? "MANUAL_ENTRY").trim() as SourceType;

  if (!legalEntityId || !partyRef || !institution || !accountId || !countryCode || !currency || !payeeName) {
    return {
      status: "error",
      message: "All fields (legal entity, counterparty ref, financial institution, account identifier, country, currency, payee name) are required.",
    };
  }

  const res = await proposePayeeDestination(
    {
      LegalEntityID: legalEntityId,
      PartyRef: partyRef,
      Scope: scope,
      FinancialInstitution: institution,
      AccountIdentifier: accountId,
      CountryCode: countryCode,
      Currency: currency,
      PayeeName: payeeName,
      SourceType: sourceType,
    },
    identity
  );

  if (!res.ok) {
    return {
      status: "error",
      message: res.error.message || "Failed to propose payee destination candidate.",
    };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    destinationId: res.data.DestinationID,
    destination: res.data,
    message: `Candidate proposed successfully on :8166! Destination ID: ${res.data.DestinationID} (Status: ${res.data.Status}, Masked Last4: ${res.data.AccountLast4}, Fingerprint: ${res.data.Fingerprint?.slice(0, 12)}...)`,
  };
}

export async function verifyPayeeAction(
  _previous: PayeeActionState,
  formData: FormData
): Promise<PayeeActionState> {
  const actor = String(formData.get("actor_principal_id") ?? "").trim();
  const identity = await getIdentity(actor);

  const destinationId = String(formData.get("destination_id") ?? "").trim();
  const method = String(formData.get("verification_method") ?? "").trim();
  const evidenceRef = String(formData.get("verification_evidence_ref") ?? "").trim();

  if (!destinationId || !method || !evidenceRef) {
    return {
      status: "error",
      message: "Destination ID, verification method, and verification evidence ref are required.",
    };
  }

  const res = await verifyPayeeDestination(
    destinationId,
    {
      VerificationMethod: method,
      VerificationEvidenceRef: evidenceRef,
    },
    identity
  );

  if (!res.ok) {
    return {
      status: "error",
      message: res.error.message || "Failed to verify payee destination.",
    };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    destinationId: res.data.DestinationID,
    destination: res.data,
    message: `Destination verified successfully! Transitioned to Status: ${res.data.Status} via method ${res.data.VerificationMethod}. Ready for Maker-Checker approval.`,
  };
}

export async function approvePayeeAction(
  _previous: PayeeActionState,
  formData: FormData
): Promise<PayeeActionState> {
  const actor = String(formData.get("actor_principal_id") ?? "").trim();
  const identity = await getIdentity(actor);

  const destinationId = String(formData.get("destination_id") ?? "").trim();
  if (!destinationId) {
    return { status: "error", message: "Destination ID is required." };
  }

  const res = await approvePayeeDestination(destinationId, identity);

  if (!res.ok) {
    return {
      status: "error",
      message: res.error.message || "Approval refused by Segregation of Duties / Authorization policy.",
    };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    destinationId: res.data.DestinationID,
    destination: res.data,
    message: `Destination approved by checker ${res.data.ApprovedByPrincipalID}! Status: ${res.data.Status}. Ready for final activation.`,
  };
}

export async function activatePayeeAction(
  _previous: PayeeActionState,
  formData: FormData
): Promise<PayeeActionState> {
  const actor = String(formData.get("actor_principal_id") ?? "").trim();
  const identity = await getIdentity(actor);

  const destinationId = String(formData.get("destination_id") ?? "").trim();
  if (!destinationId) {
    return { status: "error", message: "Destination ID is required." };
  }

  const res = await activatePayeeDestination(destinationId, identity);

  if (!res.ok) {
    return {
      status: "error",
      message: res.error.message || "Failed to activate payee destination.",
    };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    destinationId: res.data.DestinationID,
    destination: res.data,
    message: `Destination is now ACTIVE! Supersedes any previous active destination for party ${res.data.PartyRef}.`,
  };
}

export async function suspendPayeeAction(
  _previous: PayeeActionState,
  formData: FormData
): Promise<PayeeActionState> {
  const actor = String(formData.get("actor_principal_id") ?? "").trim();
  const identity = await getIdentity(actor);

  const destinationId = String(formData.get("destination_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!destinationId || !reason) {
    return { status: "error", message: "Destination ID and reason are required." };
  }

  const res = await suspendPayeeDestination(destinationId, { Reason: reason }, identity);

  if (!res.ok) {
    return {
      status: "error",
      message: res.error.message || "Failed to suspend payee destination.",
    };
  }

  revalidatePath("/admin/finance");
  return {
    status: "success",
    destinationId: res.data.DestinationID,
    destination: res.data,
    message: `Destination has been SUSPENDED! Reason: ${res.data.SuspendReason}.`,
  };
}

export async function lookupPayeeDestinationAction(
  _previous: PayeeActionState,
  formData: FormData
): Promise<PayeeActionState> {
  const actor = String(formData.get("actor_principal_id") ?? "").trim();
  const identity = await getIdentity(actor);

  const destinationId = String(formData.get("destination_id") ?? "").trim();
  if (!destinationId) {
    return { status: "error", message: "Destination ID is required." };
  }

  const [destRes, histRes] = await Promise.all([
    getPayeeDestination(destinationId, identity),
    getPayeeChangeHistory(destinationId, identity),
  ]);

  if (!destRes.ok) {
    return {
      status: "error",
      message: destRes.error.message || "Destination not found.",
    };
  }

  return {
    status: "success",
    destinationId: destRes.data.DestinationID,
    destination: destRes.data,
    history: histRes.ok ? histRes.data.data : [],
    message: `Loaded destination ${destRes.data.DestinationID} (Status: ${destRes.data.Status}).`,
  };
}

export async function lookupActivePayeeAction(
  _previous: PayeeActionState,
  formData: FormData
): Promise<PayeeActionState> {
  const actor = String(formData.get("actor_principal_id") ?? "").trim();
  const identity = await getIdentity(actor);

  const partyRef = String(formData.get("party_ref") ?? "").trim();
  const scope = String(formData.get("scope") ?? "DEFAULT").trim();

  if (!partyRef) {
    return { status: "error", message: "Counterparty party_ref is required." };
  }

  const [activeRes, versionsRes] = await Promise.all([
    getActivePayeeDestination(partyRef, scope, identity),
    listPayeeVersions(partyRef, identity),
  ]);

  if (!activeRes.ok && (!versionsRes.ok || versionsRes.data.count === 0)) {
    return {
      status: "error",
      message: `No payee destinations found for counterparty "${partyRef}".`,
    };
  }

  return {
    status: "success",
    destination: activeRes.ok ? activeRes.data : undefined,
    versions: versionsRes.ok ? versionsRes.data.data : [],
    message: activeRes.ok
      ? `Active destination found for ${partyRef}: ID ${activeRes.data.DestinationID} (Bank: ${activeRes.data.FinancialInstitution}, Account: ${activeRes.data.AccountLast4})`
      : `No currently active destination for ${partyRef}, but found ${versionsRes.ok ? versionsRes.data.count : 0} candidate/historic versions.`,
  };
}
