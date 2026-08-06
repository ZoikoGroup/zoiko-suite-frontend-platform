import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Building2 } from "lucide-react";
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
  CreateResidencyPolicyForm,
  EndDateJurisdictionForm,
  EntityStatusForm,
  EntityTable,
  ProvisionTenantForm,
  TenantLifecycleForm,
  TenantOverview,
} from "@/components/admin/tenants";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  getTenant,
  listEntities,
  listResidencyRegions,
  resolveTenantRegion,
  type LegalEntity,
  type ResidencyRegion,
  type ResolvedTenantRegion,
} from "@/lib/api/tenants";

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

async function sessionIdentity() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  return {
    principalId: session?.principalId,
    tenantId: session?.tenantId,
    legalEntityId: session?.legalEntityId,
  };
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
        <TenantLifecycleForm
          tenantId={tenantResult.data.tenant_id}
          currentState={tenantResult.data.lifecycle_state}
        />
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

  const entities: LegalEntity[] = entitiesResult.ok ? entitiesResult.data : [];
  const regions: ResidencyRegion[] = regionsResult.ok ? regionsResult.data : [];
  const residencyPolicyId = tenantResult.ok ? tenantResult.data.default_data_residency_policy_id : "";

  const options = entities.map((e) => ({
    id: e.legal_entity_id,
    label: `${e.entity_code} — ${e.legal_name}`,
    status: e.entity_status,
  }));

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

      <Suspense fallback={<RegisterSkeleton />}>
        <EntityPanel />
      </Suspense>
    </div>
  );
}
