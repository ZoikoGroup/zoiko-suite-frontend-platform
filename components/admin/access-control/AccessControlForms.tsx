"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import {
  createBundleAction,
  createRoleAction,
  updateRoleAction,
} from "@/app/admin/access-control/actions";
import {
  IDLE_CREATE_BUNDLE,
  IDLE_CREATE_ROLE,
  IDLE_UPDATE_ROLE,
  type CreateBundleState,
  type CreateRoleState,
  type UpdateRoleState,
} from "@/app/admin/access-control/state";
import type { RoleDefinition } from "@/lib/api/access-control";

/**
 * Tones.
 *
 * `replayed` is neutral, not green: the service answered 200 because this
 * correlation id had already written the record. Colouring it as a fresh success
 * would tell an operator they had just defined a role that was defined days ago.
 *
 * `refused` is amber, not red — a 403 here is the control working, and red
 * invites a retry that will be refused identically.
 *
 * `notEnforced` is RED, and it is the only 503 in this console painted that way.
 * Everywhere else an unreachable service means "nothing happened, try again".
 * Here it means the retirement did not happen AND the role is still granting
 * everything it granted before. That is a live governance state, not a transient
 * blip, so it gets the strongest tone available.
 */
const ROLE_TONE = {
  created: "success",
  replayed: "neutral",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

const UPDATE_TONE = {
  updated: "success",
  notEnforced: "error",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

const BUNDLE_TONE = {
  created: "success",
  replayed: "neutral",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

/** Suggestions, not a closed set. Action codes are free-text in
 *  authorization-svc on purpose — a new action arrives by grant, not by
 *  redeploying this console. */
const COMMON_ACTIONS = [
  "PO_ISSUE",
  "PO_AMEND",
  "PO_CLOSE",
  "PAYMENT_APPROVE",
  "INVOICE_APPROVE",
  "CONTRACT_SIGN",
  "RESOLUTION_PASS",
  "ROLE_MANAGE",
  "DELEGATION_CREATE",
] as const;

// ─── Define a role ───────────────────────────────────────────────────────────

export function DefineRoleForm({
  legalEntityId,
  correlationId,
}: {
  legalEntityId: string;
  /** Minted by the server component per render, not here.
   *
   *  crypto.randomUUID() during render differs between the server and client
   *  passes, so React hydrates against markup containing a different id and
   *  tears the tree down. Generating it in an effect instead trips
   *  react-hooks/set-state-in-effect, correctly — this was never client state.
   *
   *  As a prop it is also right for idempotency: fixed while the form is on
   *  screen, so retrying the SAME submission replays instead of defining a
   *  second role, and every write ends in refresh() which mints a fresh one. */
  correlationId: string;
}) {
  const [state, action, pending] = useActionState<CreateRoleState, FormData>(
    createRoleAction,
    IDLE_CREATE_ROLE,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="correlation_id" value={correlationId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="role_code">
            Role code
          </label>
          <input className={FIELD} id="role_code" name="role_code" placeholder="FINANCE_APPROVER" required />
          <p className={HINT}>
            Upper-cased and underscored for you. This is the code authorization-svc stores, and it
            is unique per tenant.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="role_name">
            Display name
          </label>
          <input className={FIELD} id="role_name" name="role_name" placeholder="Finance Approver" required />
        </div>
        <div>
          <label className={LABEL} htmlFor="role_scope_type">
            Scope
          </label>
          <select className={FIELD} id="role_scope_type" name="role_scope_type" defaultValue="LEGAL_ENTITY">
            <option value="LEGAL_ENTITY">LEGAL_ENTITY</option>
            <option value="TENANT">TENANT</option>
          </select>
          <p className={HINT}>
            Scoping happens when the role is assigned, not when it is defined — this records which
            kind of assignment the role is for.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="legal_entity_id">
            Legal entity <span className={OPTIONAL}>(authorizing scope)</span>
          </label>
          <input
            className={FIELD}
            id="legal_entity_id"
            name="legal_entity_id"
            defaultValue={legalEntityId}
          />
          <p className={HINT}>
            This write is authorized against this entity. A 403 means you hold no ROLE_MANAGE grant
            here specifically, not platform-wide.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Defining…" : "Define role"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Provisioned into authorization-svc before it is recorded here — if that call fails,
          nothing is written.
        </p>
      </div>

      {state.status !== "idle" && (
        <ResultBanner tone={ROLE_TONE[state.status]} message={state.message}>
          {(state.status === "created" || state.status === "replayed") && (
            <CopyableId value={state.role.role_definition_id} />
          )}
        </ResultBanner>
      )}
    </form>
  );
}

// ─── Retire, reactivate, rename ──────────────────────────────────────────────

export function UpdateRoleForm({
  roles,
  legalEntityId,
}: {
  roles: RoleDefinition[];
  legalEntityId: string;
}) {
  const [state, action, pending] = useActionState<UpdateRoleState, FormData>(
    updateRoleAction,
    IDLE_UPDATE_ROLE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="role_definition_id">
            Role
          </label>
          <select className={FIELD} id="role_definition_id" name="role_definition_id" required>
            <option value="">Choose a role…</option>
            {roles.map((r) => (
              <option key={r.role_definition_id} value={r.role_definition_id}>
                {r.role_code} — {r.status}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="status">
            Status <span className={OPTIONAL}>(leave blank to rename only)</span>
          </label>
          <select className={FIELD} id="status" name="status" defaultValue="">
            <option value="">— unchanged —</option>
            <option value="RETIRED">RETIRED</option>
            <option value="ACTIVE">ACTIVE</option>
          </select>
          <p className={HINT}>
            Retiring clears the role&apos;s active flag in authorization-svc, so it immediately grants
            nothing to anyone holding it. Assignments are kept, so reactivating restores exactly the
            access this suspended.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="update_role_name">
            New display name <span className={OPTIONAL}>(optional)</span>
          </label>
          <input className={FIELD} id="update_role_name" name="role_name" placeholder="Leave blank to keep" />
          <p className={HINT}>A rename changes nothing about what the role grants.</p>
        </div>
      </div>

      <input type="hidden" name="legal_entity_id" value={legalEntityId} />

      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "Applying…" : "Apply change"}
      </Button>

      {state.status !== "idle" && (
        <ResultBanner tone={UPDATE_TONE[state.status]} message={state.message}>
          {state.status === "updated" && <CopyableId value={state.role.role_definition_id} />}
        </ResultBanner>
      )}
    </form>
  );
}

// ─── Attach a permission bundle ──────────────────────────────────────────────

export function AttachBundleForm({
  roles,
  legalEntityId,
  correlationId,
}: {
  roles: RoleDefinition[];
  legalEntityId: string;
  correlationId: string;
}) {
  const [state, action, pending] = useActionState<CreateBundleState, FormData>(
    createBundleAction,
    IDLE_CREATE_BUNDLE,
  );


  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="correlation_id" value={correlationId} />
      <input type="hidden" name="legal_entity_id" value={legalEntityId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="bundle_role_definition_id">
            Role
          </label>
          <select
            className={FIELD}
            id="bundle_role_definition_id"
            name="role_definition_id"
            required
          >
            <option value="">Choose a role…</option>
            {roles.map((r) => (
              <option key={r.role_definition_id} value={r.role_definition_id}>
                {r.role_code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="bundle_code">
            Bundle code
          </label>
          <input className={FIELD} id="bundle_code" name="bundle_code" placeholder="APPROVE_PAYMENTS" required />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="permitted_actions">
          Permitted actions
        </label>
        <textarea
          className={FIELD}
          id="permitted_actions"
          name="permitted_actions"
          rows={3}
          placeholder="PO_ISSUE, PO_CLOSE"
          required
        />
        {/* Listed as text rather than through a <datalist>: a datalist only
            binds to <input>, and a single-line input is the wrong control for
            what is often a dozen action codes. */}
        <p className={HINT}>
          Comma- or newline-separated; upper-cased for you and blanks dropped. These must match the
          action codes the enforcing services check — a typo is a grant that matches nothing rather
          than an error. Actions the platform already authorizes include{" "}
          <span className="font-mono">{COMMON_ACTIONS.join(", ")}</span>.
        </p>
      </div>

      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "Attaching…" : "Attach bundle"}
      </Button>

      {state.status !== "idle" && (
        <ResultBanner tone={BUNDLE_TONE[state.status]} message={state.message}>
          {(state.status === "created" || state.status === "replayed") && (
            <CopyableId value={state.bundle.bundle_id} />
          )}
        </ResultBanner>
      )}
    </form>
  );
}
