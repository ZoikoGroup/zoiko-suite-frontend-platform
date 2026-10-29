// Browser client for the ZoikoSuite Assistant (public-ai-svc).
//
// The assistant is PUBLIC_ANONYMOUS by design (backend INV-01, Doc 06 TB-X).
// Every call goes to the same-origin /public-ai/v1/* route (see
// app/public-ai/v1/[...path]/route.ts) with credentials: "omit", so the
// browser attaches no site cookie, and the only headers are the assistant's
// own: Content-Type, Idempotency-Key and the X-Public-Chat-Session grant. This
// module never reads cookies, tokens, storage, dashboard state or the DOM.

const TIMEOUT_MS = 20_000;
const BASE = "/public-ai/v1";

export type TurnStatus = "ANSWERED" | "CLARIFY" | "REFUSED_ACTION" | "ABSTAIN" | "HANDOFF" | "UNAVAILABLE";

export type PublicAISession = {
  session_id: string;
  session_grant: string;
  expires_at: string;
};

export type Citation = { source_version_id: string; claim_ids: string[]; url_key: string };
export type RouteAction = { type: "OPEN_OFFICIAL_ROUTE"; route_key: string };
export type Chip = { label: string; message: string };

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
  /** How much of the answer is a governed fact (never set by the model). */
  answer_class: "VERIFIED_FACT" | "STATUS_QUALIFIED" | "PROCESS_EXPLANATION" | "HANDOFF_UNKNOWN";
  /** Governed status from the signed claim registry only (VERIFIED, Available, Unverified, ...). */
  status_label?: string;
  /** The market a qualified answer is scoped to. */
  market_code?: string;
  /** CLARIFY only: one question, options are market codes, OTHER and GENERAL_OVERVIEW. */
  clarification?: { slot: string; question: string; options: string[] };
  /** Second intent of a two-part question (e.g. plans and trial). */
  secondary_intent_id?: string;
  /** Why the turn ended this way (ANSWERED, MARKET_REQUIRED, LIVE_PLATFORM_DATA, KILL_SWITCH, ...). */
  reason?: string;
  /** Pre-approved follow-up questions, shown as chips. */
  suggestions?: Chip[];
  /** Answered from articles owners have not approved yet (local/dev only). */
  draft?: boolean;
};

export const OVERVIEW_OPTION = "GENERAL_OVERVIEW";
export const OTHER_OPTION = "OTHER";

export type PublicAIConfig = {
  assistant_display_name: string;
  supported_locales: string[];
  market_choices: string[];
  /** Official destinations with real URLs only; placeholder routes are never sent. */
  public_routes: { route_key: string; url: string }[];
  /** Approved source titles; url is "" when no real public page exists. */
  citation_links: { url_key: string; url: string; title: string }[];
  /** Pre-approved UI wording keyed ui.* (plain text). */
  microcopy?: Record<string, string>;
  /** Starter questions keyed by page_context. */
  chips?: Record<string, Chip[]>;
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

export type FeedbackRating = "useful" | "not_useful";
export type FeedbackReason = "" | "incorrect" | "incomplete" | "not_relevant" | "unclear" | "other";

async function call<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  init: { body?: unknown; grant?: string; idempotencyKey?: string } = {},
): Promise<PublicAIResult<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.grant) headers["X-Public-Chat-Session"] = init.grant;
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "omit", // never the site's cookies
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
    return { ok: false, error: { kind: response.status >= 500 ? "unreachable" : "malformed", status: response.status, requestId } };
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

export function startAssistantSession(idempotencyKey: string, locale = "en-US") {
  return call<PublicAISession>("POST", "/sessions", { body: { schema_version: "1.0", locale }, idempotencyKey });
}

/**
 * marketCode is the visitor's own choice from a clarification (never an
 * entitlement); pageContext is the public page the widget is on.
 */
export function askAssistant(grant: string, sessionId: string, clientTurnId: string, message: string, marketCode?: string, pageContext = "other") {
  return call<TurnEnvelope>("POST", "/turns", {
    body: {
      schema_version: "1.0",
      session_id: sessionId,
      client_turn_id: clientTurnId,
      message,
      page_context: pageContext,
      ...(marketCode ? { market_code: marketCode } : {}),
    },
    grant,
    idempotencyKey: clientTurnId,
  });
}

export function endAssistantSession(grant: string, sessionId: string) {
  return call<void>("DELETE", `/sessions/${encodeURIComponent(sessionId)}`, { grant });
}

export function loadAssistantConfig() {
  return call<PublicAIConfig>("GET", "/config");
}

/** Doc 01 FR-09: rate an answer. Enums only; no free text. */
export function rateAssistantAnswer(grant: string, sessionId: string, turnId: string, rating: FeedbackRating, reason: FeedbackReason) {
  return call<void>("POST", `/turns/${encodeURIComponent(turnId)}/feedback`, {
    body: { schema_version: "1.0", session_id: sessionId, rating, ...(reason ? { reason } : {}) },
    grant,
  });
}

/** Doc 05 §21: record that an official route was opened (route-only; creates nothing). */
export function recordAssistantHandoff(grant: string, sessionId: string, routeKey: string) {
  return call<{ route_key: string; url: string }>("POST", "/handoffs", {
    body: { schema_version: "1.0", session_id: sessionId, route_key: routeKey },
    grant,
  });
}
