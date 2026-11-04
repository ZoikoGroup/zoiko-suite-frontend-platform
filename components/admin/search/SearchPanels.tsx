// Read-only panels for the Search control plane.
//
// Server Components: every one of these reads the service directly and
// degrades to an empty state rather than throwing. One unavailable panel must
// not take the page down — that is the posture the whole console uses, and it
// matters more here than usual because this page shows SEVEN panels across two
// planes and a control-plane outage should still leave the search box usable.

import { AlertTriangle, Inbox } from "lucide-react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { CopyableId, PanelEmptyState, StoredAs } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import {
  listCheckpoints,
  listContracts,
  listEvidence,
  listGenerations,
  listRestrictions,
  listScopes,
  listSources,
  type Checkpoint,
  type ContractState,
  type GenerationState,
  type PropagationState,
  type Scope,
} from "@/lib/api/search";
import type { SessionIdentity } from "@/lib/auth";

type Identity = SessionIdentity & { principalId: string; tenantId: string };

/** Shared table chrome, so seven panels cannot drift apart visually. */
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
          <tr>
            {head.map((h) => (
              <th key={h} className={HEAD}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
      </table>
    </div>
  );
}

const CONTRACT_TONE: Record<ContractState, "neutral" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  CERTIFIED: "warning",
  PUBLISHED: "success",
  RETIRED: "neutral",
};

const GENERATION_TONE: Record<GenerationState, "neutral" | "success" | "warning" | "danger"> = {
  PLANNED: "neutral",
  BUILDING: "warning",
  VALIDATING: "warning",
  READY: "warning",
  ACTIVE: "success",
  FAILED: "danger",
  RETIRED: "neutral",
};

/**
 * Propagation tones, and the one that matters.
 *
 * APPLIED is WARNING, not success. §2.2: "APPLIED is not VERIFIED until search
 * visibility is tested." A green badge on APPLIED would tell a privacy
 * operator an erasure obligation was discharged when nothing had yet checked
 * whether the content is still discoverable — which is the exact confusion the
 * separate verification sweep exists to prevent.
 *
 * FAILED is DANGER and means, specifically, that content may be discoverable
 * right now. It is not a retryable glitch.
 */
const PROPAGATION_TONE: Record<PropagationState, "neutral" | "success" | "warning" | "danger"> = {
  PENDING: "neutral",
  APPLIED: "warning",
  VERIFIED: "success",
  FAILED: "danger",
};

const FRESHNESS_TONE: Record<Checkpoint["freshness"], "neutral" | "success" | "warning" | "danger"> = {
  // UNKNOWN is never shown as if it were CURRENT (§2.2).
  UNKNOWN: "neutral",
  CURRENT: "success",
  LAGGING: "warning",
  STALE: "danger",
};

// ── Scopes ───────────────────────────────────────────────────────────────────

export async function ScopesPanel({ identity }: { identity: Identity }) {
  const result = await listScopes(identity);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search surfaces</CardTitle>
        <CardDescription>
          The scopes a caller may name, and what each field may be used for. A field absent from a
          scope is not merely unusable — it is not disclosed to exist, which is why prohibited
          fields never appear here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!result.ok ? (
          <PanelEmptyState icon={AlertTriangle} tone="warning" label="Unavailable" hint={result.error.message} />
        ) : result.data.scopes.length === 0 ? (
          <PanelEmptyState icon={Inbox} label="Nothing yet" hint="No published contracts yet. Register a source and publish a contract to create a search surface." />
        ) : (
          <div className="space-y-4">
            {result.data.scopes.map((scope) => (
              <ScopeCard key={scope.scope} scope={scope} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScopeCard({ scope }: { scope: Scope }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-900 dark:text-slate-100">{scope.scope}</span>
        <Badge tone={scope.active ? "success" : "warning"}>
          {scope.active ? "serving" : "no active generation"}
        </Badge>
        <Badge tone="neutral">v{scope.contract_version}</Badge>
        <Badge tone="neutral" title={retrievalHint(scope.retrieval_class)}>
          {scope.retrieval_class}
        </Badge>
        <Badge tone="neutral">{scope.freshness_class}</Badge>
      </div>
      <Table head={["Field", "Type", "Search", "Filter", "Facet", "Sort", "Return", "Snippet"]}>
        {scope.fields.map((f) => (
          <tr key={f.name}>
            <td className={CELL}>
              <code className="text-xs">{f.name}</code>
            </td>
            <td className={CELL}>{f.type}</td>
            <Tick on={f.searchable} />
            <Tick on={f.filterable} />
            <Tick on={f.facetable} />
            <Tick on={f.sortable} />
            <Tick on={f.returnable} />
            <Tick on={f.snippet_allowed} />
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <td className={CELL}>
      <span className={on ? "text-emerald-600 dark:text-emerald-400" : "text-slate-300 dark:text-slate-700"}>
        {on ? "yes" : "—"}
      </span>
    </td>
  );
}

function retrievalHint(c: string): string {
  switch (c) {
    case "R0":
      return "Metadata-safe: no per-result re-authorization. Restricted to low-sensitivity content by the contract validator.";
    case "R1":
      return "Every candidate is re-authorized against current authority before anything is returned.";
    case "R2":
      return "Re-authorized AND hydrated from the authoritative source — index content is not trusted as a current display value.";
    case "R3":
      return "Explicit export: separate authorization, purpose and evidence.";
    default:
      return c;
  }
}

// ── Registry ─────────────────────────────────────────────────────────────────

export async function SourcesPanel({ identity }: { identity: Identity }) {
  const result = await listSources(identity);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registered sources</CardTitle>
        <CardDescription>
          What may be indexed, and from which events. The topic set is resolved from these
          registrations at runtime — adding a source subscribes its topic within 30 seconds, with no
          redeploy.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!result.ok ? (
          <PanelEmptyState icon={AlertTriangle} tone="warning" label="Unavailable" hint={result.error.message} />
        ) : result.data.sources.length === 0 ? (
          <PanelEmptyState icon={Inbox} label="Nothing yet" hint="No sources registered." />
        ) : (
          <Table head={["Source type", "Owner", "Topic", "Indexed events", "Restriction events", "Ceiling"]}>
            {result.data.sources.map((s) => (
              <tr key={s.source_id}>
                <td className={CELL}>
                  <code className="text-xs">{s.source_type}</code>
                </td>
                <td className={CELL}>{s.owner_service}</td>
                <td className={CELL}>
                  <code className="text-xs">{s.event_topic}</code>
                </td>
                <td className={CELL}>
                  <span className="text-xs">{s.event_types.join(", ") || "—"}</span>
                </td>
                <td className={CELL}>
                  {/* The priority lane. A source with none has no way to remove
                      visibility through an event, which is worth seeing. */}
                  {s.restriction_event_types.length > 0 ? (
                    <span className="text-xs">{s.restriction_event_types.join(", ")}</span>
                  ) : (
                    <Badge tone="warning">none</Badge>
                  )}
                </td>
                <td className={CELL}>
                  <Badge tone="neutral">{s.sensitivity_ceiling}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export async function ContractsPanel({ identity, scope }: { identity: Identity; scope?: string }) {
  const result = await listContracts({ ...identity, scope });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Index contracts</CardTitle>
        <CardDescription>
          A contract is immutable once published, and a scope may have exactly one PUBLISHED
          version — two would let a generation build from either, and the approval that certified
          one field set would not be the set being built.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!result.ok ? (
          <PanelEmptyState icon={AlertTriangle} tone="warning" label="Unavailable" hint={result.error.message} />
        ) : result.data.contracts.length === 0 ? (
          <PanelEmptyState icon={Inbox} label="Nothing yet" hint="No contracts drafted." />
        ) : (
          <Table head={["Scope", "Version", "State", "Retrieval", "Authz action", "Fields", "Contract id"]}>
            {result.data.contracts.map((c) => (
              <tr key={c.contract_id}>
                <td className={CELL}>{c.scope_name}</td>
                <td className={CELL}>v{c.version}</td>
                <td className={CELL}>
                  <Badge tone={CONTRACT_TONE[c.publication_state]}>{c.publication_state}</Badge>
                </td>
                <td className={CELL} title={retrievalHint(c.retrieval_class)}>
                  {c.retrieval_class}
                </td>
                <td className={CELL}>
                  <code className="text-xs">{c.authz_action}</code>
                </td>
                <td className={CELL}>{c.fields.length}</td>
                <td className={CELL}>
                  <CopyableId value={c.contract_id} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export async function GenerationsPanel({ identity, scope }: { identity: Identity; scope?: string }) {
  const result = await listGenerations({ ...identity, scope });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Index generations</CardTitle>
        <CardDescription>
          A generation is built while the previous one still serves, and cut over atomically.
          READY is separate from ACTIVE on purpose — cutover requires validation to have passed,
          and the digest records what was checked.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!result.ok ? (
          <PanelEmptyState icon={AlertTriangle} tone="warning" label="Unavailable" hint={result.error.message} />
        ) : result.data.generations.length === 0 ? (
          <PanelEmptyState icon={Inbox} label="Nothing yet" hint="No generations built." />
        ) : (
          <Table head={["Scope", "State", "Engine index", "Validation", "Activated", "Generation id"]}>
            {result.data.generations.map((g) => (
              <tr key={g.generation_id}>
                <td className={CELL}>{g.scope_name}</td>
                <td className={CELL}>
                  <Badge tone={GENERATION_TONE[g.validation_state]}>{g.validation_state}</Badge>
                </td>
                <td className={CELL}>
                  <code className="text-xs">{g.engine_ref}</code>
                </td>
                <td className={CELL}>
                  {g.validation_note ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400">{g.validation_note}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={CELL}>{g.activated_at ? new Date(g.activated_at).toLocaleString() : "—"}</td>
                <td className={CELL}>
                  <CopyableId value={g.generation_id} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export async function CheckpointsPanel({ identity, scope }: { identity: Identity; scope?: string }) {
  const result = await listCheckpoints({ ...identity, scope });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Freshness and completeness</CardTitle>
        <CardDescription>
          Indexed counts come from the control-plane ledger, which counts independently of the
          index. That independence is the only reason a checkpoint that has silently advanced past
          missing events is detectable at all.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!result.ok ? (
          <PanelEmptyState icon={AlertTriangle} tone="warning" label="Unavailable" hint={result.error.message} />
        ) : result.data.checkpoints.length === 0 ? (
          <PanelEmptyState icon={Inbox} label="Nothing yet" hint="No checkpoints recorded yet. They are written on the accounting sweep once a scope is serving." />
        ) : (
          <Table head={["Scope", "Partition", "Freshness", "Live", "Tombstoned", "Observed"]}>
            {result.data.checkpoints.map((c) => (
              <tr key={`${c.scope_name}:${c.source_partition}`}>
                <td className={CELL}>{c.scope_name}</td>
                <td className={CELL}>
                  <code className="text-xs">{c.source_partition}</code>
                </td>
                <td className={CELL}>
                  <Badge tone={FRESHNESS_TONE[c.freshness]}>{c.freshness}</Badge>
                </td>
                <td className={CELL}>{c.indexed_live}</td>
                <td className={CELL}>{c.indexed_tombstoned}</td>
                <td className={CELL}>{new Date(c.observed_at).toLocaleString()}</td>
              </tr>
            ))}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Restrictions ─────────────────────────────────────────────────────────────

export async function RestrictionsPanel({ identity, scope }: { identity: Identity; scope?: string }) {
  const result = await listRestrictions({ ...identity, scope, limit: 50 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Restriction propagation</CardTitle>
        <CardDescription>
          APPLIED means the removal was written. VERIFIED means invisibility was independently
          proven by a retrieval test — only then is a privacy or records obligation met in the
          search plane. FAILED means the content may still be discoverable.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!result.ok ? (
          <PanelEmptyState icon={AlertTriangle} tone="warning" label="Unavailable" hint={result.error.message} />
        ) : result.data.restrictions.length === 0 ? (
          <PanelEmptyState icon={Inbox} label="Nothing yet" hint="No restrictions applied for this tenant." />
        ) : (
          <Table head={["Source ref", "Reason", "State", "Applied", "Proven invisible", "Failure"]}>
            {result.data.restrictions.map((t) => (
              <tr key={`${t.source_type}:${t.source_id}:${t.source_event_id}`}>
                <td className={CELL}>
                  <code className="text-xs">
                    {t.source_type}/{t.source_id}
                  </code>
                </td>
                <td className={CELL}>{t.reason}</td>
                <td className={CELL}>
                  <Badge tone={PROPAGATION_TONE[t.state]}>{t.state}</Badge>
                </td>
                <td className={CELL}>
                  {t.propagated_at ? new Date(t.propagated_at).toLocaleString() : "—"}
                </td>
                <td className={CELL}>
                  {t.verified_at ? (
                    new Date(t.verified_at).toLocaleString()
                  ) : (
                    // Never blank. A blank cell reads as "nothing to say"; this
                    // says the check has not happened, which is the whole
                    // distinction §2.2 draws.
                    <span className="text-xs text-amber-600 dark:text-amber-400">not yet proven</span>
                  )}
                </td>
                <td className={CELL}>
                  {t.failure_reason ? (
                    <span className="text-xs text-rose-600 dark:text-rose-400">{t.failure_reason}</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Evidence ─────────────────────────────────────────────────────────────────

export async function EvidencePanel({ identity, scope }: { identity: Identity; scope?: string }) {
  const result = await listEvidence({ ...identity, scope, limit: 50 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search evidence</CardTitle>
        <CardDescription>
          Every search, including the refused ones. Queries are stored as a SHA-256 digest and never
          as text — search terms are personal data when they can reveal a person, a condition, an
          employment matter or a legal issue, so the digest supports replay correlation without
          accumulating a record of what everyone was looking for.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!result.ok ? (
          <PanelEmptyState icon={AlertTriangle} tone="warning" label="Unavailable" hint={result.error.message} />
        ) : result.data.evidence.length === 0 ? (
          <PanelEmptyState icon={Inbox} label="Nothing yet" hint="No searches recorded for this tenant." />
        ) : (
          <Table head={["When", "Scope", "Purpose", "Results", "Withheld", "Completeness", "Reason codes", "Query"]}>
            {result.data.evidence.map((e) => (
              <tr key={e.evidence_id}>
                <td className={CELL}>{new Date(e.created_at).toLocaleString()}</td>
                <td className={CELL}>{e.scope_name}</td>
                <td className={CELL}>
                  <code className="text-xs">{e.purpose_context}</code>
                </td>
                <td className={CELL}>{e.result_count}</td>
                <td className={CELL}>
                  {e.suppressed_count > 0 ? (
                    <Badge tone="warning">{e.suppressed_count}</Badge>
                  ) : (
                    "0"
                  )}
                </td>
                <td className={CELL}>
                  <Badge tone={e.completeness_state === "COMPLETE" ? "success" : "warning"}>
                    {e.completeness_state}
                  </Badge>
                </td>
                <td className={CELL}>
                  <span className="text-xs">{e.reason_codes?.join(", ") || "—"}</span>
                </td>
                <td className={CELL}>
                  {/* StoredAs, so an auditor can quote exactly what the service
                      holds. What it holds is a digest. */}
                  <StoredAs code={e.query_digest.slice(0, 16) + "…"} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
