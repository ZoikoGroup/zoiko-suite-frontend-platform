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
  beginPasskeyRegistration,
  beginPasskeyStepUp,
  enrollTotp,
  finishPasskeyRegistration,
  finishPasskeyStepUp,
  identityProblemCode,
  resolveIdentity,
  revokePasskey,
  revokeTotp,
  stepUp,
  type PasskeyCeremony,
  type TotpEnrollment,
} from "@/lib/api/identity";
import type { ApiError } from "@/lib/api/client";
import type { AuthzResult } from "@/app/admin/authorization/state";

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

/** The service's message and its stable problem code, for matching on either. */
function problemText(error: ApiError): string {
  return `${error.message} ${identityProblemCode(error)}`;
}

function mfaProblem(error: ApiError): StepUpOutcome {
  const m = problemText(error);
  if (m.includes("passkey_rejected")) return { ok: false, message: "The passkey was not accepted. Try again, or use your authenticator app." };
  if (m.includes("ceremony_invalid")) return { ok: false, message: "That passkey prompt expired. Start again." };
  if (m.includes("passkey_duplicate")) return { ok: false, message: "This passkey is already registered to your account." };
  if (m.includes("passkeys_not_configured")) return { ok: false, message: "Passkeys are not available on this deployment." };
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
  | { ok: false; message: string; signin?: boolean; stepUp?: boolean };

/** Start setting up an authenticator app: a secret shown once, as a QR code. */
export async function beginEnrolmentAction(): Promise<EnrolOutcome> {
  const session = await currentSession();
  if (!session?.envelopeJwt) return { ok: false, signin: true, message: "Sign in through the identity service to set up two-step verification." };
  const result = await enrollTotp(toIdentity(session) as Parameters<typeof enrollTotp>[0]);
  if (!result.ok) {
    // Beside an existing factor (a passkey, or an app being replaced) the
    // service asks for a fresh verification first.
    if (problemText(result.error).includes("step_up_required")) return { ok: false, stepUp: true, message: "Verify it's you first." };
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
    if (problemText(result.error).includes("step_up_required")) return { ok: false, message: "step_up_required" };
    return mfaProblem(result.error);
  }
  refresh();
  return { ok: true, message: "Authenticator app removed." };
}

// ─── Passkeys (WebAuthn) ─────────────────────────────────────────────────────
//
// The browser runs navigator.credentials (lib/webauthn-browser.ts); these
// carry the service's options to it and its answer back. A passkey step-up
// refreshes the session's envelope exactly as a code does, at assurance
// PHISHING_RESISTANT.

export type CeremonyOutcome =
  | { ok: true; ceremony: PasskeyCeremony }
  | { ok: false; message: string; signin?: boolean; stepUp?: boolean; notEnrolled?: boolean };

function ceremonyProblem(error: ApiError): CeremonyOutcome {
  if (problemText(error).includes("step_up_required")) return { ok: false, stepUp: true, message: "Verify it's you before adding another factor." };
  const p = mfaProblem(error);
  return { ok: false, message: p.message, signin: p.signin, notEnrolled: p.notEnrolled };
}

/** Start registering a passkey: the options for navigator.credentials.create. */
export async function beginPasskeyAction(): Promise<CeremonyOutcome> {
  const session = await currentSession();
  if (!session?.envelopeJwt) return { ok: false, signin: true, message: "Sign in through the identity service to add a passkey." };
  const result = await beginPasskeyRegistration(toIdentity(session) as Parameters<typeof beginPasskeyRegistration>[0]);
  return result.ok ? { ok: true, ceremony: result.data } : ceremonyProblem(result.error);
}

/** Finish registering: the service verifies the authenticator's answer and stores the passkey. */
export async function finishPasskeyAction(ceremony: string, credential: unknown, nickname: string): Promise<StepUpOutcome> {
  const session = await currentSession();
  if (!session?.envelopeJwt) return { ok: false, signin: true, message: "Your session has ended. Sign in again." };
  const result = await finishPasskeyRegistration(
    toIdentity(session) as Parameters<typeof finishPasskeyRegistration>[0],
    ceremony,
    credential,
    nickname.trim().slice(0, 100),
  );
  if (!result.ok) return mfaProblem(result.error);
  refresh();
  return { ok: true, message: "Passkey added." };
}

/** Start a passkey step-up: the options for navigator.credentials.get. */
export async function beginPasskeyStepUpAction(): Promise<CeremonyOutcome> {
  const session = await currentSession();
  if (!session?.envelopeJwt) return { ok: false, signin: true, message: "Your session has ended. Sign in again." };
  const result = await beginPasskeyStepUp(toIdentity(session) as Parameters<typeof beginPasskeyStepUp>[0]);
  return result.ok ? { ok: true, ceremony: result.data } : ceremonyProblem(result.error);
}

/** Finish a passkey step-up and refresh the session's envelope. */
export async function finishPasskeyStepUpAction(ceremony: string, credential: unknown): Promise<StepUpOutcome> {
  const session = await currentSession();
  if (!session?.envelopeJwt) return { ok: false, signin: true, message: "Your session has ended. Sign in again." };
  const result = await finishPasskeyStepUp(toIdentity(session) as Parameters<typeof finishPasskeyStepUp>[0], ceremony, credential);
  if (!result.ok) return mfaProblem(result.error);
  const envelope = await adoptToken(session, result.data.access_token);
  if (!envelope) return { ok: false, message: "Verified, but the session could not be refreshed. Sign in again." };
  return { ok: true, message: "Verified with your passkey." };
}

/** Remove a passkey (needs a recent step-up; the caller asks for it). */
export async function removePasskeyAction(credentialId: string): Promise<StepUpOutcome> {
  const session = await currentSession();
  if (!session?.envelopeJwt) return { ok: false, signin: true, message: "Your session has ended. Sign in again." };
  const result = await revokePasskey(toIdentity(session) as Parameters<typeof revokePasskey>[0], credentialId, "USER_REQUESTED");
  if (!result.ok) {
    if (problemText(result.error).includes("step_up_required")) return { ok: false, message: "step_up_required" };
    return mfaProblem(result.error);
  }
  refresh();
  return { ok: true, message: "Passkey removed." };
}

/**
 * The security page's drawer commands, in the console's result shape so the
 * shared ActionDialog asks for a fresh second factor and retries.
 */
export async function securityCommand(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const id = String(fd.get("id") ?? "");
  const kind = String(fd.get("kind") ?? "");
  if (!id) return { status: "error", message: "Nothing to remove." };
  const r = kind === "WEBAUTHN" ? await removePasskeyAction(id) : await removeFactorAction(id);
  if (r.ok) return { status: "done", message: r.message };
  if (r.message === "step_up_required") return { status: "step_up", message: "Verify it's you to continue." };
  if (r.signin) return { status: "signin", message: r.message };
  return { status: "refused", message: r.message };
}
