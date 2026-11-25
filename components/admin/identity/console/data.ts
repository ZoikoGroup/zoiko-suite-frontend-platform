// Every register the Identity Context console shows, read once per request.
// Server-only. Each read keeps its own result, so a register that cannot be
// read says so in its own tab, and a KPI that depends on it shows "—" — never
// zero. The services page their lists; the console asks for one full page
// (200 rows, the service maximum) and says so when there are more.

import type { SessionIdentity } from "@/lib/auth";
import type { ApiError, ApiResult } from "@/lib/api/client";
import {
  getIdentitySummary,
  listAuthenticationEvents,
  listFederationConnections,
  listPasswordResets,
  listPrincipals,
  listSessions,
  listSupportContexts,
  type AuthenticationEvent,
  type FederationConnection,
  type IdentitySummary,
  type Page,
  type PasswordResetRequest,
  type PrincipalDetail,
  type SessionSummary,
  type SupportRow,
} from "@/lib/api/identity";

export const PAGE_MAX = 200;

/** A register's rows, or why there are none to show. `more` = the service had further pages. */
export type Read<T> = { rows: T[]; error: ApiError | null; more: boolean };

export type IdentityData = {
  summary: { data: IdentitySummary | null; error: ApiError | null };
  principals: Read<PrincipalDetail>;
  sessions: Read<SessionSummary>;
  support: Read<SupportRow>;
  events: Read<AuthenticationEvent>;
  resets: Read<PasswordResetRequest>;
  /** enabled=false: the deployment has federation off (the routes answer 404), which is a state, not an error. */
  federation: Read<FederationConnection> & { enabled: boolean };
};

type Caller = SessionIdentity & { principalId: string; tenantId: string };

function read<T>(result: ApiResult<Page<T>>): Read<T> {
  if (!result.ok) return { rows: [], error: result.error, more: false };
  return { rows: result.data.items ?? [], error: null, more: Boolean(result.data.next_cursor) };
}

export async function loadIdentity(identity: SessionIdentity): Promise<IdentityData> {
  const caller = identity as Caller;
  const [summary, principals, sessions, support, events, resets, federation] = await Promise.all([
    getIdentitySummary(caller),
    listPrincipals(caller, { pageSize: PAGE_MAX }),
    listSessions(caller, { pageSize: PAGE_MAX }),
    listSupportContexts(caller, { pageSize: PAGE_MAX }),
    listAuthenticationEvents(caller, { pageSize: PAGE_MAX }),
    listPasswordResets(caller, { pageSize: PAGE_MAX }),
    listFederationConnections(caller),
  ]);
  const federationOff = !federation.ok && federation.error.status === 404;
  return {
    summary: summary.ok ? { data: summary.data, error: null } : { data: null, error: summary.error },
    principals: read(principals),
    sessions: read(sessions),
    support: read(support),
    events: read(events),
    resets: read(resets),
    federation: federation.ok
      ? { rows: federation.data ?? [], error: null, more: false, enabled: true }
      : { rows: [], error: federationOff ? null : federation.error, more: false, enabled: !federationOff },
  };
}

/** Elevated risk: a posture other than the two ordinary ones, or a risk score of 70 or more. */
export function elevated(s: SessionSummary): boolean {
  return (s.trust_posture !== "STANDARD" && s.trust_posture !== "MFA_VERIFIED") || s.adaptive_risk_score >= 70;
}

/** A support request's state as the service derives it for filter[status]. */
export function supportState(s: SupportRow, now: number): "PENDING_APPROVAL" | "ACTIVE" | "REVOKED" | "EXPIRED" {
  if (s.revoked_at) return "REVOKED";
  if (s.approval_status === "PENDING_APPROVAL") return "PENDING_APPROVAL";
  return Date.parse(s.expires_at) > now ? "ACTIVE" : "EXPIRED";
}

/** "2 min ago", "3 hr ago", "4 days ago". */
export function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return `${Math.round(s / 86400)} days ago`;
}

/** The most recent session per principal, for the register's assurance column. */
export function latestSessionBy(sessions: SessionSummary[]): Map<string, SessionSummary> {
  const out = new Map<string, SessionSummary>();
  for (const s of sessions) {
    const prev = out.get(s.principal_id);
    if (!prev || Date.parse(s.issued_at) > Date.parse(prev.issued_at)) out.set(s.principal_id, s);
  }
  return out;
}

/** The most recent sign-in event per principal. */
export function latestEventBy(events: AuthenticationEvent[]): Map<string, AuthenticationEvent> {
  const out = new Map<string, AuthenticationEvent>();
  for (const e of events) {
    const prev = out.get(e.principal_id);
    if (!prev || Date.parse(e.occurred_at) > Date.parse(prev.occurred_at)) out.set(e.principal_id, e);
  }
  return out;
}
