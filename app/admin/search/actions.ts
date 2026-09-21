"use server";

// Server Actions for search-indexer-svc (:8096).
//
// Server Actions are reachable by direct POST, so the session is verified
// inside every action rather than relying on the proxy's /admin matcher.
//
// TWO THINGS THESE ACTIONS MUST NEVER DO.
//
// 1. Never report a 206 as a plain success. The service answers 206 Partial
//    Content when a result set is not exhaustive, and INV-24 requires that to
//    be explicit. `partial` is its own state, so a component switching on
//    status has to handle it rather than remembering to read a flag.
//
// 2. Never render a §11.3 refusal as an error. ESR-003, ESR-006 and ESR-015
//    are ANSWERS — they say exactly what the caller should change. Showing
//    them in red as "the request failed" sends the reader looking for an
//    outage instead of fixing their query.
//
// WHY THE CONTROL-PLANE ACTIONS SAY "platform" IN THEIR MESSAGES. Every write
// under Registry and Lifecycle is authorized against the PLATFORM scope, not
// the caller's legal entity, because a contract describes a shape shared by
// every tenant. A 403 here is about the SEARCH_FULL bundle in
// seed-demo-rbac.ps1, not about anything tenant-specific — and saying so
// saves the reader from checking entity-level grants that were never consulted.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  applyRestriction,
  createContract,
  createGeneration,
  createSource,
  explainReason,
  isPartial,
  reasonCodeOf,
  requestExport,
  runSearch,
  suppressedTotal,
  transitionContract,
  transitionGeneration,
  type ContractState,
  type GenerationState,
  type RetrievalClass,
} from "@/lib/api/search";
import {
  IDLE_ADMIN,
  type AdminWriteState,
  type ExportState,
  type RestrictionState,
  type SearchState,
} from "./state";

// Writes end in refresh(), not revalidatePath. Nothing on this route is cached
// — every panel reads cookies() for the session — so there is no cache for
// revalidatePath to invalidate, while in a Server Function it additionally
// refreshes every previously visited page. refresh() re-renders just this
// route, which is what these actions want.

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
    envelopeJwt: session.envelopeJwt,
  };
}

const EXPIRED = "Your session has expired — sign in again.";

// ── Governed search ──────────────────────────────────────────────────────────

export async function submitSearch(
  _previous: SearchState,
  formData: FormData,
): Promise<SearchState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const scope = String(formData.get("scope") ?? "").trim();
  const query = String(formData.get("query") ?? "").trim();
  const submitted = { scope, query };

  if (!scope) {
    return { status: "error", message: "Choose a search surface.", submitted };
  }

  const facets = String(formData.get("facets") ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const filterField = String(formData.get("filter_field") ?? "").trim();
  const filterValue = String(formData.get("filter_value") ?? "").trim();

  const result = await runSearch({
    ...identity,
    principalId: identity.principalId,
    tenantId: identity.tenantId,
    scope,
    query,
    facets,
    filters: filterField && filterValue ? { [filterField]: filterValue } : undefined,
    includeSnippets: formData.get("snippets") === "on",
    size: 20,
    cursor: String(formData.get("cursor") ?? "").trim() || undefined,
  });

  if (!result.ok) {
    const code = reasonCodeOf(result.error.body);
    // A §11.3 code means the planner made a decision. Anything else is a
    // transport failure or an unexpected 5xx.
    if (code) {
      return {
        status: "refused",
        message: explainReason(code, detailOf(result.error.body)),
        reasonCode: code,
        submitted,
      };
    }
    return { status: "error", message: result.error.message, submitted };
  }

  const response = result.data;
  if (isPartial(response)) {
    const withheld = suppressedTotal(response);
    return {
      status: "partial",
      // Says WHAT is incomplete and WHY, because "partial" on its own tells a
      // reader nothing actionable. The two causes lead to different places:
      // a shard failure is an engine incident, a suppression is either a real
      // permission boundary or authorization-svc being unreachable.
      message:
        withheld > 0
          ? `Showing ${response.results.length} result${response.results.length === 1 ? "" : "s"}. ` +
            `${withheld} candidate${withheld === 1 ? " was" : "s were"} withheld — this page is not exhaustive.` +
            (response.completeness_detail ? ` ${response.completeness_detail}.` : "")
          : `This result set is ${response.completeness_state}, not complete.` +
            (response.completeness_detail ? ` ${response.completeness_detail}.` : ""),
      response,
      submitted,
    };
  }

  return {
    status: "ok",
    message:
      response.results.length === 0
        ? "No results. The query ran and matched nothing — this is a complete answer, not a partial one."
        : `${response.results.length} of ${response.total} result${response.total === 1 ? "" : "s"}.`,
    response,
    submitted,
  };
}

// ── Registry (ESR-01) ────────────────────────────────────────────────────────

export async function submitSource(
  _previous: AdminWriteState,
  formData: FormData,
): Promise<AdminWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const sourceType = String(formData.get("source_type") ?? "").trim();
  const ownerService = String(formData.get("owner_service") ?? "").trim();
  const eventTopic = String(formData.get("event_topic") ?? "").trim();
  const eventTypes = splitList(formData.get("event_types"));
  const restrictionEventTypes = splitList(formData.get("restriction_event_types"));

  if (!sourceType || !ownerService || !eventTopic) {
    return { status: "error", message: "Owner service, source type and event topic are required." };
  }
  if (eventTypes.length === 0) {
    // The service refuses this too. Catching it here saves a round trip and
    // lets the message say why it matters: a source with no event types
    // subscribes a topic that can never produce a projection, which reads as
    // "indexing is broken".
    return {
      status: "error",
      message: "List at least one event type. A source with none subscribes a topic that can never index anything.",
    };
  }

  const result = await createSource({
    ...identity,
    principalId: identity.principalId,
    tenantId: identity.tenantId,
    ownerService,
    sourceType,
    eventTopic,
    eventTypes,
    restrictionEventTypes,
    sensitivityCeiling: String(formData.get("sensitivity_ceiling") ?? "").trim() || undefined,
    residencyRegion: String(formData.get("residency_region") ?? "").trim() || undefined,
  });

  if (!result.ok) return adminFailure(result.error, "source");

  refresh();
  return {
    status: "created",
    message: `Registered ${sourceType}. Its topic is subscribed within 30 seconds — no redeploy needed. Draft a contract next.`,
    source: result.data,
  };
}

export async function submitContract(
  _previous: AdminWriteState,
  formData: FormData,
): Promise<AdminWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const sourceType = String(formData.get("source_type") ?? "").trim();
  const authzAction = String(formData.get("authz_action") ?? "").trim();
  if (!sourceType || !authzAction) {
    return {
      status: "error",
      message:
        "A source type and an authorization action are required. Without the action, " +
        "R1/R2 retrieval has nothing to ask authorization-svc — which would mean unauthorized results.",
    };
  }

  const fields = parseFields(String(formData.get("fields") ?? ""));
  if (fields.length === 0) {
    return { status: "error", message: "Register at least one field. See the placeholder for the format." };
  }

  const result = await createContract({
    ...identity,
    principalId: identity.principalId,
    tenantId: identity.tenantId,
    sourceType,
    scopeName: String(formData.get("scope_name") ?? "").trim() || undefined,
    retrievalClass: (String(formData.get("retrieval_class") ?? "").trim() || undefined) as
      | RetrievalClass
      | undefined,
    authzAction,
    fields,
  });

  if (!result.ok) return adminFailure(result.error, "contract");

  refresh();
  return {
    status: "created",
    message:
      `Drafted v${result.data.version} of ${result.data.scope_name}. It is DRAFT and indexes nothing yet — ` +
      "publication is a separate act because §4.2's approval gates are a human workflow.",
    contract: result.data,
  };
}

export async function submitContractTransition(
  _previous: AdminWriteState,
  formData: FormData,
): Promise<AdminWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const contractId = String(formData.get("contract_id") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim() as ContractState;
  if (!contractId || !state) {
    return { status: "error", message: "Choose a contract and a target state." };
  }

  const result = await transitionContract({
    ...identity,
    principalId: identity.principalId,
    tenantId: identity.tenantId,
    contractId,
    state,
  });

  if (!result.ok) return adminFailure(result.error, "contract");

  refresh();
  return {
    status: "updated",
    message:
      state === "PUBLISHED"
        ? "Published. This is now the one contract generations build from — a scope may have only one."
        : `Contract is now ${state}.`,
    contract: result.data,
  };
}

// ── Lifecycle (ESR-05) ───────────────────────────────────────────────────────

export async function submitGeneration(
  _previous: AdminWriteState,
  formData: FormData,
): Promise<AdminWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const scope = String(formData.get("scope") ?? "").trim();
  if (!scope) return { status: "error", message: "Choose a scope." };

  const result = await createGeneration({
    ...identity,
    principalId: identity.principalId,
    tenantId: identity.tenantId,
    scope,
  });

  if (!result.ok) return adminFailure(result.error, "generation");

  refresh();
  return {
    status: "created",
    message:
      `Building ${result.data.engine_ref}. Validate it, then activate — activation is an atomic alias swap ` +
      "and is reachable only from READY.",
    generation: result.data,
  };
}

export async function submitGenerationTransition(
  _previous: AdminWriteState,
  formData: FormData,
): Promise<AdminWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const generationId = String(formData.get("generation_id") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim() as GenerationState;
  if (!generationId || !state) {
    return { status: "error", message: "Choose a generation and a target state." };
  }

  const result = await transitionGeneration({
    ...identity,
    principalId: identity.principalId,
    tenantId: identity.tenantId,
    generationId,
    state,
  });

  if (!result.ok) return adminFailure(result.error, "generation");

  refresh();
  const messages: Partial<Record<GenerationState, string>> = {
    VALIDATING: "Validating. The READY step runs the real checks — cross-tenant contamination and completeness against the ledger.",
    READY: `Validated and ready to serve. Digest ${result.data.validation_digest.slice(0, 16)}… pins what was checked.`,
    ACTIVE: "Active. The alias now resolves to this generation, and the previous one was retired in the same swap.",
    RETIRED: "Retired.",
  };
  return {
    status: "updated",
    message: messages[state] ?? `Generation is now ${state}.`,
    generation: result.data,
  };
}

// ── Restrictions (§8.2) ──────────────────────────────────────────────────────

export async function submitRestriction(
  _previous: RestrictionState,
  formData: FormData,
): Promise<RestrictionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const scope = String(formData.get("scope") ?? "").trim();
  const sourceType = String(formData.get("source_type") ?? "").trim();
  const sourceId = String(formData.get("source_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const sourceEventId = String(formData.get("source_event_id") ?? "").trim();

  if (!scope || !sourceType || !sourceId || !reason) {
    return { status: "error", message: "Scope, source type, source id and reason are all required." };
  }
  if (!sourceEventId) {
    return {
      status: "error",
      message:
        "Name the authoritative source event. It is the idempotency key that makes a replayed erasure " +
        "a no-op rather than a second tombstone.",
    };
  }

  const result = await applyRestriction({
    ...identity,
    principalId: identity.principalId,
    tenantId: identity.tenantId,
    scope,
    sourceType,
    sourceId,
    reason,
    sourceEventId,
  });

  if (!result.ok) {
    const code = reasonCodeOf(result.error.body);
    if (code === "ESR-013") {
      return { status: "stale", message: explainReason(code), reasonCode: code };
    }
    if (result.error.status === 409) {
      return {
        status: "replayed",
        message: "That source event was already applied. The end state you asked for is in place.",
      };
    }
    if (code) return { status: "refused", message: explainReason(code, detailOf(result.error.body)), reasonCode: code };
    if (result.error.status === 403) {
      return {
        status: "refused",
        message: "This principal does not hold SEARCH_RESTRICTION_APPLY (platform scope).",
      };
    }
    return { status: "error", message: result.error.message };
  }

  refresh();

  if (result.data.state === "FAILED") {
    return {
      status: "failed",
      message:
        "Recorded, but the index write failed. The content may still be discoverable — " +
        "the verification sweep will retry, and the propagation table will show FAILED until it succeeds.",
      epoch: result.data.epoch,
    };
  }

  return {
    status: "applied",
    // The distinction the whole restriction model turns on. §2.2: APPLIED is
    // not VERIFIED until search visibility has actually been tested, and a
    // privacy workflow must not read this as a discharged obligation.
    message:
      "Applied to the index. This is NOT yet proof of invisibility — the verification sweep tests " +
      "discoverability independently, and only then does the record show VERIFIED.",
    epoch: result.data.epoch,
  };
}

// ── Export boundary (INV-29) ─────────────────────────────────────────────────

export async function submitExport(
  _previous: ExportState,
  formData: FormData,
): Promise<ExportState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: EXPIRED };
  }

  const scope = String(formData.get("scope") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!scope || !reason) {
    return {
      status: "error",
      message: "An export needs a scope and its own reason — the purpose you searched under does not carry over.",
    };
  }

  const result = await requestExport({
    ...identity,
    principalId: identity.principalId,
    tenantId: identity.tenantId,
    scope,
    reason,
  });

  if (!result.ok) {
    const code = reasonCodeOf(result.error.body);
    if (code) return { status: "refused", message: explainReason(code, detailOf(result.error.body)), reasonCode: code };
    return { status: "error", message: result.error.message };
  }

  refresh();
  return {
    status: "authorized",
    // Says plainly that nothing moved. A reader who took "authorized" to mean
    // "downloaded" would go looking for a file that does not exist.
    message:
      `Authorized over ${result.data.eligible_population} eligible record${result.data.eligible_population === 1 ? "" : "s"}. ` +
      "No data has been transferred — the authorization, purpose and population are recorded as evidence, " +
      "and bulk delivery is gated on the OD-13 decision for export limits.",
    exportId: result.data.export_id,
    eligiblePopulation: result.data.eligible_population,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function detailOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const detail = (body as { detail?: unknown }).detail;
  return typeof detail === "string" ? detail : undefined;
}

function adminFailure(
  error: { status?: number; message: string; body?: unknown },
  subject: "source" | "contract" | "generation",
): AdminWriteState {
  const code = reasonCodeOf(error.body);
  if (code) {
    return { status: "refused", message: explainReason(code, detailOf(error.body)), reasonCode: code };
  }
  if (error.status === 403) {
    return {
      status: "refused",
      message:
        `This principal does not hold the platform-scope grant for that ${subject}. ` +
        "Control-plane writes authorize against PLATFORM, not your legal entity — " +
        "see the SEARCH_FULL bundle in seed-demo-rbac.ps1.",
    };
  }
  if (error.status === 503) {
    return {
      status: "error",
      message: "No authorization decision could be obtained, so nothing was written. This fails closed by design.",
    };
  }
  if (error.status === 409) {
    return { status: "conflict", message: detailOf(error.body) ?? error.message };
  }
  return { status: "error", message: detailOf(error.body) ?? error.message };
}

function splitList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Parse the compact field-contract syntax the form accepts.
 *
 *     doc_code:TEXT:searchable,returnable,snippet
 *     doc_status:KEYWORD:filterable,facetable,returnable
 *     api_secret:KEYWORD::SECRET_PROHIBITED
 *
 * A textarea rather than a repeating field editor, deliberately: a contract
 * routinely registers a dozen fields, and this is the form an engineer can
 * paste from a spec. The service validates every rule regardless — snippet
 * without returnable, a field above its source's ceiling, an exposed
 * SECRET_PROHIBITED field — so a typo here produces a specific 400 rather
 * than a wrong contract.
 */
function parseFields(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, type, caps, sensitivity] = line.split(":");
      const flags = (caps ?? "").split(",").map((c) => c.trim().toLowerCase());
      return {
        name: (name ?? "").trim(),
        type: (type ?? "KEYWORD").trim().toUpperCase(),
        searchable: flags.includes("searchable"),
        filterable: flags.includes("filterable"),
        facetable: flags.includes("facetable"),
        sortable: flags.includes("sortable"),
        snippet_allowed: flags.includes("snippet"),
        returnable: flags.includes("returnable"),
        exportable: flags.includes("exportable"),
        ...(sensitivity?.trim() ? { sensitivity_class: sensitivity.trim().toUpperCase() } : {}),
      };
    })
    .filter((f) => f.name);
}

export { IDLE_ADMIN };
