import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Building2, FileText, GitBranch, Globe, Layers, Merge, ShieldCheck, Users } from "lucide-react";
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
} from "@/components/ui";
import { PageHeader, PanelEmptyState } from "@/components/admin/shared";
import { JurisdictionField } from "@/components/admin/obligations/JurisdictionField";
import {
  AssignJurisdictionForm,
  CreateEntityForm,
  CreateHierarchyForm,
  CreateResidencyPolicyForm,
  CreateWorkspaceForm,
  EndDateHierarchyForm,
  EndDateJurisdictionForm,
  EntityStatusForm,
  EntityTable,
  HierarchyTable,
  ProvisionTenantForm,
  TenantLifecycleForm,
  TenantOverview,
  UpdateEntityForm,
  WorkspaceTable,
  // ORG-02 §4.2 — named lifecycle commands, defaults, host bindings.
  TenantCommandPanel,
  TenantLifecycleHistory,
  ChangeDefaultsForm,
  BindHostForm,
  HostBindingTable,
  // ORG-03 §4.3 — profile versions, as-of, registry quarantine.
  AmendProfileForm,
  ProfileVersionTable,
  EntityAsOfForm,
  RegistryNumberSearchForm,
  RegistryConflictPanel,
} from "@/components/admin/tenants";
import { SESSION_COOKIE, decodeSession, toIdentity, type SessionIdentity } from "@/lib/auth";
import {
  getTenant,
  listEntities,
  listHierarchies,
  listResidencyRegions,
  listWorkspaces,
  resolveTenantRegion,
  type EntityHierarchy,
  type LegalEntity,
  type ResidencyRegion,
  type ResolvedTenantRegion,
  type Workspace,
} from "@/lib/api/tenants";
import {
  listEntityVersions,
  listRegistryConflicts,
  listTenantHostBindings,
  listTenantLifecycleHistory,
  getRegistrySummary,
  type RegistrySummary,
  type TenantLifecycleEvent,
  type TenantHostBinding,
  type LegalEntityProfileVersion,
  type EntityRegistryConflict,
  listApprovalRequests,
  type ApprovalRequest,
  listOwnershipRelationships,
  getOwnershipGraph,
  type OwnershipRelationship,
  listParties,
  type PartySummary,
  listResolutionCases,
  type ResolutionCase,
  listTaxIdentityBundles,
  type TaxIdentityBundle,
  listResidencyPolicies,
  getTenantResidencyRegion,
  type ResidencyPolicy,
} from "@/lib/api/tenants-org";

export const metadata: Metadata = { title: "Tenants & Entities | Zoiko Suite" };

function RegisterSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

/**
 * Registry summary KPIs — TER-FE-1
 * Displays the five KPIs from GET /v1/registry/summary in the console header.
 */
async function SummaryKPIs({ tenantId }: { tenantId: string }) {
  const identity = await sessionIdentity();
  const result = await getRegistrySummary(tenantId, identity);

  if (!result.ok) {
    return (
      <Card className="mb-6 border-amber-300 dark:border-amber-700">
        <CardHeader>
          <CardTitle className="text-amber-900 dark:text-amber-100">Registry summary unavailable</CardTitle>
          <CardDescription>{result.error.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const data: RegistrySummary = result.data;

  return (
    <Card className="mb-6 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-slate-300 dark:border-slate-700">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div className="p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{data.active_tenants}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Active tenants</div>
            </div>
            <div className="p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
              <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{data.active_legal_entities}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Active legal entities</div>
            </div>
            <div className="p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
              <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">{data.approvals_awaiting_decision}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Approvals awaiting decision</div>
            </div>
            <div className="p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
              <div className="text-3xl font-bold text-rose-600 dark:text-rose-400">{data.open_registry_conflicts}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Open registry conflicts</div>
            </div>
            <div className="p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
              <div className="text-3xl font-bold text-violet-600 dark:text-violet-400">{data.open_party_resolution_cases}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Open resolution cases</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Unwrap a list response.
 *
 * The registry's list routes answer with a bare array, but some services on this
 * platform wrap theirs in a single-key envelope. This tolerates both rather than
 * rendering an empty table when the shape is merely different — and returns []
 * on failure, because the caller decides how to report a failed read.
 */
function unwrapList<T>(
  result: { ok: true; data: unknown } | { ok: false },
  key: string,
): T[] {
  if (!result.ok) return [];
  if (Array.isArray(result.data)) return result.data as T[];
  const wrapped = (result.data as Record<string, unknown> | null)?.[key];
  return Array.isArray(wrapped) ? (wrapped as T[]) : [];
}

/**
 * How many entities the hierarchy panel reads relationships for.
 *
 * There is no tenant-wide hierarchy route — relationships are only reachable
 * per entity — so a complete graph costs one request per entity. This bounds
 * that, and the panel says when it has bounded it rather than presenting a
 * partial graph as the whole one.
 */
const HIERARCHY_ENTITY_LIMIT = 25;

async function sessionIdentity(): Promise<Partial<SessionIdentity>> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  // Partial rather than a thrown error when there is no session: this runs in a
  // page, and the panels below render "no tenant on this session" instead of
  // crashing the route.
  return session ? toIdentity(session) : {};
}

/**
 * The tenant panel.
 *
 * There is no "list tenants" endpoint and deliberately so — reads are scoped by
 * row-level security to the caller's own tenant, so a list would either return
 * one row or leak. The console reads the session tenant directly.
 */
async function TenantPanel() {
  const identity = await sessionIdentity();

  if (!identity.tenantId) {
    return (
      <PanelEmptyState
        icon={Building2}
        label="No tenant on this session"
        hint="The session carries no tenant ID, so there is nothing to scope a read to. Provision a tenant below to create one."
      />
    );
  }

  const [tenantResult, regionResult] = await Promise.all([
    getTenant(identity.tenantId, identity),
    resolveTenantRegion(identity.tenantId, identity),
  ]);

  if (!tenantResult.ok) {
    return (
      <PanelEmptyState
        icon={Building2}
        label={
          tenantResult.error.status === 404
            ? "This session's tenant is not in the registry"
            : "Tenant registry unavailable"
        }
        hint={tenantResult.error.message}
        tone={tenantResult.error.status === 404 ? "neutral" : "warning"}
      />
    );
  }

  // 409 here is the documented "policy has no region yet" state, not a failure.
  const region: Parameters<typeof TenantOverview>[0]["region"] = regionResult.ok
    ? { kind: "resolved", value: regionResult.data as ResolvedTenantRegion }
    : regionResult.error.status === 409
      ? { kind: "unresolved" }
      : { kind: "unavailable" };

  return (
    <div className="space-y-6">
      <TenantOverview tenant={tenantResult.data} region={region} />
      <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          Lifecycle commands
        </h3>
        <TenantCommandPanel
          tenantId={tenantResult.data.tenant_id}
          lifecycleState={tenantResult.data.lifecycle_state}
          recordVersion={tenantResult.data.record_version ?? 0}
        />
      </div>

      <details className="border-t border-slate-200 pt-5 dark:border-slate-800">
        <summary className="cursor-pointer text-xs text-slate-500 dark:text-slate-400">
          Generic lifecycle transition
        </summary>
        <div className="mt-3">
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            This route sets a target state without naming a command, so the lifecycle history records
            where the tenant ended up but not which governance command put it there. Prefer the named
            commands above wherever one applies.
          </p>
          <TenantLifecycleForm
            tenantId={tenantResult.data.tenant_id}
            currentState={tenantResult.data.lifecycle_state}
          />
        </div>
      </details>

      <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">Defaults</h3>
        <ChangeDefaultsForm
          tenantId={tenantResult.data.tenant_id}
          currentLocale={tenantResult.data.primary_locale}
          currentTimezone={tenantResult.data.primary_timezone}
          recordVersion={tenantResult.data.record_version ?? 0}
        />
      </div>
    </div>
  );
}

/**
 * Lifecycle evidence and hostname bindings.
 *
 * Together because both answer questions about the tenant rather than about its
 * contents: what has happened to it, and which hostnames resolve to it.
 */
async function TenantEvidencePanel() {
  const identity = await sessionIdentity();
  if (!identity.tenantId) return null;

  const [historyResult, bindingsResult] = await Promise.all([
    listTenantLifecycleHistory(identity.tenantId, identity),
    listTenantHostBindings(identity.tenantId, identity),
  ]);

  const history = unwrapList(historyResult, "events") as TenantLifecycleEvent[];
  const bindings = unwrapList(bindingsResult, "bindings") as TenantHostBinding[];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          Lifecycle history
        </h3>
        {!historyResult.ok ? (
          <PanelEmptyState
            icon={Building2}
            label="Lifecycle history unavailable"
            hint={historyResult.error.message}
            tone="warning"
          />
        ) : (
          <TenantLifecycleHistory events={history} />
        )}
      </div>

      <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">Hostnames</h3>
        <HostBindingTable bindings={bindings} />
        <div className="mt-4">
          <BindHostForm tenantId={identity.tenantId} />
        </div>
      </div>
    </div>
  );
}

/**
 * ORG-03 profile versioning.
 *
 * Reads the version history of the first entity only. A tenant-wide version
 * view would cost one request per entity, so the panel names the entity it is
 * showing rather than presenting one entity history as the tenant one.
 */
async function ProfileVersionPanel() {
  const identity = await sessionIdentity();
  if (!identity.tenantId) return null;

  const entitiesResult = await listEntities(identity.tenantId, identity);
  const entities = unwrapList(entitiesResult, "entities") as LegalEntity[];
  if (entities.length === 0) return null;

  const options = entities.map((e) => ({
    legal_entity_id: e.legal_entity_id,
    entity_code: e.entity_code,
    legal_name: e.legal_name,
  }));
  const versionsByEntity: Record<string, number> = {};
  for (const e of entities) versionsByEntity[e.legal_entity_id] = e.record_version ?? 0;

  const first = entities[0];
  const versionsResult = await listEntityVersions(first.legal_entity_id, identity);
  const versions = unwrapList(versionsResult, "versions") as LegalEntityProfileVersion[];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-1 text-sm font-medium text-slate-900 dark:text-slate-100">
          Profile history &mdash; {first.entity_code}
        </h3>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Showing {first.legal_name}. Amending a profile adds a version; it never edits one in place,
          which is why a lookup as of a past date still returns the name that date was booked under.
        </p>
        <ProfileVersionTable versions={versions} />
      </div>

      <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          Record a profile change
        </h3>
        <AmendProfileForm entities={options} entityVersions={versionsByEntity} />
      </div>

      <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          Reconstruct as of a date
        </h3>
        <EntityAsOfForm entities={options} />
      </div>
    </div>
  );
}

/** The NP5 quarantine, plus the registry search that helps avoid creating one. */
async function RegistryIntegrityPanel() {
  const identity = await sessionIdentity();
  if (!identity.tenantId) return null;

  const conflictsResult = await listRegistryConflicts(identity, true);
  const conflicts = unwrapList(conflictsResult, "conflicts") as EntityRegistryConflict[];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          Find an entity by registry number
        </h3>
        <RegistryNumberSearchForm />
      </div>

      <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          Quarantined duplicates
        </h3>
        {!conflictsResult.ok ? (
          <PanelEmptyState
            icon={Layers}
            label="Quarantine unavailable"
            hint={conflictsResult.error.message}
            tone="warning"
          />
        ) : (
          <RegistryConflictPanel conflicts={conflicts} />
        )}
      </div>
    </div>
  );
}

/** Entity register plus the two forms that need the entity list. */
async function EntityPanel() {
  const identity = await sessionIdentity();
  if (!identity.tenantId) return null;

  const [entitiesResult, tenantResult, regionsResult] = await Promise.all([
    listEntities(identity.tenantId, identity),
    getTenant(identity.tenantId, identity),
    listResidencyRegions(identity),
  ]);

  const entities = unwrapList(entitiesResult, "entities") as LegalEntity[];
  const regions = unwrapList(regionsResult, "regions") as ResidencyRegion[];
  const residencyPolicyId = tenantResult.ok ? tenantResult.data.default_data_residency_policy_id : "";

  const options = Array.isArray(entities)
    ? entities.map((e) => ({
      id: e.legal_entity_id,
      label: `${e.entity_code} — ${e.legal_name}`,
      status: e.entity_status,
    }))
    : [];

  return (
    <div className="space-y-6">
      {!entitiesResult.ok ? (
        <PanelEmptyState
          icon={Building2}
          label="Entity register unavailable"
          hint={entitiesResult.error.message}
          tone="warning"
        />
      ) : (
        <EntityTable entities={entities} />
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Create a legal entity</CardTitle>
            <CardDescription>
              The jurisdiction is validated against jurisdiction-rules-svc before anything is written, and
              fails closed — an unknown ID is refused, and so is a write attempted while that service is
              unreachable. A residency policy is mandatory: the data model does not permit an entity without
              one.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <CreateEntityForm
            tenantId={identity.tenantId}
            residencyPolicyId={residencyPolicyId}
            jurisdictionField={
              <JurisdictionField
                id="entity_primary_jurisdiction"
                name="primary_jurisdiction_id"
                label="Primary jurisdiction"
                consumer="tenant-entity-registry-svc"
              />
            }
          />
        </CardContent>
      </Card>

      {options.length > 0 ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Update an entity</CardTitle>
              <CardDescription>
                Only the descriptive fields. Entity type, jurisdiction, fiscal calendar, residency policy and
                entity code are fixed at creation because posted transactions reference them, and status moves
                through its own transition below. Blank means &ldquo;leave alone&rdquo;, so clearing a trading
                name is an explicit choice rather than an empty box.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <UpdateEntityForm entities={options} />
          </CardContent>
        </Card>
      ) : null}

      {options.length > 0 ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Change an entity&apos;s status</CardTitle>
              <CardDescription>
                DISSOLVED is terminal. A transition that the state machine does not allow is refused rather
                than applied, and a successful one publishes entity.status.changed on the event backbone.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <EntityStatusForm entities={options} />
          </CardContent>
        </Card>
      ) : null}

      {options.length > 0 ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Assign a jurisdiction</CardTitle>
              <CardDescription>
                An entity can hold several jurisdictions — primary, secondary, tax-only, filing-only. These
                assignments are what downstream tax, payroll and filing services resolve rules against.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <AssignJurisdictionForm
              entities={options}
              jurisdictionField={
                <JurisdictionField
                  id="assign_jurisdiction"
                  name="jurisdiction_id"
                  label="Jurisdiction"
                  consumer="tenant-entity-registry-svc"
                />
              }
            />
            <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                End-dating uses DELETE but removes nothing — the assignment keeps its history and gains an
                effective_to, per the no-hard-delete doctrine.
              </p>
              <EndDateJurisdictionForm />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Create a data residency policy</CardTitle>
            <CardDescription>
              Regions are IaC-managed and read-only here. Provisioning always creates a default policy with no
              region, which is why a new tenant&apos;s hosting region reads as unresolved until one is assigned.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <CreateResidencyPolicyForm
            tenantId={identity.tenantId}
            regions={regions}
            regionsUnavailable={!regionsResult.ok}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Workspaces under this tenant.
 *
 * Separate from the entity panel because a workspace is not entity-scoped by
 * necessity — it may hang from the tenant with no entity at all — and folding it
 * into the entity register would imply otherwise.
 */
async function WorkspacePanel() {
  const identity = await sessionIdentity();
  if (!identity.tenantId) return null;

  const [workspacesResult, entitiesResult] = await Promise.all([
    listWorkspaces(identity.tenantId, identity),
    listEntities(identity.tenantId, identity),
  ]);

  const workspaces = unwrapList(workspacesResult, "workspaces") as Workspace[];
  const entities = unwrapList(entitiesResult, "entities") as LegalEntity[];

  const options = entities.map((e) => ({
    id: e.legal_entity_id,
    label: `${e.entity_code} — ${e.legal_name}`,
    status: e.entity_status,
  }));

  return (
    <div className="space-y-6">
      {!workspacesResult.ok ? (
        <PanelEmptyState
          icon={Layers}
          label="Workspace register unavailable"
          hint={workspacesResult.error.message}
          tone="warning"
        />
      ) : (
        <WorkspaceTable workspaces={workspaces} />
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Create a workspace</CardTitle>
            <CardDescription>
              The billing classification is mandatory and refused fail-closed if unrecognised — whether a
              workspace can ever produce a live Zoiko charge is not inferred from its name or its age. The
              non-commercial classes must never charge regardless of what entitlement says.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <CreateWorkspaceForm tenantId={identity.tenantId} entities={options} />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Approvals panel — ORG-02/03 Maker-Checker.
 * Lists pending approvals with approve/reject actions.
 */
async function ApprovalsPanel() {
  const identity = await sessionIdentity();
  if (!identity.tenantId) return null;

  const result = await listApprovalRequests(identity, true);
  const approvals = unwrapList(result, "approvals") as ApprovalRequest[];

  return (
    <div className="space-y-6">
      {!result.ok ? (
        <PanelEmptyState
          icon={ShieldCheck}
          label="Approvals unavailable"
          hint={result.error.message}
          tone="warning"
        />
      ) : approvals.length === 0 ? (
        <PanelEmptyState
          icon={ShieldCheck}
          label="No pending approvals"
          hint="All governed actions have been decided or expired."
          tone="neutral"
        />
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <Card key={a.approval_request_id} className="border-slate-200 dark:border-slate-700">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge tone={a.status === "PENDING" ? "info" : "neutral"}>{a.status}</Badge>
                      <span className="text-slate-500 dark:text-slate-400">{a.command_name}</span>
                      <span className="text-slate-400">|</span>
                      <span className="font-mono text-xs">{a.subject_type}:{a.subject_id.slice(0, 8)}…</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Proposed by {a.requested_by_principal_id} at {new Date(a.requested_at).toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono">
                      Fingerprint: {a.payload_fingerprint}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Ownership & Control panel — ORG-04.
 * Shows group structure, control chains, and SoD validation.
 */
async function OwnershipControlPanel() {
  const identity = await sessionIdentity();
  if (!identity.tenantId) return null;

  const [relationshipsResult, graphResult] = await Promise.all([
    listOwnershipRelationships(identity),
    getOwnershipGraph(identity.tenantId, new Date().toISOString(), identity),
  ]);

  const relationships = unwrapList(relationshipsResult, "relationships") as OwnershipRelationship[];
  const graph = graphResult.ok ? graphResult.data : null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          Effective-dated ownership relationships
        </h3>
        {!relationshipsResult.ok ? (
          <PanelEmptyState
            icon={GitBranch}
            label="Ownership data unavailable"
            hint={relationshipsResult.error.message}
            tone="warning"
          />
        ) : relationships.length === 0 ? (
          <PanelEmptyState
            icon={GitBranch}
            label="No ownership relationships"
            hint="Create one to establish group structure."
            tone="neutral"
          />
        ) : (
          <div className="space-y-2">
            {relationships.map((r) => (
              <Card key={r.relationship_id} className="border-slate-200 dark:border-slate-700">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge tone={r.status === "ACTIVE" ? "success" : "neutral"}>{r.status}</Badge>
                        <span className="font-mono text-xs">
                          {r.parent_legal_entity_id.slice(0, 8)}… → {r.child_legal_entity_id.slice(0, 8)}…
                        </span>
                        <span className="text-slate-400">|</span>
                        <span>{r.ownership_pct}% ownership</span>
                        <span className="text-slate-400">|</span>
                        <span>{r.voting_pct}% voting</span>
                        <span className="text-slate-400">|</span>
                        <span>{r.control_type}</span>
                        <span className="text-slate-400">|</span>
                        <span>Valid from {new Date(r.valid_from).toLocaleDateString()}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Evidence: {r.evidence_ref} | Reason: {r.reason}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {graph && (
        <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
          <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
            Control chains (as of now)
          </h3>
          <div className="space-y-2">
            {graph.relationships.map((rel) => (
              <Card key={`${rel.parent_legal_entity_id}-${rel.child_legal_entity_id}`} className="border-slate-200 dark:border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs">{rel.parent_legal_entity_id.slice(0, 8)}…</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-mono text-xs">{rel.child_legal_entity_id.slice(0, 8)}…</span>
                    <span className="text-slate-400">|</span>
                    <span>{rel.ownership_pct}% effective ownership</span>
                    <span className="text-slate-400">|</span>
                    <span>{rel.voting_pct}% effective voting</span>
                    <span className="text-slate-400">|</span>
                    <span>Path: {rel.path.join(" → ")}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Parties & Golden Record panel — ORG-07/MDM-05.
 * Match-first creation, versioned facts, identifiers, roles, resolution.
 */
async function PartiesPanel() {
  const identity = await sessionIdentity();
  if (!identity.tenantId) return null;

  const [partiesResult, casesResult] = await Promise.all([
    listParties(identity),
    listResolutionCases(identity, "open"),
  ]);

  const parties: PartySummary[] = partiesResult.ok ? partiesResult.data.items : [];
  const cases = unwrapList(casesResult, "cases") as ResolutionCase[];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          Parties (golden record)
        </h3>
        {!partiesResult.ok ? (
          <PanelEmptyState
            icon={Users}
            label="Parties unavailable"
            hint={partiesResult.error.message}
            tone="warning"
          />
        ) : parties.length === 0 ? (
          <PanelEmptyState
            icon={Users}
            label="No parties"
            hint="Create one with match-first to avoid duplicates."
            tone="neutral"
          />
        ) : (
          <div className="space-y-2">
            {parties.map((p) => (
              <Card key={p.party_id} className="border-slate-200 dark:border-slate-700">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge tone="neutral">{p.party_kind}</Badge>
                        <Badge tone="info">{p.source_class}</Badge>
                        <span className="font-medium">{p.legal_name}</span>
                        <span className="text-slate-400">|</span>
                        <span className="text-xs">v{p.current_version}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {p.party_id}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          Open Resolution Cases
        </h3>
        {!casesResult.ok ? (
          <PanelEmptyState
            icon={Merge}
            label="Resolution cases unavailable"
            hint={casesResult.error.message}
            tone="warning"
          />
        ) : cases.length === 0 ? (
          <PanelEmptyState
            icon={Merge}
            label="No open resolution cases"
            hint="Duplicate review and split cases appear here."
            tone="neutral"
          />
        ) : (
          <div className="space-y-2">
            {cases.map((c) => (
              <Card key={c.case_id} className="border-slate-200 dark:border-slate-700">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge tone={c.status === "OPEN" ? "info" : "neutral"}>{c.status}</Badge>
                        <Badge tone="neutral">{c.case_type}</Badge>
                        <span className="font-mono text-xs">{c.case_id.slice(0, 8)}…</span>
                        <span className="text-slate-400">|</span>
                        <span>Candidates: {c.candidate_party_ids.length}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Tax Identity Bundles panel — ORG-03.
 * Lists bundles with purpose-gated access for restricted data.
 */
async function TaxIdentityBundlesPanel() {
  const identity = await sessionIdentity();
  if (!identity.tenantId) return null;

  const entitiesResult = await listEntities(identity.tenantId, identity);
  const entities = unwrapList(entitiesResult, "entities") as LegalEntity[];

  if (entities.length === 0) return null;

  const firstEntity = entities[0];
  const bundlesResult = await listTaxIdentityBundles(firstEntity.legal_entity_id, identity);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-1 text-sm font-medium text-slate-900 dark:text-slate-100">
          Tax identity bundles — {firstEntity.entity_code}
        </h3>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Restricted bundles require purpose. Ordinary bundles are always readable.
        </p>
        {!bundlesResult.ok ? (
          <PanelEmptyState
            icon={FileText}
            label="Bundles unavailable"
            hint={bundlesResult.error.message}
            tone="warning"
          />
        ) : bundlesResult.data.length === 0 ? (
          <PanelEmptyState
            icon={FileText}
            label="No tax identity bundles"
            hint="Create one for this entity."
            tone="neutral"
          />
        ) : (
          <div className="space-y-2">
            {bundlesResult.data.map((b: TaxIdentityBundle) => (
              <Card key={b.tax_identity_bundle_id} className="border-slate-200 dark:border-slate-700">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge tone={b.data_classification === "RESTRICTED" || b.data_classification === "CONFIDENTIAL" ? "danger" : "neutral"}>
                          {b.data_classification}
                        </Badge>
                        <Badge tone="info">{b.status}</Badge>
                        <span className="font-mono text-xs">{b.jurisdiction_id}</span>
                        <span className="text-slate-400">|</span>
                        <span>Valid from {new Date(b.effective_from).toLocaleDateString()}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {b.tax_identity_bundle_id}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Residency panel — GOV-02.
 * Shows policies, regions, and the tenant's resolved region.
 */
async function ResidencyPanel() {
  const identity = await sessionIdentity();
  if (!identity.tenantId) return null;

  const [policiesResult, regionsResult, tenantRegionResult] = await Promise.all([
    listResidencyPolicies(identity),
    listResidencyRegions(identity),
    getTenantResidencyRegion(identity.tenantId, identity),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          Residency Policies
        </h3>
        {!policiesResult.ok ? (
          <PanelEmptyState
            icon={Globe}
            label="Policies unavailable"
            hint={policiesResult.error.message}
            tone="warning"
          />
        ) : policiesResult.data.length === 0 ? (
          <PanelEmptyState
            icon={Globe}
            label="No residency policies"
            hint="Create one to define data handling rules."
            tone="neutral"
          />
        ) : (
          <div className="space-y-2">
            {policiesResult.data.map((p: ResidencyPolicy) => (
              <Card key={p.data_residency_policy_id} className="border-slate-200 dark:border-slate-700">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge tone={p.active_flag ? "success" : "neutral"}>
                          {p.active_flag ? "Active" : "Inactive"}
                        </Badge>
                        <Badge tone="info">{p.residency_mode}</Badge>
                        <Badge tone="neutral">{p.conflict_resolution_mode}</Badge>
                        <span className="font-mono text-xs">{p.residency_region_id}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {p.policy_name} ({p.policy_code})
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          Residency Regions (IaC-managed, read-only)
        </h3>
        {!regionsResult.ok ? (
          <PanelEmptyState
            icon={Globe}
            label="Regions unavailable"
            hint={regionsResult.error.message}
            tone="warning"
          />
        ) : regionsResult.data.length === 0 ? (
          <PanelEmptyState
            icon={Globe}
            label="No regions"
            hint="Regions are provisioned via IaC."
            tone="neutral"
          />
        ) : (
          <div className="space-y-2">
            {regionsResult.data.map((r: ResidencyRegion) => (
              <Card key={r.residency_region_id} className="border-slate-200 dark:border-slate-700">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <Badge tone="info">{r.region_code}</Badge>
                    <span className="font-mono text-xs">{r.residency_region_id}</span>
                    <span className="text-slate-500 dark:text-slate-400">{r.region_name}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
        <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
          This Tenant&apos;s Resolved Region
        </h3>
        {!tenantRegionResult.ok ? (
          <PanelEmptyState
            icon={Globe}
            label="Region unresolved"
            hint={tenantRegionResult.error.message}
            tone="warning"
          />
        ) : (
          <Card className="border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Badge tone="success">{tenantRegionResult.data.region_code}</Badge>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  This is the region the ingress layer will route this tenant&apos;s traffic to.
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/**
 * Entity hierarchy.
 *
 * The registry exposes relationships only per entity, so the full graph costs
 * one read per entity. That is bounded here, and the bound is stated rather than
 * left to look like a complete picture.
 */
async function HierarchyPanel() {
  const identity = await sessionIdentity();
  if (!identity.tenantId) return null;

  const entitiesResult = await listEntities(identity.tenantId, identity);
  const entities = unwrapList(entitiesResult, "entities") as LegalEntity[];

  if (entities.length === 0) return null;

  const scanned = entities.slice(0, HIERARCHY_ENTITY_LIMIT);
  const results = await Promise.all(
    scanned.map((e) => listHierarchies(e.legal_entity_id, identity)),
  );

  // The same relationship comes back from both of its endpoints, so the merged
  // set is deduplicated by hierarchy_id rather than rendered twice.
  const byId = new Map<string, EntityHierarchy>();
  for (const r of results) {
    for (const h of (unwrapList(r, "hierarchies") as EntityHierarchy[])) {
      byId.set(h.hierarchy_id, h);
    }
  }
  const hierarchies = [...byId.values()];
  const anyFailed = results.some((r) => !r.ok);
  const truncated = entities.length > scanned.length;

  const options = entities.map((e) => ({
    id: e.legal_entity_id,
    label: `${e.entity_code} — ${e.legal_name}`,
    status: e.entity_status,
  }));

  return (
    <Card className="mb-6">
      <CardHeader>
        <div>
          <CardTitle>Entity hierarchy</CardTitle>
          <CardDescription>
            Parent/child relationships between this tenant&apos;s legal entities, effective-dated. The same
            pair may hold several relationship types at once — an ownership edge and a reporting edge are
            different facts about the same two entities.
            {truncated
              ? ` Read for the first ${scanned.length} of ${entities.length} entities, so relationships involving only the remainder are not shown.`
              : ""}
            {anyFailed
              ? " At least one entity's relationships could not be read, so this graph may be incomplete."
              : ""}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <HierarchyTable hierarchies={hierarchies} entities={entities} />

        {options.length > 1 ? (
          <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
            <CreateHierarchyForm tenantId={identity.tenantId} entities={options} />
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            A relationship needs two different entities. Create a second legal entity to record one.
          </p>
        )}

        {hierarchies.length > 0 ? (
          <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              End-dating uses DELETE but removes nothing — the relationship keeps its history and gains an
              effective_to.
            </p>
            <EndDateHierarchyForm />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function TenantsPage() {
  const identity = await sessionIdentity();

  return (
    <div>
      <PageHeader
        title="Tenants & Entities"
        description="The authoritative registry every other service depends on: a tenant_id from here scopes row-level security platform-wide, and a legal_entity_id is the scope authorization decisions are evaluated against."
      />

      {identity.tenantId ? (
        <Suspense fallback={<RegisterSkeleton />}>
          <SummaryKPIs tenantId={identity.tenantId} />
        </Suspense>
      ) : (
        <Card className="mb-6 border-amber-300 dark:border-amber-700">
          <CardHeader>
            <CardTitle className="text-amber-900 dark:text-amber-100">No tenant on this session</CardTitle>
            <CardDescription>Registry summary requires a tenant scope.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>This tenant</CardTitle>
            <CardDescription>
              Read live from tenant-entity-registry-svc, scoped by row-level security to the session&apos;s own
              tenant. Status and lifecycle are separate fields — a tenant is created ACTIVE in status while
              still ONBOARDING in lifecycle, and only lifecycle has a state machine.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<RegisterSkeleton />}>
            <TenantPanel />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Provision a tenant</CardTitle>
            <CardDescription>
              The one call with no tenant to scope to — it is what creates one — so it is authorized against a
              platform scope rather than a tenant. A principal needs TENANT_PROVISION granted there, not
              against any tenant.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ProvisionTenantForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Lifecycle evidence &amp; hostnames</CardTitle>
            <CardDescription>
              Every lifecycle change is recorded with the command that caused it, who made it, why, and
              who approved it where a second approver was required. Hostnames bound here are what let the
              registry refuse a request whose host and claimed tenant disagree.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<RegisterSkeleton />}>
            <TenantEvidencePanel />
          </Suspense>
        </CardContent>
      </Card>

      <Suspense fallback={<RegisterSkeleton />}>
        <EntityPanel />
      </Suspense>

      <Card className="mb-6 mt-6">
        <CardHeader>
          <div>
            <CardTitle>Legal profile versions</CardTitle>
            <CardDescription>
              A legal entity name, registry identity and registered office are effective-dated. A change
              creates a new version and closes the previous one; nothing is overwritten, so a historical
              read still returns the identity that period was booked under.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<RegisterSkeleton />}>
            <ProfileVersionPanel />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Registry integrity</CardTitle>
            <CardDescription>
              Two active entities in one jurisdiction cannot hold the same registration number. An attempt
              to create one is refused and quarantined with its details intact &mdash; never merged, and
              never written and flagged afterwards.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<RegisterSkeleton />}>
            <RegistryIntegrityPanel />
          </Suspense>
        </CardContent>
      </Card>

      <Suspense fallback={<RegisterSkeleton />}>
        <HierarchyPanel />
      </Suspense>

      {/* ── Approvals (ORG-02/03 Maker-Checker) ──────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Approvals</CardTitle>
            <CardDescription>
              Maker-checker governance: every lifecycle command and governed identity change requires a
              second verified principal to approve. Pending approvals show the proposer, the command, and the
              payload fingerprint so the approver can verify nothing was altered.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<RegisterSkeleton />}>
            <ApprovalsPanel />
          </Suspense>
        </CardContent>
      </Card>

      {/* ── Ownership & Control (ORG-04) ──────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Ownership & Control</CardTitle>
            <CardDescription>
              Group structure with effective-dated ownership relationships. The graph shows control chains
              at any date, SoD validation prevents prohibited concentrations, and supersession preserves
              history.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<RegisterSkeleton />}>
            <OwnershipControlPanel />
          </Suspense>
        </CardContent>
      </Card>

      {/* ── Parties & Golden Record (ORG-07/MDM-05) ───────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Parties & Golden Record</CardTitle>
            <CardDescription>
              Match-first party creation: candidates are shown before creating. Facts, identifiers, roles,
              contact points, addresses, and establishments are versioned per party. Resolution handles
              merge/split of duplicate parties.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<RegisterSkeleton />}>
            <PartiesPanel />
          </Suspense>
        </CardContent>
      </Card>

      {/* ── Tax Identity Bundles (ORG-03) ─────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Tax Identity Bundles</CardTitle>
            <CardDescription>
              Purpose-scoped tax identifiers (LEI, TIN, VAT, GIIN). Restricted bundles require the
              caller to pass a purpose dialog; ordinary bundles are always readable.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<RegisterSkeleton />}>
            <TaxIdentityBundlesPanel />
          </Suspense>
        </CardContent>
      </Card>

      {/* ── Residency (GOV-02) ─────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Data Residency</CardTitle>
            <CardDescription>
              Policies define how this tenant&apos;s data must be handled. Regions are IaC-managed and read-only.
              The tenant&apos;s resolved region is what the ingress layer enforces.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<RegisterSkeleton />}>
            <ResidencyPanel />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="mb-6 mt-6">
        <CardHeader>
          <div>
            <CardTitle>Workspaces</CardTitle>
            <CardDescription>
              A workspace sits beneath the tenant and may optionally scope to one legal entity. Its billing
              classification decides whether it can ever produce a live charge, which is why it is a column
              here rather than a detail buried a click away.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<RegisterSkeleton />}>
            <WorkspacePanel />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
