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
  approvePurchaseRequest,
  rejectPurchaseRequest,
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
 * Raise a purchase request. It lands PENDING and grants nothing.
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
        message: `Request raised for ${money}, status ${request.status} — ID ${request.request_id}. It authorises nothing until approved; an order cannot be issued against it yet.`,
      }
    : {
        status: "replayed",
        requestId: request.request_id,
        message: `No new request written — this replayed an existing one for ${money}, currently ${request.status}, ID ${request.request_id}. The service is idempotent on correlation ID, so a retried submit resolves to the original rather than duplicating it.`,
      };
}

/** Approve a PENDING request. Terminal. */
export async function submitRequestApproval(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  return decideRequest(formData, "approve");
}

/** Reject a PENDING request, with a mandatory reason. Terminal. */
export async function submitRequestRejection(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  return decideRequest(formData, "reject");
}

/**
 * The two decisions share everything except the call and the wording, and
 * both are terminal — so a 422 is reported as "already decided" rather than
 * an error, because it is a fact about the record, not a failure.
 */
async function decideRequest(
  formData: FormData,
  decision: "approve" | "reject",
): Promise<RequestActionState> {
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
    // uuid column: a malformed id fails inside the Postgres driver and comes
    // back as a 503 that reads like an outage rather than a typo.
    return { status: "error", message: "A purchase request ID must be a UUID." };
  }

  let reason = "";
  if (decision === "reject") {
    reason = String(formData.get("reason") ?? "").trim();
    if (!reason) {
      return {
        status: "error",
        message:
          "A reason is required to reject. The reason is the audit record for the refusal, so the service will not accept an unexplained one.",
      };
    }
  }

  const result =
    decision === "approve"
      ? await approvePurchaseRequest(requestId, identity)
      : await rejectPurchaseRequest(requestId, reason, identity);

  if (!result.ok) {
    if (result.error.status === 422) {
      return {
        status: "already-decided",
        message: explainRequestError(result.error.message),
      };
    }
    return { status: "error", message: explainRequestError(result.error.message) };
  }

  refresh();

  const request = result.data;
  return decision === "approve"
    ? {
        status: "approved",
        requestId: request.request_id,
        message: `Request APPROVED and attributed to you. An order can now be issued against it — paste this ID into the issue form: ${request.request_id}`,
      }
    : {
        status: "rejected",
        requestId: request.request_id,
        message: `Request REJECTED, with your reason stored on the record. No order can be issued against it.`,
      };
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
