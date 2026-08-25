"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL, PANEL } from "@/components/admin/shared/form";
import {
  BILLING_CLASSIFICATIONS,
  BILLING_SOURCES,
  HIERARCHY_RELATIONSHIP_TYPES,
  isBillableClassification,
} from "@/lib/api/tenants";
import {
  createHierarchyAction,
  createWorkspaceAction,
  endDateHierarchyAction,
  updateEntityAction,
} from "@/app/admin/tenants/actions";
import {
  CURRENCY_CODES,
  IDLE_HIERARCHY_WRITE,
  IDLE_UPDATE_ENTITY,
  IDLE_WORKSPACE,
} from "@/app/admin/tenants/state";
import { LabelledId } from "./LabelledId";

/**
 * Tone maps.
 *
 * `tenant-context` is red in all three: it is a real refusal, and unlike
 * `unvalidated` no retry will clear it — an operator has to change the tenant's
 * state. `invalid-classification` and `cycle` are amber because the reader can
 * fix both from the form in front of them.
 */
const WORKSPACE_TONE = {
  created: "success",
  "invalid-classification": "warning",
  conflict: "warning",
  unauthenticated: "warning",
  unauthorized: "error",
  "tenant-context": "error",
  error: "error",
  idle: "neutral",
} as const;

const UPDATE_ENTITY_TONE = {
  updated: "success",
  unchanged: "neutral",
  unauthenticated: "warning",
  unauthorized: "error",
  "tenant-context": "error",
  error: "error",
  idle: "neutral",
} as const;

const HIERARCHY_TONE = {
  created: "success",
  "end-dated": "success",
  cycle: "warning",
  conflict: "warning",
  unauthenticated: "warning",
  unauthorized: "error",
  "tenant-context": "error",
  error: "error",
  idle: "neutral",
} as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type EntityOption = { id: string; label: string; status: string };

// ── Update an entity ────────────────────────────────────────────────────────

/**
 * PATCH an entity's descriptive fields.
 *
 * The three fields here are the only ones the registry's PATCH accepts. Type,
 * jurisdiction, fiscal calendar, residency policy and entity_code are fixed at
 * creation because posted transactions reference them, and status moves through
 * its own transition endpoint — so this form deliberately cannot offer them.
 *
 * Blank means "leave alone", which is why the trading name needs an explicit
 * three-way choice: a text box alone cannot express the difference between
 * "don't touch it" and "remove it".
 */
export function UpdateEntityForm({ entities }: { entities: EntityOption[] }) {
  const [state, action, pending] = useActionState(updateEntityAction, IDLE_UPDATE_ENTITY);
  const [tradingIntent, setTradingIntent] = useState<"unchanged" | "set" | "clear">("unchanged");

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="update_entity_id">
            Entity
          </label>
          <select id="update_entity_id" name="entity_id" className={FIELD}>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="update_legal_name">
            Legal name <span className={OPTIONAL}>leave blank to keep</span>
          </label>
          <input id="update_legal_name" name="legal_name" className={FIELD} placeholder="Acme Holdings Ltd" />
        </div>
        <div>
          <label className={LABEL} htmlFor="trading_name_intent">
            Trading name
          </label>
          <select
            id="trading_name_intent"
            name="trading_name_intent"
            className={FIELD}
            value={tradingIntent}
            onChange={(e) => setTradingIntent(e.target.value as "unchanged" | "set" | "clear")}
          >
            <option value="unchanged">Leave unchanged</option>
            <option value="set">Set to…</option>
            <option value="clear">Clear it</option>
          </select>
          {tradingIntent === "set" ? (
            <input
              name="trading_name"
              className={`${FIELD} mt-2`}
              placeholder="Acme"
              aria-label="New trading name"
            />
          ) : null}
          <p className={HINT}>
            Clearing sends an explicit null. Leaving it unchanged omits the field, so a value another
            operator set in the meantime is not overwritten.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="update_currency">
            Default currency <span className={OPTIONAL}>leave blank to keep</span>
          </label>
          <select id="update_currency" name="default_currency_code" className={FIELD} defaultValue="">
            <option value="">Leave unchanged</option>
            {CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Updating…" : "Update entity"}
      </Button>

      <ResultBanner tone={UPDATE_ENTITY_TONE[state.status]} message={state.message}>
        {state.entity ? (
          <div className="mt-2 space-y-1.5">
            <LabelledId label="Legal entity ID" value={state.entity.legal_entity_id} />
          </div>
        ) : null}
      </ResultBanner>
    </form>
  );
}

// ── Create a workspace ──────────────────────────────────────────────────────

export function CreateWorkspaceForm({
  tenantId,
  entities,
}: {
  tenantId: string;
  entities: EntityOption[];
}) {
  const [state, action, pending] = useActionState(createWorkspaceAction, IDLE_WORKSPACE);
  const [classification, setClassification] = useState<string>("COMMERCIAL_STANDALONE");

  const billable = isBillableClassification(classification);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="workspace_name">
            Name
          </label>
          <input id="workspace_name" name="name" required className={FIELD} placeholder="Group Finance" />
        </div>
        <div>
          <label className={LABEL} htmlFor="business_unit">
            Business unit <span className={OPTIONAL}>optional</span>
          </label>
          <input id="business_unit" name="business_unit" className={FIELD} placeholder="Treasury" />
        </div>
        <div>
          <label className={LABEL} htmlFor="billing_classification">
            Billing classification
          </label>
          <select
            id="billing_classification"
            name="billing_classification"
            className={FIELD}
            value={classification}
            onChange={(e) => setClassification(e.target.value)}
          >
            {BILLING_CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="billing_source">
            Billing source
          </label>
          <select id="billing_source" name="billing_source" className={FIELD} defaultValue="NONE">
            {BILLING_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className={HINT}>Where the commercial authority comes from. NONE for non-billable classes.</p>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="workspace_entity_id">
            Legal entity scope <span className={OPTIONAL}>optional</span>
          </label>
          <select id="workspace_entity_id" name="legal_entity_id" className={FIELD} defaultValue="">
            <option value="">Tenant-wide — no entity scope</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <p className={HINT}>
            A workspace may legitimately have no entity — it hangs from the tenant. Left blank, the field is
            omitted rather than sent empty.
          </p>
        </div>
      </div>

      {/* Stated before submission, not after. Whether a workspace can produce a
          live charge is the one consequence of this form that money depends on. */}
      <div className={PANEL}>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {billable
            ? `${classification} is a commercial class — this workspace can produce live Zoiko charges.`
            : `${classification} is a non-billable class — this workspace must never produce a live charge, regardless of what entitlement says.`}
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>

      <ResultBanner tone={WORKSPACE_TONE[state.status]} message={state.message}>
        {state.workspace ? (
          <div className="mt-2 space-y-1.5">
            <LabelledId label="Workspace ID" value={state.workspace.workspace_id} />
          </div>
        ) : null}
      </ResultBanner>
    </form>
  );
}

// ── Entity hierarchy ────────────────────────────────────────────────────────

export function CreateHierarchyForm({
  tenantId,
  entities,
}: {
  tenantId: string;
  entities: EntityOption[];
}) {
  const [state, action, pending] = useActionState(createHierarchyAction, IDLE_HIERARCHY_WRITE);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="parent_legal_entity_id">
            Parent entity
          </label>
          <select id="parent_legal_entity_id" name="parent_legal_entity_id" className={FIELD}>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="child_legal_entity_id">
            Child entity
          </label>
          <select
            id="child_legal_entity_id"
            name="child_legal_entity_id"
            className={FIELD}
            defaultValue={entities[1]?.id ?? entities[0]?.id ?? ""}
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="relationship_type">
            Relationship type
          </label>
          <select id="relationship_type" name="relationship_type" className={FIELD} defaultValue="OWNERSHIP">
            {HIERARCHY_RELATIONSHIP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <p className={HINT}>
            The same pair can hold several types at once — an ownership edge and a reporting edge are
            different facts about the same two entities.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="hierarchy_effective_from">
            Effective from
          </label>
          <input
            id="hierarchy_effective_from"
            name="effective_from"
            type="date"
            required
            className={FIELD}
            defaultValue={today()}
          />
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create relationship"}
      </Button>

      <ResultBanner tone={HIERARCHY_TONE[state.status]} message={state.message}>
        {state.hierarchy ? (
          <div className="mt-2 space-y-1.5">
            <LabelledId label="Hierarchy ID" value={state.hierarchy.hierarchy_id} />
          </div>
        ) : null}
      </ResultBanner>
    </form>
  );
}

export function EndDateHierarchyForm() {
  const [state, action, pending] = useActionState(endDateHierarchyAction, IDLE_HIERARCHY_WRITE);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="hierarchy_id">
            Hierarchy ID
          </label>
          <input
            id="hierarchy_id"
            name="hierarchy_id"
            required
            className={FIELD}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
          <p className={HINT}>Copy it from the relationship table above.</p>
        </div>
        <div>
          <label className={LABEL} htmlFor="hierarchy_end_date">
            End date
          </label>
          <input
            id="hierarchy_end_date"
            name="end_date"
            type="date"
            required
            className={FIELD}
            defaultValue={today()}
          />
        </div>
      </div>

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "End-dating…" : "End-date relationship"}
      </Button>

      <ResultBanner tone={HIERARCHY_TONE[state.status]} message={state.message} />
    </form>
  );
}
