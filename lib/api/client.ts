// Server-only HTTP client for the ZoikoSuite backend.
//
// SERVER-ONLY BY DESIGN. The Go services ship no CORS middleware, so a browser
// fetch straight to :8083 would be blocked by the preflight. Fetching from
// Server Components sidesteps CORS entirely and keeps backend hostnames off the
// client. Never import this from a "use client" component.
//
// Note on caching: in Next.js 16 fetch is uncached by default, so dashboard
// panels always read live state without an explicit no-store.

import { REQUEST_TIMEOUT_MS, serviceUrl, type ServiceName } from "./config";

/**
 * Result of a backend call. Deliberately a union rather than a throw: one
 * unavailable service should degrade its own panel to an empty state, not take
 * down the whole dashboard render.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export type ApiError = {
  kind: "unreachable" | "timeout" | "http" | "malformed";
  status?: number;
  message: string;
};

/**
 * Resolved caller identity, forwarded as the X-*-Id headers every backend
 * trusts.
 *
 * In production these are set by Traefik from gateway-auth-svc's ForwardAuth
 * check of the signed identity envelope, and a service that receives a request
 * without them fails closed. The local single-port gateway routes deliberately
 * carry no ForwardAuth middleware, so the console supplies them from the
 * session instead — see lib/auth.ts DEMO_IDENTITY.
 *
 * Sending these matters beyond writes: services with row-level security read
 * X-Tenant-Id to scope the query, and a read that omits it comes back 404 or
 * empty rather than failing loudly.
 */
export type Identity = {
  principalId?: string;
  tenantId?: string;
  legalEntityId?: string;
};

type GetOptions = {
  /** Query parameters. Undefined and empty values are dropped. */
  query?: Record<string, string | number | undefined>;
  /** Propagated to the backend as X-Correlation-ID for cross-service tracing. */
  correlationId?: string;
  identity?: Identity;
};

function identityHeaders(identity: Identity | undefined): Record<string, string> {
  if (!identity) return {};
  const headers: Record<string, string> = {};
  if (identity.principalId) headers["X-Principal-Id"] = identity.principalId;
  if (identity.tenantId) headers["X-Tenant-Id"] = identity.tenantId;
  if (identity.legalEntityId) headers["X-Legal-Entity-Id"] = identity.legalEntityId;
  return headers;
}

/**
 * GET a JSON resource from a backend service.
 *
 * Every ZoikoSuite service accepts an optional X-Correlation-ID and echoes it
 * into its logs and emitted events, so we always send one — that's what makes a
 * dashboard read traceable through the audit pipeline.
 */
export async function apiGet<T>(
  service: ServiceName,
  path: string,
  options: GetOptions = {},
): Promise<ApiResult<T>> {
  const url = new URL(serviceUrl(service) + path);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const correlationId = options.correlationId ?? crypto.randomUUID();

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Correlation-ID": correlationId,
        ...identityHeaders(options.identity),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    // AbortSignal.timeout rejects with a TimeoutError DOMException; anything
    // else at this layer means we never reached the service at all.
    const isTimeout = cause instanceof DOMException && cause.name === "TimeoutError";
    return {
      ok: false,
      error: {
        kind: isTimeout ? "timeout" : "unreachable",
        message: isTimeout
          ? `${service} did not respond within ${REQUEST_TIMEOUT_MS}ms`
          : `${service} is unreachable at ${serviceUrl(service)}`,
      },
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: {
        kind: "http",
        status: response.status,
        message: `${service} returned ${response.status} for ${path}`,
      },
    };
  }

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return {
      ok: false,
      error: { kind: "malformed", message: `${service} returned a non-JSON body for ${path}` },
    };
  }
}

/** Successful write, carrying the backend's status so callers can tell 201 from 200. */
export type ApiWriteResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; error: ApiError };

/**
 * POST a JSON body to a backend service.
 *
 * Unlike apiGet this surfaces the HTTP status on success, because several
 * ZoikoSuite services distinguish 201 (a real state transition was recorded)
 * from 200 (the submitted state matched what was already stored, so nothing was
 * written). Collapsing those would hide a governance-relevant fact.
 *
 * A 4xx body is parsed and its `error` / `field` keys are folded into the
 * message so validation failures reach the UI intact instead of as "400".
 */
export async function apiPost<T>(
  service: ServiceName,
  path: string,
  body: unknown,
  options: { correlationId?: string; identity?: Identity } = {},
): Promise<ApiWriteResult<T>> {
  const url = serviceUrl(service) + path;
  const correlationId = options.correlationId ?? crypto.randomUUID();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Correlation-ID": correlationId,
        ...identityHeaders(options.identity),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const isTimeout = cause instanceof DOMException && cause.name === "TimeoutError";
    return {
      ok: false,
      error: {
        kind: isTimeout ? "timeout" : "unreachable",
        message: isTimeout
          ? `${service} did not respond within ${REQUEST_TIMEOUT_MS}ms`
          : `${service} is unreachable at ${serviceUrl(service)}`,
      },
    };
  }

  if (!response.ok) {
    // Services are not uniform about which key carries the human-readable part:
    // configuration-feature-flag-svc uses `message`, purchase-order-svc uses
    // `detail`, and validation failures everywhere use `field`. Collect all of
    // them rather than picking one and silently losing the others.
    const detail = await response
      .json()
      .then((body: { error?: string; field?: string; message?: string; detail?: string }) =>
        [body.error, body.field, body.message, body.detail].filter(Boolean).join(": "),
      )
      .catch(() => "");

    return {
      ok: false,
      error: {
        kind: "http",
        status: response.status,
        message: detail
          ? `${service} rejected the write (${response.status}) — ${detail}`
          : `${service} returned ${response.status} for ${path}`,
      },
    };
  }

  try {
    return { ok: true, status: response.status, data: (await response.json()) as T };
  } catch {
    return {
      ok: false,
      error: { kind: "malformed", message: `${service} returned a non-JSON body for ${path}` },
    };
  }
}
