"use client";

// Forms for the Search control plane.
//
// THE SEARCH FORM IS THE ONE THAT MATTERS, and the reason is its banner tone.
//
// A partial result set gets an AMBER banner and a count of what was withheld —
// never a green one. INV-24: "search degradation or partial results are
// explicit and never silently represented as complete evidence." A reader who
// saw twelve results under a green banner would reasonably conclude that was
// all of them; if eight were suppressed because their authorization could not
// be obtained, that conclusion is wrong in the direction that matters.
//
// A refusal gets a NEUTRAL banner, not a red one. ESR-003 and ESR-006 are
// answers — they say exactly what to change — and showing them as errors sends
// the reader looking for an outage instead of fixing their query.

import { useActionState } from "react";
import { Badge } from "@/components/ui";
import { ResultBanner, type BannerTone } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { REASON_MEANINGS, type Scope, type SearchResponse } from "@/lib/api/search";
import {
  submitContract,
  submitContractTransition,
  submitExport,
  submitGeneration,
  submitGenerationTransition,
  submitRestriction,
  submitSearch,
  submitSource,
} from "@/app/admin/search/actions";
import {
  IDLE_ADMIN,
  IDLE_EXPORT,
  IDLE_RESTRICTION,
  IDLE_SEARCH,
  type AdminWriteState,
} from "@/app/admin/search/state";

const SUBMIT =
  "h-9 shrink-0 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white shadow-sm transition-all duration-200 " +
  "hover:-translate-y-0.5 hover:bg-navy-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-navy-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:hover:translate-y-0 " +
  "dark:bg-navy-600 dark:hover:bg-navy-500 dark:focus-visible:ring-offset-slate-900";

/** Admin write outcomes share one tone map — see state.ts for why each exists. */
const ADMIN_TONE: Record<AdminWriteState["status"], BannerTone> = {
  idle: "neutral",
  created: "success",
  updated: "success",
  // A conflict is a legal-but-not-now transition, not a failure.
  conflict: "warning",
  // A refusal is a decision the platform made and explained.
  refused: "warning",
  error: "error",
};

function ReasonBadge({ code }: { code?: string }) {
  if (!code) return null;
  return (
    <Badge tone="neutral" title={REASON_MEANINGS[code] ?? code}>
      {code} · {REASON_MEANINGS[code] ?? "refused"}
    </Badge>
  );
}

// ── Governed search ──────────────────────────────────────────────────────────

export function SearchForm({ scopes }: { scopes: Scope[] }) {
  const [state, action, pending] = useActionState(submitSearch, IDLE_SEARCH);

  const servable = scopes.filter((s) => s.active);
  const response = state.response;

  const tone: BannerTone =
    state.status === "ok"
      ? "success"
      : state.status === "partial"
        ? "warning"
        : state.status === "refused"
          ? "warning"
          : state.status === "error"
            ? "error"
            : "neutral";

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr_auto]">
        <div>
          <label className={LABEL} htmlFor="scope">
            Search surface
          </label>
          <select id="scope" name="scope" className={FIELD} defaultValue={state.submitted?.scope ?? ""}>
            <option value="">Select…</option>
            {servable.map((s) => (
              <option key={s.scope} value={s.scope}>
                {s.scope} ({s.retrieval_class})
              </option>
            ))}
          </select>
          {servable.length === 0 && (
            <p className={HINT}>
              No surface is serving. A scope needs a published contract and an active generation.
            </p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="query">
            Query <span className={OPTIONAL}>— plain terms</span>
          </label>
          <input
            id="query"
            name="query"
            className={FIELD}
            defaultValue={state.submitted?.query ?? ""}
            placeholder="invoice description"
          />
          <p className={HINT}>
            At least two characters. Wildcards, regular expressions and engine field names are
            refused — this is not a query language, and a term that looked like one would otherwise
            be matched literally with no indication it was never interpreted.
          </p>
        </div>

        <div className="flex items-end">
          <button type="submit" className={SUBMIT} disabled={pending}>
            {pending ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-400">
          Filters, facets and snippets
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className={LABEL} htmlFor="filter_field">
              Filter field
            </label>
            <input id="filter_field" name="filter_field" className={FIELD} placeholder="doc_status" />
          </div>
          <div>
            <label className={LABEL} htmlFor="filter_value">
              Filter value
            </label>
            <input id="filter_value" name="filter_value" className={FIELD} placeholder="OPEN" />
          </div>
          <div>
            <label className={LABEL} htmlFor="facets">
              Facets <span className={OPTIONAL}>comma-separated</span>
            </label>
            <input id="facets" name="facets" className={FIELD} placeholder="doc_status" />
            <p className={HINT}>
              Counted only over what you may see, and buckets below the minimum cell are suppressed
              — a count of one can reveal a single record.
            </p>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input type="checkbox" name="snippets" className="rounded border-slate-300" />
          Return snippets, where the contract allows them
        </label>
      </details>

      <ResultBanner tone={tone} message={state.message} testId="search-result">
        {state.reasonCode && <ReasonBadge code={state.reasonCode} />}

        {response && response.suppressions && response.suppressions.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium">Withheld candidates</p>
            {response.suppressions.map((s) => (
              <p key={s.reason_code} className="text-xs">
                <span className="font-mono">{s.reason_code}</span> {s.meaning} — {s.count}
              </p>
            ))}
            {/* TC-06: a reason code and a count, and nothing that names what was
                withheld. That absence is the control, not a missing feature. */}
            <p className="text-xs opacity-80">
              Withheld records are not named. A suppression that identified them would be an
              existence disclosure.
            </p>
          </div>
        )}

        {response && !response.total_is_exact && (
          <p className="text-xs opacity-80">
            The total is approximate: once anything is withheld, the engine&apos;s count no longer
            describes what you may see, and adjusting it downward would say exactly how much you
            may not.
          </p>
        )}
      </ResultBanner>

      {response && response.results.length > 0 && <Results response={response} />}

      {response && response.facets && Object.keys(response.facets).length > 0 && (
        <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          {Object.entries(response.facets).map(([field, buckets]) => (
            <div key={field}>
              <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">{field}</p>
              <div className="flex flex-wrap gap-1.5">
                {buckets.map((b) => (
                  <Badge key={b.value} tone="neutral">
                    {b.value} · {b.count}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}

function Results({ response }: { response: SearchResponse }) {
  return (
    <div className="space-y-2">
      {response.results.map((r) => (
        <div
          key={`${r.source_type}:${r.source_id}`}
          className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <code className="text-xs text-slate-500 dark:text-slate-400">
              {r.source_type}/{r.source_id}
            </code>
            <Badge tone="neutral">v{r.source_version}</Badge>
            <Badge tone="neutral">{r.retrieval_class}</Badge>
            {/* Whether the content shown came from the index or from the
                authoritative source. §7.1 does not let index content be
                trusted as a current display value for material records, so
                the reader has to be able to tell which they are looking at. */}
            <Badge tone={r.freshness === "SOURCE" ? "success" : "neutral"}>
              {r.freshness === "SOURCE" ? "current source" : "indexed copy"}
            </Badge>
          </div>

          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {Object.entries(r.fields).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                <dd className="min-w-0 truncate text-slate-800 dark:text-slate-200">{String(v)}</dd>
              </div>
            ))}
          </dl>

          {r.snippets &&
            Object.entries(r.snippets).map(([field, fragments]) => (
              <div key={field} className="mt-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">{field}</p>
                {fragments.map((f, i) => (
                  <p
                    key={i}
                    className="text-sm text-slate-700 [&_mark]:rounded [&_mark]:bg-amber-100 [&_mark]:px-0.5 dark:text-slate-300 dark:[&_mark]:bg-amber-500/20"
                    // Safe, and only because of where the escaping happened.
                    // The service escapes the whole fragment FIRST and then
                    // substitutes its own <mark> for the match markers, so
                    // stored source markup arrives as visible text and the only
                    // real tags are ones it added. Escaping again here would
                    // show those tags as literal text; not escaping there would
                    // let stored markup execute.
                    dangerouslySetInnerHTML={{ __html: f }}
                  />
                ))}
              </div>
            ))}

          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Served by {r.index_generation}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Registry ─────────────────────────────────────────────────────────────────

export function RegisterSourceForm() {
  const [state, action, pending] = useActionState(submitSource, IDLE_ADMIN);

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="owner_service">
            Owner service
          </label>
          <input id="owner_service" name="owner_service" className={FIELD} placeholder="obligations-svc" />
        </div>
        <div>
          <label className={LABEL} htmlFor="source_type">
            Source type
          </label>
          <input id="source_type" name="source_type" className={FIELD} placeholder="obligation" />
          <p className={HINT}>
            Also the first segment of this source&apos;s event names, which is how a topic&apos;s
            events are bound to it.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="event_topic">
            Event topic
          </label>
          <input id="event_topic" name="event_topic" className={FIELD} placeholder="zoiko.obligations.events" />
        </div>
        <div>
          <label className={LABEL} htmlFor="sensitivity_ceiling">
            Sensitivity ceiling
          </label>
          <select id="sensitivity_ceiling" name="sensitivity_ceiling" className={FIELD} defaultValue="INTERNAL">
            {["PUBLIC", "INTERNAL", "PERSONAL", "FINANCIAL", "HR", "LEGAL_PRIVILEGED", "RESTRICTED"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p className={HINT}>
            No contract over this source may expose a field classified above it. Raising exposure is
            a source-level decision, not a contract-level one.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="event_types">
            Indexed event types
          </label>
          <input
            id="event_types"
            name="event_types"
            className={FIELD}
            placeholder="obligation.created, obligation.updated"
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="restriction_event_types">
            Restriction event types <span className={OPTIONAL}>priority lane</span>
          </label>
          <input id="restriction_event_types" name="restriction_event_types" className={FIELD} placeholder="obligation.deleted" />
          <p className={HINT}>
            These outrank normal indexing backlog. A source with none can only have visibility
            removed through the Restrictions tab.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className={SUBMIT} disabled={pending}>
          {pending ? "Registering…" : "Register source"}
        </button>
      </div>
      <ResultBanner tone={ADMIN_TONE[state.status]} message={state.message} testId="source-result">
        {state.reasonCode && <ReasonBadge code={state.reasonCode} />}
      </ResultBanner>
    </form>
  );
}

export function DraftContractForm({ sourceTypes }: { sourceTypes: string[] }) {
  const [state, action, pending] = useActionState(submitContract, IDLE_ADMIN);

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="c_source_type">
            Source type
          </label>
          <select id="c_source_type" name="source_type" className={FIELD} defaultValue="">
            <option value="">Select…</option>
            {sourceTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="retrieval_class">
            Retrieval class
          </label>
          <select id="retrieval_class" name="retrieval_class" className={FIELD} defaultValue="R1">
            <option value="R0">R0 — metadata-safe, no re-authorization</option>
            <option value="R1">R1 — re-authorized per result</option>
            <option value="R2">R2 — re-authorized and source-hydrated</option>
          </select>
          <p className={HINT}>
            R0 skips re-authorization, so it is refused for anything above INTERNAL.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="authz_action">
            Authorization action
          </label>
          <input id="authz_action" name="authz_action" className={FIELD} placeholder="OBLIGATION_READ" />
          <p className={HINT}>What each result is re-authorized against.</p>
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="fields">
          Fields <span className={OPTIONAL}>one per line — name:TYPE:capabilities[:sensitivity]</span>
        </label>
        <textarea
          id="fields"
          name="fields"
          rows={5}
          className={FIELD + " font-mono text-xs"}
          placeholder={
            "obligation_code:TEXT:searchable,returnable,snippet\n" +
            "obligation_status:KEYWORD:filterable,facetable,returnable\n" +
            "due_date:DATE:sortable,returnable\n" +
            "api_secret:KEYWORD::SECRET_PROHIBITED"
          }
        />
        <p className={HINT}>
          Capabilities: searchable, filterable, facetable, sortable, returnable, snippet, exportable.
          A SECRET_PROHIBITED field may be declared — that is how the projector learns to refuse a
          payload carrying one — but may not be given any capability at all.
        </p>
      </div>

      <button type="submit" className={SUBMIT} disabled={pending}>
        {pending ? "Drafting…" : "Draft contract"}
      </button>
      <ResultBanner tone={ADMIN_TONE[state.status]} message={state.message} testId="contract-result">
        {state.reasonCode && <ReasonBadge code={state.reasonCode} />}
      </ResultBanner>
    </form>
  );
}

export function ContractTransitionForm({
  contracts,
}: {
  contracts: { contract_id: string; scope_name: string; version: number; publication_state: string }[];
}) {
  const [state, action, pending] = useActionState(submitContractTransition, IDLE_ADMIN);

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_minmax(0,12rem)_auto]">
        <div>
          <label className={LABEL} htmlFor="contract_id">
            Contract
          </label>
          <select id="contract_id" name="contract_id" className={FIELD} defaultValue="">
            <option value="">Select…</option>
            {contracts.map((c) => (
              <option key={c.contract_id} value={c.contract_id}>
                {c.scope_name} v{c.version} — {c.publication_state}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="contract_state">
            Target state
          </label>
          <select id="contract_state" name="state" className={FIELD} defaultValue="CERTIFIED">
            <option value="CERTIFIED">CERTIFIED</option>
            <option value="PUBLISHED">PUBLISHED</option>
            <option value="RETIRED">RETIRED</option>
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className={SUBMIT} disabled={pending}>
            {pending ? "Applying…" : "Transition"}
          </button>
        </div>
      </div>
      <ResultBanner tone={ADMIN_TONE[state.status]} message={state.message} testId="contract-transition-result">
        {state.reasonCode && <ReasonBadge code={state.reasonCode} />}
      </ResultBanner>
    </form>
  );
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export function BuildGenerationForm({ scopes }: { scopes: string[] }) {
  const [state, action, pending] = useActionState(submitGeneration, IDLE_ADMIN);

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label className={LABEL} htmlFor="g_scope">
            Scope
          </label>
          <select id="g_scope" name="scope" className={FIELD} defaultValue="">
            <option value="">Select…</option>
            {scopes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className={HINT}>Only scopes with a PUBLISHED contract can build a generation.</p>
        </div>
        <div className="flex items-end">
          <button type="submit" className={SUBMIT} disabled={pending}>
            {pending ? "Building…" : "Build generation"}
          </button>
        </div>
      </div>
      <ResultBanner tone={ADMIN_TONE[state.status]} message={state.message} testId="generation-result">
        {state.reasonCode && <ReasonBadge code={state.reasonCode} />}
      </ResultBanner>
    </form>
  );
}

export function GenerationTransitionForm({
  generations,
}: {
  generations: { generation_id: string; scope_name: string; validation_state: string; engine_ref: string }[];
}) {
  const [state, action, pending] = useActionState(submitGenerationTransition, IDLE_ADMIN);

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_minmax(0,12rem)_auto]">
        <div>
          <label className={LABEL} htmlFor="generation_id">
            Generation
          </label>
          <select id="generation_id" name="generation_id" className={FIELD} defaultValue="">
            <option value="">Select…</option>
            {generations.map((g) => (
              <option key={g.generation_id} value={g.generation_id}>
                {g.scope_name} — {g.validation_state} — {g.engine_ref}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="generation_state">
            Target state
          </label>
          <select id="generation_state" name="state" className={FIELD} defaultValue="VALIDATING">
            <option value="VALIDATING">VALIDATING</option>
            <option value="READY">READY — runs validation</option>
            <option value="ACTIVE">ACTIVE — alias swap</option>
            <option value="RETIRED">RETIRED</option>
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className={SUBMIT} disabled={pending}>
            {pending ? "Applying…" : "Transition"}
          </button>
        </div>
      </div>
      <p className={HINT}>
        ACTIVE is reachable only from READY, and READY runs the real checks — cross-tenant
        contamination and completeness against the control-plane ledger. A generation that fails
        them is not activated, and the previously validated one keeps serving.
      </p>
      <ResultBanner tone={ADMIN_TONE[state.status]} message={state.message} testId="generation-transition-result">
        {state.reasonCode && <ReasonBadge code={state.reasonCode} />}
      </ResultBanner>
    </form>
  );
}

// ── Restrictions ─────────────────────────────────────────────────────────────

export function RestrictionForm({ scopes }: { scopes: Scope[] }) {
  const [state, action, pending] = useActionState(submitRestriction, IDLE_RESTRICTION);

  const tone: BannerTone =
    state.status === "applied"
      ? // AMBER, not green. Applied is not proven — see state.ts.
        "warning"
      : state.status === "replayed"
        ? "neutral"
        : state.status === "stale"
          ? "warning"
          : state.status === "failed"
            ? "error"
            : state.status === "refused"
              ? "warning"
              : state.status === "error"
                ? "error"
                : "neutral";

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="r_scope">
            Scope
          </label>
          <select id="r_scope" name="scope" className={FIELD} defaultValue="">
            <option value="">Select…</option>
            {scopes.map((s) => (
              <option key={s.scope} value={s.scope}>
                {s.scope}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="r_source_type">
            Source type
          </label>
          <input id="r_source_type" name="source_type" className={FIELD} placeholder="obligation" />
        </div>
        <div>
          <label className={LABEL} htmlFor="r_source_id">
            Source id
          </label>
          <input id="r_source_id" name="source_id" className={FIELD} placeholder="ob-1234" />
        </div>
        <div>
          <label className={LABEL} htmlFor="r_reason">
            Reason
          </label>
          <input id="r_reason" name="reason" className={FIELD} placeholder="PRV_ERASURE" />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="source_event_id">
            Authoritative source event id
          </label>
          <input id="source_event_id" name="source_event_id" className={FIELD} placeholder="prv-erasure-2026-0417" />
          <p className={HINT}>
            Required, not generated. It is the idempotency key that makes a replayed erasure a no-op
            rather than a second tombstone at a new epoch.
          </p>
        </div>
      </div>
      <button type="submit" className={SUBMIT} disabled={pending}>
        {pending ? "Applying…" : "Remove from search"}
      </button>
      <ResultBanner tone={tone} message={state.message} testId="restriction-result">
        {state.reasonCode && <ReasonBadge code={state.reasonCode} />}
        {state.status === "applied" && (
          <p className="text-xs opacity-80">
            Watch the propagation table below: it shows VERIFIED once a retrieval test has proven the
            content is no longer discoverable.
          </p>
        )}
      </ResultBanner>
    </form>
  );
}

// ── Export boundary ──────────────────────────────────────────────────────────

export function ExportForm({ scopes }: { scopes: Scope[] }) {
  const [state, action, pending] = useActionState(submitExport, IDLE_EXPORT);

  const tone: BannerTone =
    state.status === "authorized"
      ? "success"
      : state.status === "refused"
        ? "warning"
        : state.status === "error"
          ? "error"
          : "neutral";

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr_auto]">
        <div>
          <label className={LABEL} htmlFor="e_scope">
            Scope
          </label>
          <select id="e_scope" name="scope" className={FIELD} defaultValue="">
            <option value="">Select…</option>
            {scopes.map((s) => (
              <option key={s.scope} value={s.scope}>
                {s.scope}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="e_reason">
            Reason for the export
          </label>
          <input id="e_reason" name="reason" className={FIELD} placeholder="Regulatory disclosure — ref 2026/0417" />
          <p className={HINT}>
            Its own reason. The purpose you searched under does not carry over, because an export is
            a separately authorized act.
          </p>
        </div>
        <div className="flex items-end">
          <button type="submit" className={SUBMIT} disabled={pending}>
            {pending ? "Requesting…" : "Request export"}
          </button>
        </div>
      </div>
      <ResultBanner tone={tone} message={state.message} testId="export-result">
        {state.reasonCode && <ReasonBadge code={state.reasonCode} />}
        {state.exportId && (
          <p className="text-xs">
            Evidence id <span className="font-mono">{state.exportId}</span>
          </p>
        )}
      </ResultBanner>
    </form>
  );
}
