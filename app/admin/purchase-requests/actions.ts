"use server";

// Server Actions that WRITE to purchase-request-svc (:8100).
//
// This domain had no own actions.ts — purchase-requests/page.tsx was importing
// `lookupPurchaseRequest` from ../commercial-ops/actions, and the raise/decide
// forms were wired to `submitPurchaseRequest`, `submitRequestApproval`, and
// `submitRequestRejection` that also lived in commercial-ops/actions. That
// arrangement coupled the purchase-requests page to commercial-ops's state
// module and made the domain's actions unreachable without the commercial-ops
// context. These are the same functions, moved here so the domain owns its
// own write surface.
//
// None of these actions decide whether the caller is allowed to act —
// authorization-svc is checked inside purchase-request-svc on every mutation.
// The session lookup here establishes *who is asking*; it deliberately does not
// pre-empt the backend's answer.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createPurchaseRequest,
  submitPurchaseRequestForApproval,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  cancelPurchaseRequest,
  getPurchaseRequest,
  explainRequestError,
} from "@/lib/api/purchase-requests";
import type { LookupState } from "@/components/admin/shared/lookup";
import type { RequestActionState } from "./state";

// Every write ends in refresh(), not revalidatePath.
//
// The route reads cookies() for the session, which makes it fully dynamic —
// there is no data cache entry to invalidate. refresh() re-renders the current
// route so the register shows the write that just landed without clearing
// the client cache for every other route the operator has visited.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

const EXPIRED: RequestActionState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

/**
 * Raise a purchase request. It lands DRAFT and grants nothing until it is
 * submitted and approved.
 *
 * 201 means a request was created. 200 means the service recognised the
 * request as a replay and wrote nothing — reported as such rather than as a
 * second request, because the register would then show a row that does not
 * exist.
 */
export async function submitPurchaseRequest(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const description = String(formData.get("description") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const currencyCode = String(formData.get("currency_code") ?? "").trim();

  if (!description) {
    return {
      status: "error",
      message: "A description is required — it is what an approver reads.",
    };
  }

  const amount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(amount) || amount <= 0) {
    return { status: "error", message: "Amount must be a number greater than zero." };
  }
  if (!currencyCode) {
    return { status: "error", message: "Currency is required." };
  }

  const result = await createPurchaseRequest({ identity, description, amount, currencyCode });

  if (!result.ok) {
    return { status: "error", message: explainRequestError(result.error.message) };
  }

  refresh();

  const request = result.data;
  const money = `${request.currency_code} ${request.amount.toLocaleString()}`;

  // The ID goes in the confirmation message because it is the only way for the
  // operator to get it out of this form — the decide and issue-order forms both
  // take it by hand, and there is no ID picker anywhere on this page.
  return result.status === 201
    ? {
      status: "created",
      requestId: request.request_id,
      message: `Request raised for ${money}, status ${request.status} — ID ${request.request_id}. Submit it for approval next; it authorises nothing until approved.`,
    }
    : {
      status: "replayed",
      requestId: request.request_id,
      message: `No new request written — this replayed an existing one for ${money}, currently ${request.status}, ID ${request.request_id}. The service is idempotent on correlation ID, so a retried submit resolves to the original rather than duplicating it.`,
    };
}

/** DRAFT → PENDING_APPROVAL. */
export async function submitRequestForApproval(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  return transitionRequest(formData, "submit");
}

/** Approve a PENDING_APPROVAL request. */
export async function submitRequestApproval(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  return transitionRequest(formData, "approve");
}

/** Reject a PENDING_APPROVAL request, with a mandatory reason. Terminal. */
export async function submitRequestRejection(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  return transitionRequest(formData, "reject");
}

/** Cancel a DRAFT, PENDING_APPROVAL or APPROVED request. Terminal. */
export async function submitRequestCancellation(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  return transitionRequest(formData, "cancel");
}

type Transition = "submit" | "approve" | "reject" | "cancel";

/**
 * Every transition is version-checked by the service, and the forms take a
 * request by ID rather than from a rendered row. So the current record is read
 * first and its version sent as expected_version: a change between that read
 * and the write still answers 409 stale_version rather than being overwritten.
 * A 422 means the step is not available from the request's status.
 */
async function transitionRequest(formData: FormData, kind: Transition): Promise<RequestActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const requestId = String(formData.get("request_id") ?? "").trim();
  if (!requestId) {
    return { status: "error", message: "A purchase request ID is required." };
  }
  if (!isUuid(requestId)) {
    return { status: "error", message: "A purchase request ID must be a UUID." };
  }

  const reason = String(formData.get("reason") ?? "").trim();
  if ((kind === "reject" || kind === "cancel") && !reason) {
    return {
      status: "error",
      message: `A reason is required to ${kind}. It is the audit record for the decision, so the service will not accept an unexplained one.`,
    };
  }

  const current = await getPurchaseRequest(requestId, identity);
  if (!current.ok) {
    return {
      status: "error",
      message:
        current.error.status === 404
          ? "No purchase request with that ID exists for your organisation."
          : explainRequestError(current.error.message, { status: current.error.status }),
    };
  }
  const version = current.data.version;

  const result =
    kind === "submit"
      ? await submitPurchaseRequestForApproval(requestId, version, identity)
      : kind === "approve"
        ? await approvePurchaseRequest(requestId, version, identity)
        : kind === "reject"
          ? await rejectPurchaseRequest(requestId, reason, version, identity)
          : await cancelPurchaseRequest(requestId, reason, version, identity);

  if (!result.ok) {
    const message = explainRequestError(result.error.message, { status: result.error.status });
    return result.error.status === 422
      ? { status: "already-decided", requestId, message }
      : { status: "error", requestId, message };
  }

  refresh();

  const request = result.data;
  switch (kind) {
    case "submit":
      return {
        status: "submitted",
        requestId,
        message: `Request submitted — now ${request.status}. Someone other than the requester has to approve or reject it.`,
      };
    case "approve":
      return {
        status: "approved",
        requestId,
        message: `Request APPROVED and attributed to you. An order can now be issued against it — paste this ID into the issue form: ${request.request_id}`,
      };
    case "reject":
      return {
        status: "rejected",
        requestId,
        message: "Request REJECTED, with your reason stored on the record. No order can be issued against it.",
      };
    case "cancel":
      return {
        status: "cancelled",
        requestId,
        message: "Request CANCELLED, with your reason stored on the record.",
      };
  }
}

/**
 * Read one purchase request by ID — the full record including decision trail.
 */
export async function lookupPurchaseRequest(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const requestId = String(formData.get("lookup_request_id") ?? "").trim();
  if (!requestId) {
    return { status: "error", message: "Enter a purchase request ID." };
  }
  if (!isUuid(requestId)) {
    return { status: "error", message: "A purchase request ID must be a UUID." };
  }

  const result = await getPurchaseRequest(requestId, identity);

  if (!result.ok) {
    if (result.error.status === 404) {
      return {
        status: "missing",
        message:
          "No purchase request with that id exists for this tenant. A request belonging to another tenant reads as absent in exactly the same way.",
      };
    }
    return { status: "error", message: explainRequestError(result.error.message) };
  }

  return { status: "found", record: result.data, message: "" };
}
