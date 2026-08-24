// Server-only HTTP client for the ZoikoSuite backend.
//
// SERVER-ONLY BY DESIGN. The Go services ship no CORS middleware, so a browser
// fetch straight to :8083 would be blocked by the preflight. Fetching from
// Server Components sidesteps CORS entirely and keeps backend hostnames off the
// client. Never import this from a "use client" component.
//
// Note on caching: in Next.js 16 fetch is uncached by default, so dashboard
// panels always read live state without an explicit no-store.

import { REQUEST_TIMEOUT_MS, serviceLabel, serviceUrl, type ServiceName } from "./config";
import { envelopeHeaders, type EnvelopeOptions, type Identity } from "./envelope";

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
  /**
   * The parsed error body, when the service sent one.
   *
   * `message` folds an error body into a single human string, which is right
   * for the great majority of refusals and destructive for the few that carry
   * STRUCTURED findings. schema-registry-svc answers a breaking change with
   * `{error, violations: [...]}` — the violations name the exact field that
   * broke, and folding kept only the word "incompatible schema change". The
   * console then could not tell that 409 apart from the other 409 the same
   * endpoint returns (a lost version race) and reported a breaking change as a
   * race, telling the reader to retry when what they had to do was change the
   * schema. Retrying produced the same message forever.
   *
   * Scraping the array back out of the folded string is the wrong fix — the
   * same conclusion financial-close-svc's structured 422 reached. The body is
   * kept intact here instead, and callers that need a field read it directly.
   */
  body?: unknown;
};

// Identity moved to ./envelope, where it sits alongside the rest of the §4
// canonical input contract it is one part of. Re-exported so the ~30 lib/api
// modules that import it from here keep working.
export type { Identity, EnvelopeOptions, EnvelopeViolation } from "./envelope";

type GetOptions = EnvelopeOptions & {
  /** Query parameters. Undefined and empty values are dropped. */
  query?: Record<string, string | number | undefined>;
  identity?: Identity;
};

type WriteOptions = EnvelopeOptions & { identity?: Identity };

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

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        // materialWrite: false — a read carries no idempotency key. See envelope.ts.
        ...envelopeHeaders({ ...options, materialWrite: false }),
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
          ? `${serviceLabel(service)} did not respond within ${REQUEST_TIMEOUT_MS}ms`
          : `${serviceLabel(service)} is unreachable at ${serviceUrl(service)}`,
      },
    };
  }

  if (!response.ok) {
    // Parse the body on reads too, not only on writes. A 4xx from a GET is
    // usually a bad query parameter and the service says which one — answering
    // `invalid_from` or `missing_field: tenant_id`. Discarding that left the UI
    // with a bare status code and no way to explain a fixable mistake.
    const { detail, body: errorBody } = await readErrorDetail(response);
    return {
      ok: false,
      error: {
        kind: "http",
        status: response.status,
        message: detail
          ? `${serviceLabel(service)} rejected the request (${response.status}) — ${detail}`
          : `${serviceLabel(service)} returned ${response.status} for ${path}`,
        body: errorBody,
      },
    };
  }

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return {
      ok: false,
      error: { kind: "malformed", message: `${serviceLabel(service)} returned a non-JSON body for ${path}` },
    };
  }
}

/**
 * Pull the human-readable part out of an error body.
 *
 * Services are not uniform about which key carries it:
 * configuration-feature-flag-svc uses `message`, purchase-order-svc uses
 * `detail`, validation failures everywhere use `field`, and machine codes come
 * back under `error`. Collect all of them rather than picking one and silently
 * losing the others.
 */
async function readErrorDetail(response: Response): Promise<{ detail: string; body?: unknown }> {
  return response
    .json()
    .then((body: { error?: string; field?: string; message?: string; detail?: string }) => ({
      detail: [body.error, body.field, body.message, body.detail].filter(Boolean).join(": "),
      // Returned alongside the folded string, not instead of it: a caller that
      // needs a structured member (schema-registry-svc's `violations`) reads it
      // here rather than trying to recover it from prose. See ApiError.body.
      body: body as unknown,
    }))
    .catch(() => ({ detail: "" }));
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
  options: WriteOptions = {},
): Promise<ApiWriteResult<T>> {
  return apiWrite<T>("POST", service, path, body, options);
}

/**
 * PUT a JSON body to a backend service.
 *
 * Same semantics as apiPost. Separate because the two services are not uniform
 * about method choice for a restatement: purchase-order-svc amends with
 * POST /{id}/amend, while contract-lifecycle-svc revises with PUT /{id}.
 */
export async function apiPut<T>(
  service: ServiceName,
  path: string,
  body: unknown,
  options: WriteOptions = {},
): Promise<ApiWriteResult<T>> {
  return apiWrite<T>("PUT", service, path, body, options);
}

/**
 * PATCH a JSON body to a backend service.
 *
 * Distinct from apiPut because the semantics the services attach to it differ:
 * a PUT here restates a whole resource, while access-control-svc's
 * PATCH /v1/role-definitions/{id} is a partial update where an omitted field
 * means "leave it alone" — sending an empty role_name would not blank the name,
 * it would keep the current one. A caller must be able to express "change only
 * the status" without also having to resend every other field correctly.
 */
export async function apiPatch<T>(
  service: ServiceName,
  path: string,
  body: unknown,
  options: WriteOptions = {},
): Promise<ApiWriteResult<T>> {
  return apiWrite<T>("PATCH", service, path, body, options);
}

/**
 * DELETE a resource.
 *
 * tenant-entity-registry-svc uses DELETE for its two end-dating operations
 * (entity hierarchies and jurisdiction assignments). Despite the verb nothing
 * is removed — both set effective_to, per the no-hard-delete doctrine — and
 * both take the end date as a required `end_date` query parameter rather than
 * a body, which is why this takes `query` and no payload.
 */
export async function apiDelete<T>(
  service: ServiceName,
  path: string,
  options: WriteOptions & { query?: Record<string, string | number | undefined> } = {},
): Promise<ApiWriteResult<T>> {
  const url = new URL(serviceUrl(service) + path);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return apiWrite<T>("DELETE", service, url.toString(), undefined, options, true);
}

async function apiWrite<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  service: ServiceName,
  path: string,
  body: unknown,
  options: WriteOptions = {},
  absoluteURL = false,
): Promise<ApiWriteResult<T>> {
  const url = absoluteURL ? path : serviceUrl(service) + path;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // materialWrite: true — every method reaching here changes state, so the
        // envelope carries an idempotency key (INV-08). DELETE included: it is
        // idempotent at the HTTP level but not at the accounting level, and the
        // registry's end-dating routes use it.
        ...envelopeHeaders({ ...options, materialWrite: true }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const isTimeout = cause instanceof DOMException && cause.name === "TimeoutError";
    return {
      ok: false,
      error: {
        kind: isTimeout ? "timeout" : "unreachable",
        message: isTimeout
          ? `${serviceLabel(service)} did not respond within ${REQUEST_TIMEOUT_MS}ms`
          : `${serviceLabel(service)} is unreachable at ${serviceUrl(service)}`,
      },
    };
  }

  if (!response.ok) {
    const { detail, body: errorBody } = await readErrorDetail(response);
    return {
      ok: false,
      error: {
        kind: "http",
        status: response.status,
        message: detail
          ? `${serviceLabel(service)} rejected the write (${response.status}) — ${detail}`
          : `${serviceLabel(service)} returned ${response.status} for ${path}`,
        body: errorBody,
      },
    };
  }

  // 204 is a success with no body, and several tenant-entity-registry-svc
  // writes use it — lifecycle transitions, status transitions, and both
  // end-dating routes. Parsing it as JSON would report a completed write as
  // `malformed`, i.e. an outright failure, which is the worst possible reading
  // of "it worked".
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return { ok: true, status: response.status, data: undefined as T };
  }

  try {
    return { ok: true, status: response.status, data: (await response.json()) as T };
  } catch {
    return {
      ok: false,
      error: { kind: "malformed", message: `${serviceLabel(service)} returned a non-JSON body for ${path}` },
    };
  }
}

