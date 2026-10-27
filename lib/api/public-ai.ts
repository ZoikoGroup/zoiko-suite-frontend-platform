// Server-only client for public-ai-svc (Suivo, Release R0) — the public,
// anonymous ZoikoSuite assistant.
//
// Deliberately NOT built on ./client.ts: that client attaches the console's
// identity envelope (X-Principal-Id / X-Tenant-Id / X-Legal-Entity-Id). The
// public assistant must never receive a staff or tenant identity — it is
// PUBLIC_ANONYMOUS by design (backend INV-01, Doc 06 TB-X). Never import this
// from a "use client" component.

const DEFAULT_URL = "http://127.0.0.1:18080";
const DEFAULT_ORIGIN = "http://localhost:3000";
const TIMEOUT_MS = 20_000;

function baseUrl(): string {
  return (process.env.ZOIKO_PUBLIC_AI_URL ?? DEFAULT_URL).replace(/\/+$/, "");
}

// The service enforces a first-party Origin allowlist. Calls are made from
// the Next.js server, so the console states its own origin explicitly; it
// must be listed in the backend's PUBLIC_AI_ALLOWED_ORIGINS.
function origin(): string {
  return process.env.ZOIKO_PUBLIC_AI_ORIGIN ?? DEFAULT_ORIGIN;
}

export type TurnStatus = "ANSWERED" | "CLARIFY" | "REFUSED_ACTION" | "ABSTAIN" | "HANDOFF" | "UNAVAILABLE";

export type PublicAISession = {
  session_id: string;
  session_grant: string;
  expires_at: string;
};

export type Citation = { source_version_id: string; claim_ids: string[]; url_key: string };
export type RouteAction = { type: "OPEN_OFFICIAL_ROUTE"; route_key: string };

export type TurnEnvelope = {
  turn_id: string;
  request_id: string;
  turn_sequence: number;
  status: TurnStatus;
  intent_id: string;
  text: string;
  citations: Citation[];
  actions: RouteAction[];
  knowledge_release_id: string;
  flags?: { requires_human?: boolean };
};

export type PublicAIConfig = {
  assistant_display_name: string;
  supported_locales: string[];
  market_choices: string[];
  public_routes: { route_key: string; url: string }[];
  citation_links: { url_key: string; url: string; title: string }[];
};

/** A refusal or failure, safe to show. Problem codes come from Doc 05 §13. */
export type PublicAIError = {
  kind: "unreachable" | "timeout" | "http" | "malformed";
  status?: number;
  code?: string;
  requestId?: string;
  retryAfterSeconds?: number;
};

export type PublicAIResult<T> = { ok: true; data: T } | { ok: false; error: PublicAIError };

async function call<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  init: { body?: unknown; grant?: string; idempotencyKey?: string } = {},
): Promise<PublicAIResult<T>> {
  const headers: Record<string, string> = { Origin: origin(), Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.grant) headers["X-Public-Chat-Session"] = init.grant;
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/public-ai/v1${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, error: { kind: timeout ? "timeout" : "unreachable" } };
  }

  const requestId = response.headers.get("X-Request-ID") ?? undefined;
  if (response.status === 204) return { ok: true, data: undefined as T };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: { kind: "malformed", status: response.status, requestId } };
  }
  if (!response.ok) {
    const problem = body as { code?: string; request_id?: string };
    const retry = Number(response.headers.get("Retry-After"));
    return {
      ok: false,
      error: {
        kind: "http",
        status: response.status,
        code: typeof problem?.code === "string" ? problem.code : undefined,
        requestId: problem?.request_id ?? requestId,
        retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : undefined,
      },
    };
  }
  return { ok: true, data: body as T };
}

export function createPublicAISession(idempotencyKey: string, locale = "en-US") {
  return call<PublicAISession>("POST", "/sessions", {
    body: { schema_version: "1.0", locale },
    idempotencyKey,
  });
}

export function sendPublicAITurn(grant: string, sessionId: string, clientTurnId: string, message: string) {
  return call<TurnEnvelope>("POST", "/turns", {
    body: { schema_version: "1.0", session_id: sessionId, client_turn_id: clientTurnId, message },
    grant,
    idempotencyKey: clientTurnId,
  });
}

export function endPublicAISession(grant: string, sessionId: string) {
  return call<void>("DELETE", `/sessions/${encodeURIComponent(sessionId)}`, { grant });
}

export function getPublicAIConfig() {
  return call<PublicAIConfig>("GET", "/config");
}

export type FeedbackRating = "useful" | "not_useful";
export type FeedbackReason = "" | "incorrect" | "incomplete" | "not_relevant" | "unclear" | "other";

/** Doc 01 FR-09: rate an answer. Enums only; no free text leaves the console. */
export function sendPublicAIFeedback(grant: string, sessionId: string, turnId: string, rating: FeedbackRating, reason: FeedbackReason) {
  return call<void>("POST", `/turns/${encodeURIComponent(turnId)}/feedback`, {
    body: { schema_version: "1.0", session_id: sessionId, rating, ...(reason ? { reason } : {}) },
    grant,
  });
}

/** Doc 05 §21: record that an official route was opened (route-only; creates nothing). */
export function recordPublicAIHandoff(grant: string, sessionId: string, routeKey: string) {
  return call<{ route_key: string; url: string }>("POST", "/handoffs", {
    body: { schema_version: "1.0", session_id: sessionId, route_key: routeKey },
    grant,
  });
}
