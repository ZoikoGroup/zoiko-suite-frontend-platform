"use server";

// Two-step verification for the signed-in person (identity-context-svc).
//
// Step-up is how a high-risk change is allowed: authorization-svc issues and
// approves JIT and break-glass sessions only for a caller whose envelope shows
// a second factor within the last 15 minutes. A step-up returns a new login
// token; resolving it gives that envelope, which replaces the one in the
// session cookie — so the very next request carries the proof.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, decodeSession, encodeSession, toIdentity, type SessionPayload } from "@/lib/auth";
import {
  activateTotp,
  enrollTotp,
  resolveIdentity,
  revokeTotp,
  stepUp,
  type TotpEnrollment,
} from "@/lib/api/identity";
import type { ApiError } from "@/lib/api/client";

export type StepUpOutcome = { ok: boolean; message: string; notEnrolled?: boolean; signin?: boolean };

async function currentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const s = decodeSession(store.get(SESSION_COOKIE)?.value);
  return s?.email && s.principalId && s.tenantId ? s : null;
}

function claims(jwt: string): { exp?: number; session_trust_posture?: { session_context_id?: string } } {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf-8"));
  } catch {
    return {};
  }
}

/** Swap a fresh login token for an envelope and keep it in the session. */
async function adoptToken(session: SessionPayload, accessToken: string): Promise<string | null> {
  const resolved = await resolveIdentity({
    request: { bearer_token: accessToken, legal_entity_id: session.legalEntityId ?? "", correlation_id: crypto.randomUUID() },
    callerIdentity: { principalId: session.principalId!, tenantId: session.tenantId! },
  });
  if (!resolved.ok) return null;
  const c = claims(resolved.data.envelope_jwt);
  const next: SessionPayload = {
    ...session,
    envelopeJwt: resolved.data.envelope_jwt,
    sessionContextId: c.session_trust_posture?.session_context_id ?? session.sessionContextId,
    envelopeExpiresAt: c.exp,
  };
  (await cookies()).set(SESSION_COOKIE, encodeSession(next), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return resolved.data.envelope_jwt;
}

function mfaProblem(error: ApiError): StepUpOutcome {
  const m = error.message;
  if (m.includes("invalid_code")) return { ok: false, message: "That code didn't match. Codes change every 30 seconds — try the current one." };
  if (m.includes("mfa_not_enrolled")) return { ok: false, notEnrolled: true, message: "You haven't set up two-step verification yet." };
  if (m.includes("reauthentication_required")) return { ok: false, signin: true, message: "For your security, sign in again before changing two-step verification." };
  if (m.includes("session_invalid") || error.status === 401) return { ok: false, signin: true, message: "Your secure session has ended. Sign in again." };
  if (m.includes("locked") || error.status === 429) return { ok: false, message: "Too many attempts. Wait a few minutes and try again." };
  if (error.kind === "unreachable" || error.kind === "timeout") return { ok: false, message: "The sign-in service isn't reachable right now. Try again shortly." };
  return { ok: false, message: "Verification failed. Try again." };
}

/** "Verify it's you": prove the second factor and refresh the session's envelope. */
export async function stepUpAction(code: string): Promise<StepUpOutcome> {
  const session = await currentSession();
  if (!session) return { ok: false, signin: true, message: "Your session has ended. Sign in again." };
  if (!session.envelopeJwt) {
    return { ok: false, signin: true, message: "This session wasn't signed in through the identity service. Sign in again to verify." };
  }
  if (!/^\d{6}$/.test(code)) return { ok: false, message: "Enter the 6-digit code from your authenticator app." };
  const result = await stepUp(toIdentity(session) as Parameters<typeof stepUp>[0], code);
  if (!result.ok) return mfaProblem(result.error);
  const envelope = await adoptToken(session, result.data.access_token);
  if (!envelope) return { ok: false, message: "Verified, but the session could not be refreshed. Sign in again." };
  return { ok: true, message: "Verified." };
}

export type EnrolOutcome =
  | { ok: true; enrollment: Pick<TotpEnrollment, "factor_id" | "secret" | "otpauth_uri" | "digits" | "period">; qrSvg: string }
  | { ok: false; message: string; signin?: boolean };

/** Start setting up an authenticator app: a secret shown once, as a QR code. */
export async function beginEnrolmentAction(): Promise<EnrolOutcome> {
  const session = await currentSession();
  if (!session?.envelopeJwt) return { ok: false, signin: true, message: "Sign in through the identity service to set up two-step verification." };
  const result = await enrollTotp(toIdentity(session) as Parameters<typeof enrollTotp>[0]);
  if (!result.ok) {
    const p = mfaProblem(result.error);
    return { ok: false, message: p.message, signin: p.signin };
  }
  const { default: QRCode } = await import("qrcode");
  const qrSvg = await QRCode.toString(result.data.otpauth_uri, { type: "svg", margin: 1, width: 192, errorCorrectionLevel: "M" });
  const { factor_id, secret, otpauth_uri, digits, period } = result.data;
  return { ok: true, enrollment: { factor_id, secret, otpauth_uri, digits, period }, qrSvg };
}

/** Confirm the app with one code. The factor becomes the active one. */
export async function confirmEnrolmentAction(factorId: string, code: string): Promise<StepUpOutcome> {
  const session = await currentSession();
  if (!session?.envelopeJwt) return { ok: false, signin: true, message: "Your session has ended. Sign in again." };
  if (!/^\d{6}$/.test(code)) return { ok: false, message: "Enter the 6-digit code your app shows now." };
  const result = await activateTotp(toIdentity(session) as Parameters<typeof activateTotp>[0], factorId, code);
  if (!result.ok) return mfaProblem(result.error);
  refresh();
  return { ok: true, message: "Two-step verification is on." };
}

/** Remove an authenticator app (needs a recent step-up; the dialog asks for it). */
export async function removeFactorAction(factorId: string): Promise<StepUpOutcome> {
  const session = await currentSession();
  if (!session?.envelopeJwt) return { ok: false, signin: true, message: "Your session has ended. Sign in again." };
  const result = await revokeTotp(toIdentity(session) as Parameters<typeof revokeTotp>[0], factorId, "USER_REQUESTED");
  if (!result.ok) {
    if (result.error.message.includes("step_up_required")) return { ok: false, message: "step_up_required" };
    return mfaProblem(result.error);
  }
  refresh();
  return { ok: true, message: "Authenticator app removed." };
}
