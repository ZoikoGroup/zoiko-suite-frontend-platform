"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { LabelledId } from "./LabelledId";
import { FIELD, LABEL, OPTIONAL, PANEL } from "@/components/admin/shared/form";
import {
  ENTITY_STATUS_TRANSITIONS,
  ENTITY_TYPES,
  JURISDICTION_ASSIGNMENT_TYPES,
  RESIDENCY_MODES,
  CONFLICT_RESOLUTION_MODES,
  TENANT_LIFECYCLE_TRANSITIONS,
  type ResidencyRegion,
} from "@/lib/api/tenants";
import {
  assignJurisdictionAction,
  createEntityAction,
  createResidencyPolicyAction,
  endDateJurisdictionAction,
  provisionTenantAction,
  transitionEntityStatusAction,
  transitionTenantLifecycleAction,
} from "@/app/admin/tenants/actions";
import {
  CURRENCY_CODES,
  IDLE_CREATE_ENTITY,
  IDLE_JURISDICTION_WRITE,
  IDLE_PROVISION_TENANT,
  IDLE_RESIDENCY_POLICY,
  IDLE_TRANSITION,
  LOCALES,
  TIMEZONES,
} from "@/app/admin/tenants/state";

/**
 * Tone maps.
 *
 * `unauthenticated` is amber, not red: nothing the reader did was wrong and no
 * permission is missing — the request arrived without a verified identity,
 * which is a wiring fault. `unauthorized` is red because it is a real refusal
 * of this principal. `unvalidated` is amber for the same reason as elsewhere in
 * the console: a fail-closed refusal during an upstream outage is the service
 * working, and retrying later will succeed.
 */
const PROVISION_TONE = {
  provisioned: "success",
  conflict: "warning",
  unauthenticated: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
  "tenant-context": "error",
} as const;

const TRANSITION_TONE = {
  transitioned: "success",
  illegal: "warning",
  unauthenticated: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
  "tenant-context": "error",
} as const;

const ENTITY_TONE = {
  created: "success",
  "invalid-jurisdiction": "warning",
  unvalidated: "warning",
  conflict: "warning",
  unauthenticated: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
  "tenant-context": "error",
} as const;

const JURISDICTION_TONE = {
  assigned: "success",
  "end-dated": "success",
  "invalid-jurisdiction": "warning",
  unvalidated: "warning",
  unauthenticated: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
  "tenant-context": "error",
} as const;

const POLICY_TONE = {
  created: "success",
  conflict: "warning",
  unauthenticated: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
  "tenant-context": "error",
} as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}


// ── Provision tenant ────────────────────────────────────────────────────────

export function ProvisionTenantForm() {
  const [state, action, pending] = useActionState(provisionTenantAction, IDLE_PROVISION_TENANT);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="tenant_code">
            Tenant code
          </label>
          <input id="tenant_code" name="tenant_code" required className={FIELD} placeholder="ACME" />
        </div>
        <div>
          <label className={LABEL} htmlFor="legal_name">
            Legal name
          </label>
          <input id="legal_name" name="legal_name" required className={FIELD} placeholder="Acme Holdings Ltd" />
        </div>
        <div>
          <label className={LABEL} htmlFor="trading_name">
            Trading name <span className={OPTIONAL}>optional</span>
          </label>
          <input id="trading_name" name="trading_name" className={FIELD} placeholder="Acme" />
        </div>
        <div>
          <label className={LABEL} htmlFor="default_currency_code">
            Default currency
          </label>
          <select id="default_currency_code" name="default_currency_code" className={FIELD} defaultValue="GBP">
            {CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="primary_timezone">
            Primary timezone
          </label>
          <select id="primary_timezone" name="primary_timezone" className={FIELD} defaultValue="Europe/London">
            {TIMEZONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="primary_locale">
            Primary locale
          </label>
          <select id="primary_locale" name="primary_locale" className={FIELD} defaultValue="en-GB">
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Provisioning…" : "Provision tenant"}
      </Button>

      <ResultBanner tone={PROVISION_TONE[state.status]} message={state.message}>
        {state.tenant ? (
          <div className="mt-2 space-y-1.5">
            <LabelledId label="Tenant ID" value={state.tenant.tenant_id} />
            <LabelledId label="Default residency policy" value={state.tenant.default_data_residency_policy_id} />
          </div>
        ) : null}
      </ResultBanner>
    </form>
  );
}

// ── Tenant lifecycle ────────────────────────────────────────────────────────

export function TenantLifecycleForm({
  tenantId,
  currentState,
}: {
  tenantId: string;
  currentState: string;
}) {
  const [state, action, pending] = useActionState(transitionTenantLifecycleAction, IDLE_TRANSITION);
  const legal = TENANT_LIFECYCLE_TRANSITIONS[currentState] ?? [];

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />
      {/* Sent so the action can name the illegal transition rather than
          returning a bare 422 from the service. */}
      <input type="hidden" name="current_state" value={currentState} />

      <div className={PANEL}>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Currently <strong className="font-semibold">{currentState}</strong>.{" "}
          {legal.length === 0
            ? "This is a terminal state — nothing transitions out of it."
            : `Legal next states: ${legal.join(", ")}.`}
        </p>
      </div>

      {legal.length > 0 ? (
        <>
          <div>
            <label className={LABEL} htmlFor="target_state">
              Move to
            </label>
            <select id="target_state" name="target_state" className={FIELD}>
              {legal.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Applying…" : "Apply transition"}
          </Button>
        </>
      ) : null}

      <ResultBanner tone={TRANSITION_TONE[state.status]} message={state.message} />
    </form>
  );
}

// ── Create entity ───────────────────────────────────────────────────────────

export function CreateEntityForm({
  tenantId,
  residencyPolicyId,
  jurisdictionField,
}: {
  tenantId: string;
  residencyPolicyId: string;
  jurisdictionField: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(createEntityAction, IDLE_CREATE_ENTITY);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="entity_code">
            Entity code
          </label>
          <input id="entity_code" name="entity_code" required className={FIELD} placeholder="ACME-UK" />
        </div>
        <div>
          <label className={LABEL} htmlFor="entity_legal_name">
            Legal name
          </label>
          <input
            id="entity_legal_name"
            name="legal_name"
            required
            className={FIELD}
            placeholder="Acme UK Limited"
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="entity_type">
            Entity type
          </label>
          <select id="entity_type" name="entity_type" className={FIELD} defaultValue="SUBSIDIARY">
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="entity_currency">
            Default currency
          </label>
          <select id="entity_currency" name="default_currency_code" className={FIELD} defaultValue="GBP">
            {CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="fiscal_calendar_id">
            Fiscal calendar ID
          </label>
          <input
            id="fiscal_calendar_id"
            name="fiscal_calendar_id"
            className={FIELD}
            placeholder="FY-APR-MAR"
          />
        </div>
        <div className="sm:col-span-2">{jurisdictionField}</div>
      </div>

      {/* The data model forbids an entity without a residency policy, so this
          is prefilled from the tenant's default rather than left to be typed. */}
      <div>
        <label className={LABEL} htmlFor="data_residency_policy_id">
          Data residency policy
        </label>
        <input
          id="data_residency_policy_id"
          name="data_residency_policy_id"
          className={FIELD}
          defaultValue={residencyPolicyId}
          required
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Prefilled with this tenant&apos;s default policy. An entity cannot exist without one.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create entity"}
      </Button>

      <ResultBanner tone={ENTITY_TONE[state.status]} message={state.message}>
        {state.entity ? (
          <div className="mt-2">
            <LabelledId label="Legal entity ID" value={state.entity.legal_entity_id} />
          </div>
        ) : null}
      </ResultBanner>
    </form>
  );
}

// ── Entity status ───────────────────────────────────────────────────────────

/**
 * Entity status transition.
 *
 * The selected entity is tracked in state rather than read on submit, for two
 * reasons that both change what the reader sees: the target list must offer
 * only the transitions legal from *that* entity's current status, and
 * current_status must be sent so a refusal can be explained here instead of
 * arriving as a bare 422 from the service. An entity in a terminal state offers
 * no targets at all and says why.
 */
export function EntityStatusForm({ entities }: { entities: { id: string; label: string; status: string }[] }) {
  const [state, action, pending] = useActionState(transitionEntityStatusAction, IDLE_TRANSITION);
  const [selectedId, setSelectedId] = useState(entities[0]?.id ?? "");

  const selected = entities.find((e) => e.id === selectedId) ?? entities[0];
  const currentStatus = selected?.status ?? "";
  const legal = ENTITY_STATUS_TRANSITIONS[currentStatus] ?? [];

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="current_status" value={currentStatus} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="status_entity_id">
            Entity
          </label>
          <select
            id="status_entity_id"
            name="entity_id"
            className={FIELD}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label} — {e.status}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="new_status">
            New status
          </label>
          <select id="new_status" name="new_status" className={FIELD} disabled={legal.length === 0}>
            {legal.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={PANEL}>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {legal.length === 0
            ? `${currentStatus} is terminal — this entity cannot change status again.`
            : `From ${currentStatus}, legal targets are: ${legal.join(", ")}.`}
        </p>
      </div>

      <Button type="submit" disabled={pending || legal.length === 0}>
        {pending ? "Applying…" : "Apply status change"}
      </Button>

      <ResultBanner tone={TRANSITION_TONE[state.status]} message={state.message} />
    </form>
  );
}

// ── Jurisdiction assignment ─────────────────────────────────────────────────

export function AssignJurisdictionForm({
  entities,
  jurisdictionField,
}: {
  entities: { id: string; label: string }[];
  jurisdictionField: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(assignJurisdictionAction, IDLE_JURISDICTION_WRITE);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="assign_entity_id">
            Entity
          </label>
          <select id="assign_entity_id" name="entity_id" className={FIELD}>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="assignment_type">
            Assignment type
          </label>
          <select id="assignment_type" name="assignment_type" className={FIELD} defaultValue="PRIMARY">
            {JURISDICTION_ASSIGNMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">{jurisdictionField}</div>
        <div>
          <label className={LABEL} htmlFor="effective_from">
            Effective from
          </label>
          <input
            id="effective_from"
            name="effective_from"
            type="date"
            required
            className={FIELD}
            defaultValue={today()}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="source_basis">
            Source basis
          </label>
          <input
            id="source_basis"
            name="source_basis"
            className={FIELD}
            placeholder="Certificate of incorporation"
          />
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Assigning…" : "Assign jurisdiction"}
      </Button>

      <ResultBanner tone={JURISDICTION_TONE[state.status]} message={state.message}>
        {state.assignment ? (
          <div className="mt-2">
            <LabelledId label="Assignment ID" value={state.assignment.assignment_id} />
          </div>
        ) : null}
      </ResultBanner>
    </form>
  );
}

export function EndDateJurisdictionForm() {
  const [state, action, pending] = useActionState(endDateJurisdictionAction, IDLE_JURISDICTION_WRITE);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="assignment_id">
            Assignment ID
          </label>
          <input
            id="assignment_id"
            name="assignment_id"
            required
            className={FIELD}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="end_date">
            End date
          </label>
          <input id="end_date" name="end_date" type="date" required className={FIELD} defaultValue={today()} />
        </div>
      </div>

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "End-dating…" : "End-date assignment"}
      </Button>

      <ResultBanner tone={JURISDICTION_TONE[state.status]} message={state.message} />
    </form>
  );
}

// ── Residency policy ────────────────────────────────────────────────────────

export function CreateResidencyPolicyForm({
  tenantId,
  regions,
  regionsUnavailable,
}: {
  tenantId: string;
  regions: ResidencyRegion[];
  regionsUnavailable: boolean;
}) {
  const [state, action, pending] = useActionState(createResidencyPolicyAction, IDLE_RESIDENCY_POLICY);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="policy_name">
            Policy name
          </label>
          <input id="policy_name" name="policy_name" required className={FIELD} placeholder="UK Strict Residency" />
        </div>
        <div>
          <label className={LABEL} htmlFor="policy_code">
            Policy code
          </label>
          <input id="policy_code" name="policy_code" required className={FIELD} placeholder="UK-STRICT" />
        </div>
        <div>
          <label className={LABEL} htmlFor="residency_mode">
            Residency mode
          </label>
          <select id="residency_mode" name="residency_mode" className={FIELD} defaultValue="STRICT_REGION">
            {RESIDENCY_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="conflict_resolution_mode">
            Conflict resolution
          </label>
          <select
            id="conflict_resolution_mode"
            name="conflict_resolution_mode"
            className={FIELD}
            defaultValue="FAIL_CLOSED"
          >
            {CONFLICT_RESOLUTION_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="residency_region_id">
            Residency region <span className={OPTIONAL}>optional</span>
          </label>
          {regionsUnavailable ? (
            <input
              id="residency_region_id"
              name="residency_region_id"
              className={FIELD}
              placeholder="Region register unreachable — paste a region ID"
            />
          ) : (
            <select id="residency_region_id" name="residency_region_id" className={FIELD} defaultValue="">
              <option value="">No region — hosting region stays unresolved</option>
              {regions.map((r) => (
                <option key={r.residency_region_id} value={r.residency_region_id}>
                  {r.region_code} — {r.region_name}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Regions are IaC-managed and read-only here. A policy with no region leaves the tenant&apos;s hosting
            region unresolved, which the region lookup reports as a 409 rather than an error.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create policy"}
      </Button>

      <ResultBanner tone={POLICY_TONE[state.status]} message={state.message}>
        {state.policy ? (
          <div className="mt-2">
            <LabelledId label="Policy ID" value={state.policy.data_residency_policy_id} />
          </div>
        ) : null}
      </ResultBanner>
    </form>
  );
}
