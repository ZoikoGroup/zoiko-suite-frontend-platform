"use server";

// Server Action for the gateway-auth-svc diagnostics page.
//
// Sends the signed-in session's own envelope to /verify, describing a request
// the operator chooses, and reports what the gateway decided. The envelope is
// read from the session cookie here and never sent to the browser; the result
// carries only the documented identity headers the gateway set, not the token.

import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { DENIAL_REASONS, verifyThroughGateway } from "@/lib/api/gateway-auth";
import type { GatewayVerifyState } from "./state";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export async function verifySessionAction(
  _prev: GatewayVerifyState,
  formData: FormData,
): Promise<GatewayVerifyState> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) return { status: "error", message: "Your session has expired — sign in again." };

  const method = String(formData.get("forwarded_method") ?? "GET").toUpperCase();
  let uri = String(formData.get("forwarded_uri") ?? "").trim();
  if (!METHODS.has(method)) return { status: "error", message: "Choose a method." };
  if (!uri) return { status: "error", message: "Enter the path of the request to check." };
  if (!uri.startsWith("/")) uri = `/${uri}`;

  const outcome = await verifyThroughGateway({
    envelopeJwt: session.envelopeJwt,
    forwardedMethod: method,
    forwardedUri: uri,
  });
  const hadEnvelope = Boolean(session.envelopeJwt);

  if (outcome.unreachable) {
    return { status: "unreachable", outcome, hadEnvelope, matches: {}, message: outcome.unreachable };
  }

  // Compare what the gateway injected with what the session was issued for. A
  // mismatch would mean a backend acting for somebody other than the person
  // signed in here — the one thing the gateway exists to prevent.
  const expected: Record<string, string | undefined> = {
    "X-Principal-Id": session.principalId,
    "X-Tenant-Id": session.tenantId,
    "X-Legal-Entity-Id": session.legalEntityId,
  };
  const matches: Record<string, boolean> = {};
  for (const { header, value } of outcome.injected) {
    const want = expected[header];
    if (want) matches[header] = want.toLowerCase() === value.toLowerCase();
  }

  if (outcome.allowed) {
    const mismatched = Object.entries(matches).filter(([, ok]) => !ok).map(([h]) => h);
    return {
      status: "allowed",
      outcome,
      hadEnvelope,
      matches,
      message: mismatched.length
        ? `The gateway let this through, but ${mismatched.join(", ")} does not match your session. A backend behind it would act for a different identity than the one signed in here.`
        : `The gateway would let this through and forward it as you. ${method} ${uri} would reach its service with the identity below.`,
    };
  }

  const reason = DENIAL_REASONS.find((r) => r.code === outcome.denialReason);
  const explained = reason ? `${reason.meaning} ${reason.fix}` : outcome.body || `The gateway answered ${outcome.status}.`;
  const noEnvelope = !hadEnvelope
    ? " Your session has no signed envelope (it did not come from the identity provider), so every gated request is refused this way."
    : "";

  // 503 and 429 mean no decision exists — the gateway could not determine the
  // answer, or is protecting itself. Neither is a refusal of this identity.
  if (outcome.status === 503 || outcome.status === 429) {
    return { status: "unresolved", outcome, hadEnvelope, matches, message: explained };
  }
  return { status: "refused", outcome, hadEnvelope, matches, message: `${explained}${noEnvelope}` };
}
