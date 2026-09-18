import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Building2, Layers } from "lucide-react";
import {
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
  type EntityRegistryConflict,
  type LegalEntityProfileVersion,
  type TenantHostBinding,
  type TenantLifecycleEvent,
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

  const history = unwrapList<TenantLifecycleEvent>(historyResult, "events");
  const bindings = unwrapList<TenantHostBinding>(bindingsResult, "bindings");

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
  const entities = unwrapList<LegalEntity>(entitiesResult, "entities");
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
  const versions = unwrapList<LegalEntityProfileVersion>(versionsResult, "versions");

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
  const conflicts = unwrapList<EntityRegistryConflict>(conflictsResult, "conflicts");

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

  const entities = unwrapList<LegalEntity>(entitiesResult, "entities");
  const regions = unwrapList<ResidencyRegion>(regionsResult, "regions");
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

  const workspaces = unwrapList<Workspace>(workspacesResult, "workspaces");
  const entities = unwrapList<LegalEntity>(entitiesResult, "entities");

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
  const entities = unwrapList<LegalEntity>(entitiesResult, "entities");

  if (entities.length === 0) return null;

  const scanned = entities.slice(0, HIERARCHY_ENTITY_LIMIT);
  const results = await Promise.all(
    scanned.map((e) => listHierarchies(e.legal_entity_id, identity)),
  );

  // The same relationship comes back from both of its endpoints, so the merged
  // set is deduplicated by hierarchy_id rather than rendered twice.
  const byId = new Map<string, EntityHierarchy>();
  for (const r of results) {
    for (const h of unwrapList<EntityHierarchy>(r, "hierarchies")) {
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

export default function TenantsPage() {
  return (
    <div>
      <PageHeader
        title="Tenants & Entities"
        description="The authoritative registry every other service depends on: a tenant_id from here scopes row-level security platform-wide, and a legal_entity_id is the scope authorization decisions are evaluated against."
      />

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
