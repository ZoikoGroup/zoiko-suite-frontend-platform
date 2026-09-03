// The console's half of the ZoikoSuite Canonical Service Input Contract
// (ZS-ARCH-SVC-001 v2.0 §4).
//
// Every backend now parses this envelope and, on material state changes,
// refuses a request that is missing a mandatory field with
// `{"error":"envelope_incomplete", violations:[...]}`. Building it here rather
// than in each of the ~30 lib/api modules means a caller cannot forget it, and
// means adding a field later is one edit rather than thirty.

/** §4 source_channel. The console is a browser-facing web surface. */
export const SOURCE_CHANNEL = "web";

/**
 * Caller identity, forwarded as the X-*-Id headers every backend trusts.
 *
 * In production these are set by Traefik from gateway-auth-svc's ForwardAuth
 * check of the signed identity envelope, and a service that receives a request
 * without them fails closed. The local single-port gateway routes deliberately
 * carry no ForwardAuth middleware, so the console supplies them from the
 * session instead — see lib/auth.ts.
 *
 * Sending these matters beyond writes: services with row-level security read
 * X-Tenant-Id to scope the query, and a read that omits it comes back 404 or
 * empty rather than failing loudly.
 */
export type Identity = {
  principalId?: string;
  tenantId?: string;
  legalEntityId?: string;

  /**
   * The signed IdentityContextEnvelope from identity-context-svc, when the
   * session has one. Sent as `Authorization: Bearer`.
   *
   * This is the field that matters the day the gateway goes in front. Today
   * ZOIKO_USE_GATEWAY is false and the console talks to service ports directly,
   * so services read the X-*-Id headers below and nothing verifies a token. With
   * Traefik in front, gateway-auth-svc verifies THIS against identity-svc's JWKS
   * and overwrites those headers from the verified claims — at which point the
   * headers become an unverified hint and the envelope becomes the identity.
   * Sending both now means the switch is a routing change, not a code change.
   */
  envelopeJwt?: string;
};

/**
 * The §4 fields a caller may set per request. Everything not listed here is
 * either filled in automatically (request_id, source_channel) or resolved by
 * the server and not the console's to assert (jurisdiction_context).
 */
export type EnvelopeOptions = {
  /** End-to-end business trace. Generated when absent. */
  correlationId?: string;

  /**
   * §4 idempotency_key — mandatory for material state changes (INV-08).
   *
   * Pass one explicitly whenever a retry of the *same user action* must be
   * collapsed rather than duplicated: a double-clicked "Post journal" should
   * produce one journal, and it only does if both clicks carry the same key.
   * Left unset, each call gets a fresh key, which is correct for genuinely
   * distinct actions and wrong for retries — so a form that can be resubmitted
   * should derive a key from the draft it is submitting.
   */
  idempotencyKey?: string;

  /**
   * §4 purpose_context — "required for governed sensitive access". Backends
   * covering personal, bank, tax, payroll or privileged content refuse writes
   * without it, so the reason for access is on record before the data moves.
   */
  purposeContext?: string;

  /** §4 operation. Omitted by default: the server derives it from the route. */
  operation?: string;

  /** §4 causation_id — the prior action or event that caused this one. */
  causationId?: string;

  /** §4 expected_version — optimistic concurrency, taken from a prior read. */
  expectedVersion?: string;

  /** §4 workflow_instance_id / approval_reference — approval correlation. */
  workflowInstanceId?: string;
  approvalReference?: string;

  /** §4 evidence_refs — supporting document/evidence links. */
  evidenceRefs?: string[];

  /**
   * §4 occurred_at — when the underlying business event actually happened, as
   * distinct from when the console submitted it. RFC3339; the backend refuses
   * any other format rather than guessing day/month order.
   */
  occurredAt?: string;

  /** §4 effective_at — when the record becomes effective, if not now. */
  effectiveAt?: string;

  /** §4 timezone — required for time-sensitive actions. IANA name. */
  timezone?: string;
};

export type BuildEnvelopeInput = EnvelopeOptions & {
  identity?: Identity;
  /** True for POST/PUT/PATCH/DELETE, which adds the idempotency key. */
  materialWrite: boolean;
};

/**
 * Build the §4 headers for one request.
 *
 * Empty values are dropped rather than sent blank: the backend treats a present
 * header as an assertion, and an empty X-Purpose-Context would claim a purpose
 * was given when none was.
 */
export function envelopeHeaders(input: BuildEnvelopeInput): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Request-Id": crypto.randomUUID(),
    "X-Correlation-ID": input.correlationId ?? crypto.randomUUID(),
    "X-Source-Channel": SOURCE_CHANNEL,
  };

  const set = (key: string, value: string | undefined) => {
    if (value !== undefined && value !== "") headers[key] = value;
  };

  set("X-Principal-Id", input.identity?.principalId);
  set("X-Tenant-Id", input.identity?.tenantId);
  set("X-Legal-Entity-Id", input.identity?.legalEntityId);

  // Not a §4 field — §4 describes the context a request carries, and this is the
  // credential that proves it. Set here anyway because this function is the one
  // choke point every outbound call already passes through, so an envelope
  // added to a session reaches every service without touching 58 API modules.
  set("Authorization", input.identity?.envelopeJwt ? `Bearer ${input.identity.envelopeJwt}` : undefined);

  set("X-Operation", input.operation);
  set("X-Causation-Id", input.causationId);
  set("X-Purpose-Context", input.purposeContext);
  set("X-Expected-Version", input.expectedVersion);
  set("X-Workflow-Instance-Id", input.workflowInstanceId);
  set("X-Approval-Reference", input.approvalReference);
  set("X-Occurred-At", input.occurredAt);
  set("X-Effective-At", input.effectiveAt);
  set("X-Timezone", input.timezone);

  if (input.evidenceRefs?.length) {
    headers["X-Evidence-Refs"] = input.evidenceRefs.join(",");
  }

  // Only on material writes. Sending one on a GET is harmless but misleading —
  // it suggests the read is something the server should be deduplicating.
  if (input.materialWrite) {
    headers["Idempotency-Key"] = input.idempotencyKey ?? crypto.randomUUID();
  }

  return headers;
}

/** One unmet §4 obligation, as the backends report it. */
export type EnvelopeViolation = {
  field: string;
  header: string;
  reason: string;
};

type EnvelopeRefusal = {
  error?: string;
  service?: string;
  violations?: EnvelopeViolation[];
};

/**
 * Pull the per-field violations out of a refusal body, or null if the response
 * was not an envelope refusal.
 *
 * These are read from the structured `violations` array rather than from the
 * folded message string. A refusal routinely names five or six missing headers
 * at once, and the folded form gives the reader one sentence with no way to
 * tell which header to add — the same failure schema-registry-svc's `violations`
 * already demonstrated.
 */
export function envelopeViolations(body: unknown): EnvelopeViolation[] | null {
  if (typeof body !== "object" || body === null) return null;
  const refusal = body as EnvelopeRefusal;
  if (refusal.error !== "envelope_incomplete") return null;
  return refusal.violations ?? [];
}
