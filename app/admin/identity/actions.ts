"use server";

// Every command on the Identity Context console. Each one is a governed write
// at identity-context-svc: the service authorizes it at authorization-svc,
// records a reason, refuses a stale record (If-Match from record_version) and,
// for the privileged ones, asks for a fresh second factor — which the shared
// ActionDialog turns into a code prompt and a retry of the same request.
//
// Results use the Authorization console's shape (AuthzResult), so the same
// dialog renders both pages.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, toIdentity, type SessionIdentity } from "@/lib/auth";
import type { ApiError } from "@/lib/api/client";
import {
  approveSupportContext,
  createSubject,
  explainIdentityError,
  identityProblemCode,
  invalidateSession,
  mergeSubjects,
  requestPasswordReset,
  resetPrincipalMfa,
  revokeSupportContext,
  setPrincipalStatus,
  type PrincipalStatus,
} from "@/lib/api/identity";
import type { AuthzResult } from "@/app/admin/authorization/state";

type Caller = SessionIdentity & { principalId: string; tenantId: string };

async function caller(): Promise<Caller | null> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email || !session.principalId || !session.tenantId) return null;
  return toIdentity(session) as Caller;
}

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/** The reason every governed change carries: the code, and the note when there is one. */
function reasonOf(fd: FormData): string | null {
  const code = text(fd, "reason_code");
  const note = text(fd, "reason_note");
  if (!code) return null;
  if (code === "OTHER" && !note) return null;
  return note ? `${code}: ${note}` : code;
}

function fail(error: ApiError): AuthzResult {
  const code = identityProblemCode(error);
  if (code === "step_up_required" || error.message.includes("step_up_required")) {
    return { status: "step_up", message: "Verify it's you to continue." };
  }
  if (error.status === 401 && /session_(invalid|revoked)|identity_assertion/.test(code + error.message)) {
    return { status: "signin", message: "Your session has ended. Sign in again." };
  }
  if (error.status === 412 || code === "stale_version") {
    return { status: "refused", message: "Someone changed this record since you opened it. Reload the page and try again." };
  }
  const refused = error.status === 403 || error.status === 409 || error.status === 401;
  return { status: refused ? "refused" : "error", message: explainIdentityError(error.message, code) };
}

const EXPIRED: AuthzResult = { status: "signin", message: "Your session has ended. Sign in again." };

export async function identityCommand(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const me = await caller();
  if (!me) return EXPIRED;
  const command = text(fd, "command");
  const id = text(fd, "id");
  const version = Number(text(fd, "expected_version"));
  const reason = reasonOf(fd);

  switch (command) {
    case "create": {
      const type = text(fd, "principal_type") || "HUMAN";
      const name = text(fd, "display_name");
      const email = text(fd, "email");
      if (!name) return { status: "error", message: "Give the person or workload a name." };
      if (type === "HUMAN" && !email) return { status: "error", message: "A person needs an email address for their activation link." };
      const r = await createSubject(
        me,
        { display_name: name, principal_type: type, email: email || undefined, invite: type === "HUMAN" ? fd.get("invite") === "on" : undefined },
        text(fd, "idempotency_key") || undefined,
      );
      if (!r.ok) return fail(r.error);
      refresh();
      return {
        status: "done",
        message: type === "HUMAN" ? "Person added. They activate their account from the link." : "Workload added and active.",
        details: [
          { label: "Principal", value: r.data.principal_id },
          { label: "Status", value: r.data.status },
        ],
      };
    }
    case "status": {
      const to = text(fd, "to") as PrincipalStatus;
      if (!reason) return { status: "error", message: "Choose a reason." };
      if (!Number.isInteger(version) || version < 1) return { status: "error", message: "Reload the page: this record has no version." };
      const r = await setPrincipalStatus(me, id, to, reason, version);
      if (!r.ok) return fail(r.error);
      refresh();
      return {
        status: "done",
        message: to === "ACTIVE" ? "Access restored." : "Access stopped. Every session this principal held has ended.",
      };
    }
    case "reset_request": {
      if (!reason) return { status: "error", message: "Choose a reason." };
      const r = await requestPasswordReset(me, id, reason);
      if (!r.ok) return fail(r.error);
      refresh();
      return {
        status: "pending",
        message: "Reset requested. A second administrator must approve it before the link is sent.",
        details: [{ label: "Request", value: r.data.request_id }],
      };
    }
    case "mfa_reset": {
      const code = text(fd, "reason_code");
      if (!code) return { status: "error", message: "Choose a reason." };
      const r = await resetPrincipalMfa(me, id, code, text(fd, "reason_note") || "Second factor reset from the Identity Context console");
      if (!r.ok) return fail(r.error);
      refresh();
      return { status: "done", message: "Second factor removed. They enrol a new one at next sign-in." };
    }
    case "merge": {
      const [duplicate, dupVersionText] = text(fd, "duplicate").split("|");
      const dupVersion = Number(dupVersionText);
      if (!duplicate) return { status: "error", message: "Choose the duplicate record to retire." };
      if (!reason) return { status: "error", message: "Choose a reason." };
      if (!Number.isInteger(dupVersion) || dupVersion < 1) return { status: "error", message: "Reload the page: the duplicate has no version." };
      const r = await mergeSubjects(me, id, duplicate, reason, dupVersion);
      if (!r.ok) return fail(r.error);
      refresh();
      return {
        status: "done",
        message: "Merged. The duplicate is retired, its sessions ended, and its ID now resolves to this record.",
        details: [
          { label: "Merge", value: r.data.merge_id },
          { label: "External identities moved", value: String(r.data.links_moved) },
        ],
      };
    }
    case "end_session": {
      const r = await invalidateSession({
        sessionContextId: id,
        request: { reason: "ADMIN_REVOKE" },
        actorPrincipalId: me.principalId,
        callerTenantId: me.tenantId,
        callerLegalEntityId: me.legalEntityId,
        correlationId: crypto.randomUUID(),
      });
      if (!r.ok) return fail(r.error);
      refresh();
      return { status: "done", message: "Session ended. Relying services refuse it within the revocation window." };
    }
    case "support_approve": {
      if (!Number.isInteger(version) || version < 1) return { status: "error", message: "Reload the page: this request has no version." };
      const r = await approveSupportContext(me, id, version);
      if (!r.ok) return fail(r.error);
      refresh();
      return { status: "done", message: "Support access approved. Its time window starts now." };
    }
    case "support_revoke": {
      if (!reason) return { status: "error", message: "Choose a reason." };
      const r = await revokeSupportContext({
        supportContextId: id,
        reason,
        callerTenantId: me.tenantId,
        callerPrincipalId: me.principalId,
        callerLegalEntityId: me.legalEntityId,
      });
      if (!r.ok) return fail(r.error);
      refresh();
      return { status: "done", message: "Support access revoked." };
    }
    default:
      return { status: "error", message: "Unknown command." };
  }
}
