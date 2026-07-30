import type { Metadata } from "next";
import { Suspense } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
} from "@/components/ui";
import { PageHeader, LookupById } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import {
  LeasePanel,
  AuditPanel,
  ApplicableSecretPolicyPanel,
  SecretVersionHistoryPanel,
  RegisterSecretPolicyForm,
  CreateSecretVersionForm,
  ActivateSecretVersionForm,
  PutMaterialForm,
  BrokerForm,
  RevokeLeaseForm,
  RotateSecretForm,
} from "@/components/admin/secrets";
import { SECRET_CLASSES, AUDIT_EVENT_TYPES } from "@/lib/api/secret-vault";
import { lookupLease } from "./actions";

export const metadata: Metadata = { title: "Secret Vault" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type Scope = "global" | "tenant" | "entity";

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : undefined;
}

function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

const SUBMIT_BUTTON =
  "h-9 shrink-0 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-navy-800 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 dark:bg-navy-600 dark:hover:bg-navy-500 dark:focus-visible:ring-offset-slate-900";

export default async function SecretsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const requestedClass = one(params.secret_class);
  const secretClass = (SECRET_CLASSES as readonly string[]).includes(requestedClass ?? "")
    ? (requestedClass as string)
    : "INTEGRATION_TOKEN";

  const requestedScope = one(params.scope);
  const scope: Scope =
    requestedScope === "global" || requestedScope === "entity" || requestedScope === "tenant"
      ? requestedScope
      : "tenant";

  const historyPolicyId = one(params.history_policy_id);

  const auditFilters = {
    principal: one(params.audit_principal),
    secretPath: one(params.audit_path),
    eventType: one(params.audit_event),
  };

  return (
    <div>
      <PageHeader
        title="Secret Vault"
        description="The policy-gated broker in front of secret material. This service holds policy, lease, and audit metadata — never a secret value. Material lives behind a vault backend and is reachable only as a short-lived lease."
      />

      <Card className="mb-6 border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div>
            <CardTitle>How access actually works</CardTitle>
            <CardDescription>
              Four steps, and skipping the fourth is the usual reason a correctly-configured
              secret still cannot be brokered
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
            {[
              "Register the path. Immutable, and grants nothing on its own.",
              "Add a version saying which workloads may broker it, and for how long a lease may live. Created DRAFT.",
              "Activate the version. Until this, the path is invisible to the broker.",
              "Seed the material into the vault backend. Without it, policy passes and the vault call fails — which reads as an outage rather than as unprovisioned config.",
            ].map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-100 text-[11px] font-semibold text-navy-800 dark:bg-navy-500/20 dark:text-navy-200">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-300">
            <strong className="font-medium text-slate-800 dark:text-slate-100">
              Deny by absence.
            </strong>{" "}
            If no version is active for a path and scope, the broker refuses outright rather than
            handing the question back to the caller. An unconfigured secret is an inaccessible
            one — so a 404 from the broker means &ldquo;no policy&rdquo;, and only a 403 means
            &ldquo;policy said no&rdquo;. The two are kept apart everywhere below.{" "}
            <strong className="font-medium text-slate-800 dark:text-slate-100">
              The admin routes here are not authorized
            </strong>{" "}
            — registering, versioning, activating, seeding, and rotating are gated only by this
            console&apos;s session. The broker route is the one that authorizes, and it authorizes
            the requesting workload, not you.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Active secret policies</CardTitle>
            <CardDescription>
              What the broker would resolve, per class and scope. Most-specific first.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-72">
              <label htmlFor="secret_class" className={LABEL}>
                Secret class
              </label>
              <select
                id="secret_class"
                name="secret_class"
                defaultValue={secretClass}
                className={FIELD}
              >
                {SECRET_CLASSES.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:w-56">
              <label htmlFor="scope" className={LABEL}>
                Scope
              </label>
              <select id="scope" name="scope" defaultValue={scope} className={FIELD}>
                <option value="global">Global only</option>
                <option value="tenant">This tenant</option>
                <option value="entity">This legal entity</option>
              </select>
            </div>
            <button type="submit" className={SUBMIT_BUTTON}>
              Read policy set
            </button>
          </form>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <Suspense key={`${secretClass}:${scope}`} fallback={<TableSkeleton rows={3} />}>
              <ApplicableSecretPolicyPanel secretClass={secretClass} scope={scope} />
            </Suspense>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Version history</CardTitle>
            <CardDescription>
              Every version of one policy. The fastest way to see whether a version was created but
              never activated.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="secret_class" value={secretClass} />
            <input type="hidden" name="scope" value={scope} />
            <div className="flex-1">
              <label htmlFor="history_policy_id" className={LABEL}>
                Secret policy ID
              </label>
              <input
                id="history_policy_id"
                name="history_policy_id"
                defaultValue={historyPolicyId ?? ""}
                className={`${FIELD} font-mono text-xs`}
                autoComplete="off"
              />
            </div>
            <button type="submit" className={SUBMIT_BUTTON}>
              Read history
            </button>
          </form>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <Suspense key={historyPolicyId ?? "none"} fallback={<TableSkeleton rows={3} />}>
              <SecretVersionHistoryPanel secretPolicyId={historyPolicyId} />
            </Suspense>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Request access</CardTitle>
            <CardDescription>
              The core path. Resolves the active version for a secret path, checks the requesting
              principal against its allowed workloads, and either issues a lease or refuses.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <BrokerForm />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Issued leases</CardTitle>
            <CardDescription>
              Grants only — a refused request never becomes a lease, and appears in the audit log
              instead.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Suspense fallback={<TableSkeleton />}>
            <LeasePanel />
          </Suspense>
          <div className="grid grid-cols-1 gap-6 border-t border-slate-100 pt-5 lg:grid-cols-2 dark:border-slate-800">
            <LookupById
              action={lookupLease}
              inputName="lease_id"
              label="Read one lease"
              placeholder="lease-…"
              hint="Full record, including revoked_at — which is what actually says whether access was withdrawn."
            />
            <RevokeLeaseForm />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Access audit log</CardTitle>
            <CardDescription>
              Append-only. Every request, grant, denial, revocation, and rotation — denials
              included, which is what makes it evidence rather than a success log.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
            <div>
              <label htmlFor="audit_event" className={LABEL}>
                Event type
              </label>
              <select
                id="audit_event"
                name="audit_event"
                defaultValue={auditFilters.eventType ?? ""}
                className={FIELD}
              >
                <option value="">All</option>
                {AUDIT_EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="audit_path" className={LABEL}>
                Secret path
              </label>
              <input
                id="audit_path"
                name="audit_path"
                defaultValue={auditFilters.secretPath ?? ""}
                className={`${FIELD} font-mono text-xs`}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="audit_principal" className={LABEL}>
                Principal <span className={OPTIONAL}>(exact)</span>
              </label>
              <input
                id="audit_principal"
                name="audit_principal"
                defaultValue={auditFilters.principal ?? ""}
                className={`${FIELD} font-mono text-xs`}
                autoComplete="off"
              />
            </div>
            <button type="submit" className={SUBMIT_BUTTON}>
              Filter log
            </button>
          </form>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            <Suspense key={JSON.stringify(auditFilters)} fallback={<TableSkeleton />}>
              <AuditPanel filters={auditFilters} />
            </Suspense>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Provision a secret</CardTitle>
            <CardDescription>
              The four steps, in order. Each returns the ID the next one needs.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 divide-y divide-slate-100 dark:divide-slate-800">
          <RegisterSecretPolicyForm />
          <div className="pt-6">
            <CreateSecretVersionForm />
          </div>
          <div className="pt-6">
            <ActivateSecretVersionForm />
          </div>
          <div className="pt-6">
            <PutMaterialForm />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Rotate a secret</CardTitle>
            <CardDescription>
              Revokes every live lease on the path. The service notes its own limitation here: the
              revoke step and the ROTATED audit write are not one transaction.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <RotateSecretForm />
        </CardContent>
      </Card>
    </div>
  );
}
