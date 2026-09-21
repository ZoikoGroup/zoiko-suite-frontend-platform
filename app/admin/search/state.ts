// Shared contract between the search Server Actions and the forms that call
// them.
//
// The shape that matters here is SearchState, and specifically why it has a
// `partial` status distinct from `ok`.
//
// search-indexer-svc answers 206 Partial Content whenever a result set is not
// exhaustive — an engine shard failed, a candidate's authorization could not
// be obtained, a result could not be hydrated from its source. INV-24 requires
// that to be explicit: "search degradation or partial results are explicit and
// never silently represented as complete evidence."
//
// Two states rather than a boolean flag on one, because a flag is a thing a
// component can forget to read. A component switching on `status` has to
// handle `partial` to compile a complete switch, and the banner tone follows
// from the status rather than from a condition somebody has to remember.

import type {
  Checkpoint,
  IndexContract,
  IndexGeneration,
  SearchEvidence,
  SearchResponse,
  SearchSource,
  Tombstone,
} from "@/lib/api/search";

/**
 * A governed search outcome.
 *
 *   idle     — nothing submitted yet
 *   ok       — COMPLETE: every eligible result is present
 *   partial  — results are real and usable, but NOT exhaustive
 *   refused  — the planner declined it; `reasonCode` says which §11.3 rule
 *   error    — transport or an unexpected failure
 *
 * `refused` is separate from `error` because a refusal is an ANSWER. ESR-003
 * ("that is engine syntax, not a query") and ESR-006 ("that field is not
 * returnable on this scope") both tell the reader exactly what to change;
 * rendering them as errors would suggest the platform was broken.
 */
export type SearchState = {
  status: "idle" | "ok" | "partial" | "refused" | "error";
  message: string;
  response?: SearchResponse;
  /** The §11.3 code, for rendering the "what to do about it" explanation. */
  reasonCode?: string;
  /** Echoed back so the form can keep what was typed after a refusal. */
  submitted?: { scope: string; query: string };
};

export const IDLE_SEARCH: SearchState = { status: "idle", message: "" };

/**
 * A control-plane write.
 *
 * `conflict` is separate from `error` for the same reason `refused` is above:
 * a 409 here means a legal-but-not-now transition — a second PUBLISHED
 * contract for one scope, a generation activated out of order, a restriction
 * older than one already applied. The reader's next step is different in each
 * case and none of them is "retry".
 */
export type AdminWriteState = {
  status: "idle" | "created" | "updated" | "conflict" | "refused" | "error";
  message: string;
  reasonCode?: string;
  source?: SearchSource;
  contract?: IndexContract;
  generation?: IndexGeneration;
};

export const IDLE_ADMIN: AdminWriteState = { status: "idle", message: "" };

/**
 * A restriction outcome.
 *
 * `applied` and `verified` are deliberately different states, and the page
 * must not render them the same way. §2.2: "APPLIED is not VERIFIED until
 * search visibility is tested." A privacy workflow that read "accepted" as
 * "proven" would record an erasure obligation as discharged before anything
 * had checked — which is precisely what the separate verification sweep and
 * the `esr.restriction.propagated` event exist to prevent.
 *
 *   applied   — written to the index; invisibility NOT yet proven
 *   replayed  — this source event was already applied; idempotent no-op
 *   stale     — a newer restriction exists, so this one was declined (ESR-013)
 *   failed    — the index write did not succeed; the verifier will retry
 */
export type RestrictionState = {
  status: "idle" | "applied" | "replayed" | "stale" | "failed" | "refused" | "error";
  message: string;
  reasonCode?: string;
  epoch?: number;
};

export const IDLE_RESTRICTION: RestrictionState = { status: "idle", message: "" };

/**
 * An export request outcome.
 *
 * `authorized` is the terminal success state and it means NO DATA MOVED. The
 * service records the authorization, the purpose and the eligible population,
 * and transfers nothing — bulk delivery is gated on OD-13's decision about
 * export maximums and async thresholds. The banner says so explicitly, because
 * a reader who took "authorized" to mean "downloaded" would go looking for a
 * file that does not exist.
 */
export type ExportState = {
  status: "idle" | "authorized" | "refused" | "error";
  message: string;
  reasonCode?: string;
  exportId?: string;
  eligiblePopulation?: number;
};

export const IDLE_EXPORT: ExportState = { status: "idle", message: "" };

/** Read-only panel data, loaded server-side on render. */
export type SearchPageData = {
  scopes: Awaited<ReturnType<typeof import("@/lib/api/search").listScopes>>;
  sources: SearchSource[];
  contracts: IndexContract[];
  generations: IndexGeneration[];
  checkpoints: Checkpoint[];
  restrictions: Tombstone[];
  evidence: SearchEvidence[];
};
