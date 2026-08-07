import { CopyableId } from "@/components/admin/shared";
import type { ResolvedTenantRegion, Tenant } from "@/lib/api/tenants";

const LIFECYCLE_TONE: Record<string, string> = {
  ONBOARDING: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  SUSPENDED: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  OFFBOARDING: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">{children}</dd>
    </div>
  );
}

/**
 * Tenant header.
 *
 * Renders `status` and `lifecycle_state` as two separate fields on purpose.
 * They are different columns with different vocabularies, and only
 * lifecycle_state has a state machine and an endpoint. A tenant is created
 * status ACTIVE while still lifecycle ONBOARDING, so showing one and labelling
 * it "status" would report the tenant as fully in service when it is not.
 *
 * `region` is a union rather than an optional value because "no region
 * assigned" is a real, expected state — provisioning always creates a residency
 * policy without one — and the lookup answers 409 for it. Rendering that as an
 * error would report normal onboarding as a fault.
 */
export function TenantOverview({
  tenant,
  region,
}: {
  tenant: Tenant;
  region: { kind: "resolved"; value: ResolvedTenantRegion } | { kind: "unresolved" } | { kind: "unavailable" };
}) {
  const tone = LIFECYCLE_TONE[tenant.lifecycle_state] ?? LIFECYCLE_TONE.ONBOARDING;

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Tenant">
        <span className="font-medium">{tenant.tenant_code}</span>
        <span className="ml-2 text-slate-500 dark:text-slate-400">{tenant.legal_name}</span>
      </Field>

      <Field label="Lifecycle state">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
          {tenant.lifecycle_state}
        </span>
      </Field>

      <Field label="Operational status">
        <span className="text-slate-700 dark:text-slate-300">{tenant.status}</span>
        <span className="ml-2 text-xs text-slate-400">separate field from lifecycle</span>
      </Field>

      <Field label="Tenant ID">
        <CopyableId value={tenant.tenant_id} />
      </Field>

      <Field label="Default residency policy">
        <CopyableId value={tenant.default_data_residency_policy_id} />
      </Field>

      <Field label="Hosting region">
        {region.kind === "resolved" ? (
          <span>
            {region.value.region_code} — {region.value.region_name}
          </span>
        ) : region.kind === "unresolved" ? (
          <span className="text-amber-600 dark:text-amber-400">
            Not assigned yet — the default policy was created without a region
          </span>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">Could not be read</span>
        )}
      </Field>

      <Field label="Currency / timezone / locale">
        {tenant.default_currency_code} · {tenant.primary_timezone} · {tenant.primary_locale}
      </Field>

      <Field label="Created by">
        <CopyableId value={tenant.created_by_principal_id} />
      </Field>
    </dl>
  );
}
