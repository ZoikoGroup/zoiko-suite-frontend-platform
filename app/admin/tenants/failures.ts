// Shared failure-mapping and session helpers for the tenant-registry Server
// Actions.
//
// Extracted from actions.ts, not duplicated: a "use server" module may only
// export async functions, so a second actions file cannot import `classify`
// from the first. Two copies of this mapping would drift, and the thing that
// would drift is the distinction between "you lack a grant" and "this tenant
// may not transact" -- which is the distinction the whole file exists to keep.

import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, toIdentity, type SessionIdentity } from "@/lib/auth";
import type { ApiError } from "@/lib/api/client";

export const PATH = "/admin/tenants";

export const EXPIRED_MESSAGE = "Your session has expired — sign in again.";

export async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return toIdentity(session);
}

/**
 * Turn a "YYYY-MM-DD" from a date input into the RFC3339 the service needs.
 *
 * effective_from decodes into a Go time.Time, so a bare date fails the JSON
 * decode with a 400 that names the whole body rather than the field — which
 * looks like the field was omitted. Midnight UTC is used so the date a user
 * picked is the date that is stored.
 */
export function toRFC3339(date: string): string {
  return `${date}T00:00:00Z`;
}

/**
 * Map a backend failure onto the state vocabulary.
 *
 * 401 and 403 are kept apart deliberately: the first means the gateway
 * forwarded no verified principal, the second that this principal has no
 * grant. 503 is neither — the decision could not be obtained and nothing was
 * written, so the reader should retry rather than change anything.
 */
export type FailureKind =
  | "unauthenticated"
  | "unauthorized"
  | "unvalidated"
  | "conflict"
  | "illegal"
  | "tenant-context"
  | "error";

export function failureKind(error: ApiError): { kind: FailureKind; message: string } {
  // Checked before status, because a GOV-01 refusal reuses 403 and 503 for
  // reasons that have nothing to do with this principal's grants or with the
  // registry's own health. gateway-auth-svc resolves the tenant before Traefik
  // forwards anything, so these never reached the service at all.
  if (error.tenantContext === "denied") {
    return {
      kind: "tenant-context",
      message:
        "The gateway refused this request before it reached the registry: the tenant on your session is not in a state that may transact, or the legal entity on it belongs to a different tenant. " +
        "This is not a permissions problem — a grant will not change it. Check the tenant's status and lifecycle_state.",
    };
  }
  if (error.tenantContext === "unresolved") {
    return {
      kind: "unvalidated",
      message:
        "The gateway could not reach the tenant registry to confirm your tenant may transact, so it refused the request rather than assuming. Nothing was written — retry when the registry is back.",
    };
  }
  if (error.status === 401) {
    return {
      kind: "unauthenticated",
      message:
        "The registry received no verified principal for this request. The console sends one, so this points at gateway or service wiring rather than your permissions.",
    };
  }
  if (error.status === 403) {
    return {
      kind: "unauthorized",
      message:
        "authorization-svc refused this action for your principal. It needs the matching grant against this tenant — or, for provisioning, against the platform scope.",
    };
  }
  if (error.status === 503) {
    return {
      kind: "unvalidated",
      message:
        "A service this write depends on could not be reached, so the registry refused it rather than guessing. Nothing was written — retry when it is back.",
    };
  }
  if (error.status === 409) {
    return { kind: "conflict", message: error.message };
  }
  if (error.status === 422) {
    return { kind: "illegal", message: error.message };
  }
  return { kind: "error", message: error.message };
}

/**
 * Narrow a failure to the states a particular form can actually render.
 *
 * Each form models a different subset — a lifecycle transition has no
 * `conflict`, provisioning has no `illegal` — and a status the form's tone map
 * does not know would render as an untoned banner. Anything outside the
 * supported set falls back to `error` while keeping the backend's message, so
 * the reason survives even when the category does not.
 */
export function classify<S extends string>(
  error: ApiError,
  supported: readonly S[],
): { status: S | "error"; message: string } {
  const { kind, message } = failureKind(error);
  return {
    status: (supported as readonly string[]).includes(kind) ? (kind as S) : "error",
    message,
  };
}
