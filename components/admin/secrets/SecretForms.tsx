"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { JsonBlock, ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { SECRET_CLASSES, DATA_CLASSIFICATIONS } from "@/lib/api/secret-vault";
import {
  submitSecretPolicy,
  submitSecretVersion,
  submitSecretActivation,
  submitSecretMaterial,
  submitBrokerRequest,
  submitRevoke,
  submitRotation,
} from "@/app/admin/secrets/actions";
import {
  IDLE_VAULT_WRITE,
  IDLE_BROKER,
  IDLE_REVOKE,
  IDLE_ROTATE,
  type VaultWriteState,
  type BrokerState,
  type RevokeState,
  type RotateState,
} from "@/app/admin/secrets/state";

const WRITE_TONE = {
  created: "success",
  replayed: "neutral",
  conflict: "warning",
  error: "error",
  idle: "neutral",
} as const;

const BROKER_TONE = {
  granted: "success",
  denied: "error",
  "no-policy": "warning",
  "vault-down": "warning",
  error: "error",
  idle: "neutral",
} as const;

const REVOKE_TONE = {
  revoked: "success",
  "already-terminal": "warning",
  error: "error",
  idle: "neutral",
} as const;

const ROTATE_TONE = {
  rotated: "success",
  replayed: "neutral",
  error: "error",
  idle: "neutral",
} as const;

function ScopeField({ id, defaultValue = "tenant" }: { id: string; defaultValue?: string }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        Scope
      </label>
      <select id={id} name="scope" defaultValue={defaultValue} className={FIELD}>
        <option value="global">Global — every tenant</option>
        <option value="tenant">This tenant</option>
        <option value="entity">This legal entity</option>
      </select>
    </div>
  );
}

export function RegisterSecretPolicyForm() {
  const [state, action, pending] = useActionState<VaultWriteState, FormData>(
    submitSecretPolicy,
    IDLE_VAULT_WRITE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="secret_class" className={LABEL}>
            Secret class
          </label>
          <select
            id="secret_class"
            name="secret_class"
            defaultValue="INTEGRATION_TOKEN"
            className={FIELD}
          >
            {SECRET_CLASSES.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="data_classification" className={LABEL}>
            Data classification <span className={OPTIONAL}>(optional)</span>
          </label>
          <select
            id="data_classification"
            name="data_classification"
            defaultValue=""
            className={FIELD}
          >
            <option value="">Not stated</option>
            {DATA_CLASSIFICATIONS.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="secret_path" className={LABEL}>
            Secret path{" "}
            <span className={OPTIONAL}>(the vault reference — never the value)</span>
          </label>
          <input
            id="secret_path"
            name="secret_path"
            required
            placeholder="integrations/stripe/webhook-signing-key"
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Registering…" : "Register path"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Step 1 of 4. Paths are unique — reusing one with a different class is a conflict.
        </p>
      </div>

      <ResultBanner tone={WRITE_TONE[state.status]} message={state.message}>
        {state.policy && (
          <JsonBlock
            value={{
              secret_policy_id: state.policy.secret_policy_id,
              secret_path: state.policy.secret_path,
              secret_class: state.policy.secret_class,
            }}
          />
        )}
      </ResultBanner>
    </form>
  );
}

export function CreateSecretVersionForm() {
  const [state, action, pending] = useActionState<VaultWriteState, FormData>(
    submitSecretVersion,
    IDLE_VAULT_WRITE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="version_secret_policy_id" className={LABEL}>
            Secret policy ID
          </label>
          <input
            id="version_secret_policy_id"
            name="secret_policy_id"
            required
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
        <ScopeField id="secret_version_scope" />
        <div>
          <label htmlFor="max_lease_duration_seconds" className={LABEL}>
            Max lease duration <span className={OPTIONAL}>(seconds, &gt; 0)</span>
          </label>
          <input
            id="max_lease_duration_seconds"
            name="max_lease_duration_seconds"
            type="number"
            min="1"
            required
            defaultValue={3600}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="secret_effective_from" className={LABEL}>
            Effective from
          </label>
          <input
            id="secret_effective_from"
            name="effective_from"
            type="date"
            required
            className={FIELD}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="allowed_workload_ids" className={LABEL}>
            Allowed workloads{" "}
            <span className={OPTIONAL}>(comma or newline separated — empty denies everyone)</span>
          </label>
          <textarea
            id="allowed_workload_ids"
            name="allowed_workload_ids"
            rows={2}
            placeholder="33333333-3333-3333-3333-333333333333"
            className={`${FIELD} font-mono text-xs`}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Creating…" : "Create draft version"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Step 2 of 4. Created DRAFT — grants nothing yet.
        </p>
      </div>

      <ResultBanner tone={WRITE_TONE[state.status]} message={state.message}>
        {state.version && (
          <JsonBlock
            value={{
              secret_policy_version_id: state.version.secret_policy_version_id,
              version_status: state.version.version_status,
              max_lease_duration_seconds: state.version.max_lease_duration_seconds,
            }}
          />
        )}
      </ResultBanner>
    </form>
  );
}

export function ActivateSecretVersionForm() {
  const [state, action, pending] = useActionState<VaultWriteState, FormData>(
    submitSecretActivation,
    IDLE_VAULT_WRITE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="activate_secret_policy_id" className={LABEL}>
            Secret policy ID
          </label>
          <input
            id="activate_secret_policy_id"
            name="secret_policy_id"
            required
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="activate_secret_version_id" className={LABEL}>
            Version ID
          </label>
          <input
            id="activate_secret_version_id"
            name="version_id"
            required
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Activating…" : "Activate version"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Step 3 of 4. Brokering still fails until material is seeded.
        </p>
      </div>

      <ResultBanner tone={WRITE_TONE[state.status]} message={state.message} />
    </form>
  );
}

export function PutMaterialForm() {
  const [state, action, pending] = useActionState<VaultWriteState, FormData>(
    submitSecretMaterial,
    IDLE_VAULT_WRITE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label htmlFor="material_secret_policy_id" className={LABEL}>
            Secret policy ID
          </label>
          <input
            id="material_secret_policy_id"
            name="secret_policy_id"
            required
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="material" className={LABEL}>
            Secret material <span className={OPTIONAL}>(base64-encoded before sending)</span>
          </label>
          <input
            id="material"
            name="material"
            type="password"
            required
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Storing…" : "Store material"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Step 4 of 4. Goes straight to the vault backend — never stored or echoed by this
          console.
        </p>
      </div>

      <ResultBanner tone={WRITE_TONE[state.status]} message={state.message} />
    </form>
  );
}

export function BrokerForm() {
  const [state, action, pending] = useActionState<BrokerState, FormData>(
    submitBrokerRequest,
    IDLE_BROKER,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="broker_secret_path" className={LABEL}>
            Secret path
          </label>
          <input
            id="broker_secret_path"
            name="secret_path"
            required
            placeholder="integrations/stripe/webhook-signing-key"
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
        <ScopeField id="broker_scope" />
        <div className="sm:col-span-3">
          <label htmlFor="requested_by" className={LABEL}>
            Requesting principal{" "}
            <span className={OPTIONAL}>(blank = you; must appear in allowed_workload_ids)</span>
          </label>
          <input
            id="requested_by"
            name="requested_by"
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Requesting…" : "Request access"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Every attempt is recorded in the audit log, granted or refused
        </p>
      </div>

      <ResultBanner tone={BROKER_TONE[state.status]} message={state.message}>
        {state.lease && <JsonBlock value={state.lease} />}
        {state.tokenIssued && (
          <p className="text-xs">
            A lease token was minted. It is deliberately dropped server-side and never sent to
            this page — it is a live credential, and rendering it would put it in the page
            payload.
          </p>
        )}
      </ResultBanner>
    </form>
  );
}

export function RevokeLeaseForm() {
  const [state, action, pending] = useActionState<RevokeState, FormData>(
    submitRevoke,
    IDLE_REVOKE,
  );

  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="revoke_lease_id" className={LABEL}>
          Lease ID
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="revoke_lease_id"
            name="lease_id"
            required
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
          <Button type="submit" size="sm" loading={pending} className="shrink-0">
            {pending ? "Revoking…" : "Revoke"}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
          The service answers 200 with the unchanged lease when nothing transitioned, so this
          checks <code>revoked_at</code> rather than trusting the status code.
        </p>
      </div>

      <ResultBanner tone={REVOKE_TONE[state.status]} message={state.message}>
        {state.lease && (
          <JsonBlock
            value={{
              lease_id: state.lease.lease_id,
              status: state.lease.status,
              revoked_at: state.lease.revoked_at,
            }}
          />
        )}
      </ResultBanner>
    </form>
  );
}

export function RotateSecretForm() {
  const [state, action, pending] = useActionState<RotateState, FormData>(
    submitRotation,
    IDLE_ROTATE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="rotate_secret_policy_id" className={LABEL}>
            Secret policy ID
          </label>
          <input
            id="rotate_secret_policy_id"
            name="secret_policy_id"
            required
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="request_id" className={LABEL}>
            Request ID <span className={OPTIONAL}>(blank = new rotation)</span>
          </label>
          <input
            id="request_id"
            name="request_id"
            className={`${FIELD} font-mono text-xs`}
            placeholder="Reuse one to exercise the replay path"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Rotating…" : "Rotate secret"}
        </Button>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Revokes every live lease on this path. Not reversible.
        </p>
      </div>

      <ResultBanner tone={ROTATE_TONE[state.status]} message={state.message}>
        {state.result && <JsonBlock value={state.result} />}
      </ResultBanner>
    </form>
  );
}
