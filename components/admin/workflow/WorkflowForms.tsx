"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { CopyableId, LookupById, ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import {
  decideWorkflowAction,
  defineWorkflowAction,
  definitionCommandAction,
  lifecycleAction,
  lookupWorkflowAction,
  startWorkflowAction,
  verifyReleaseAction,
} from "@/app/admin/workflows/actions";
import {
  IDLE_DECIDE,
  IDLE_DEFINE,
  IDLE_DEFINITION_COMMAND,
  IDLE_LIFECYCLE,
  IDLE_RELEASE,
  IDLE_START,
  type DecideWorkflowState,
  type DefineWorkflowState,
  type DefinitionCommandState,
  type LifecycleState,
  type ReleaseState,
  type StartWorkflowState,
  type WorkflowRecord,
} from "@/app/admin/workflows/state";
import { INVALIDATION_REASONS, type WorkflowDefinition } from "@/lib/api/workflow";
import { StageBuilder } from "./StageBuilder";
import { WorkflowSummary } from "./WorkflowSummary";

/**
 * Tones. `refused` is amber, not red: nearly every refusal here is a control
 * doing its job (you started it so you cannot approve it; you already decided
 * a stage), and red reads as a fault worth retrying. `replayed` is neutral —
 * the submission resolved to what an earlier one already did.
 */
const TONE = {
  idle: "neutral",
  started: "success",
  decided: "success",
  defined: "success",
  done: "success",
  covered: "success",
  replayed: "neutral",
  "not-covered": "warning",
  refused: "warning",
  error: "error",
} as const;

/** Workflow types are free text in the service. These are suggestions drawn
 *  from what other services already start, not a closed set. */
const COMMON_TYPES = [
  "PURCHASE_APPROVAL",
  "PAYMENT_APPROVAL",
  "JOURNAL_APPROVAL",
  "CONTRACT_APPROVAL",
  "JURISDICTION_RULE_ACTIVATION",
  "POLICY_ACTIVATION",
  "ACCESS_REQUEST",
];

function TypeField({ id, defaultValue }: { id: string; defaultValue?: string }) {
  return (
    <>
      <input
        id={id}
        name="workflow_type"
        list={`${id}-list`}
        required
        defaultValue={defaultValue}
        className={`${FIELD} font-mono text-xs`}
        autoComplete="off"
      />
      <datalist id={`${id}-list`}>
        {COMMON_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}

// ─── Look up ─────────────────────────────────────────────────────────────────

export function WorkflowLookup() {
  return (
    <LookupById<WorkflowRecord>
      action={lookupWorkflowAction}
      inputName="workflow_instance_id"
      label="Workflow ID"
      placeholder="Paste a workflow instance ID"
      hint="Readable by its initiator, the approver of its current stage, or anyone with WORKFLOW_READ on its legal entity."
      buttonLabel="View"
      renderRecord={(record) => <WorkflowSummary record={record} />}
    />
  );
}

// ─── Start ───────────────────────────────────────────────────────────────────

export function StartWorkflowForm({
  legalEntityId,
  idempotencyKey,
  definitions,
}: {
  legalEntityId: string;
  /** Minted by the server component per render, so a retry of the same
   *  submission replays and every refresh() after a write mints a new one. */
  idempotencyKey: string;
  definitions: WorkflowDefinition[];
}) {
  const [state, action, pending] = useActionState<StartWorkflowState, FormData>(startWorkflowAction, IDLE_START);
  const [definitionId, setDefinitionId] = useState("");
  const active = definitions.filter((d) => d.is_active);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="start_workflow_type">
            Workflow type
          </label>
          <TypeField id="start_workflow_type" />
        </div>
        <div>
          <label className={LABEL} htmlFor="start_legal_entity_id">
            Legal entity
          </label>
          <input
            id="start_legal_entity_id"
            name="legal_entity_id"
            defaultValue={legalEntityId}
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
          <p className={HINT}>Must exist in your tenant — the service checks the registry and refuses otherwise.</p>
        </div>
        <div>
          <label className={LABEL} htmlFor="start_subject_type">
            What is being approved <span className={OPTIONAL}>(type)</span>
          </label>
          <input id="start_subject_type" name="subject_type" className={FIELD} placeholder="e.g. PURCHASE_ORDER" autoComplete="off" />
        </div>
        <div>
          <label className={LABEL} htmlFor="start_subject_id">
            What is being approved <span className={OPTIONAL}>(ID)</span>
          </label>
          <input id="start_subject_id" name="subject_id" className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
        <div>
          <label className={LABEL} htmlFor="start_escalation_target">
            Escalate to <span className={OPTIONAL}>(optional principal ID)</span>
          </label>
          <input id="start_escalation_target" name="escalation_target" className={`${FIELD} font-mono text-xs`} autoComplete="off" />
          <p className={HINT}>Who a stage goes to when its deadline passes. Not you.</p>
        </div>
        <div>
          <label className={LABEL} htmlFor="start_definition">
            Route <span className={OPTIONAL}>(optional)</span>
          </label>
          <select
            id="start_definition"
            name="workflow_definition_id"
            className={FIELD}
            value={definitionId}
            onChange={(e) => setDefinitionId(e.target.value)}
          >
            <option value="">Define the stages below</option>
            {active.map((d) => (
              <option key={d.workflow_definition_id} value={d.workflow_definition_id}>
                {d.name || d.workflow_type} — v{d.version}
              </option>
            ))}
          </select>
          <p className={HINT}>A definition fixes the route and its type must match the type above.</p>
        </div>
      </div>

      {definitionId === "" && (
        <div>
          <p className={LABEL}>Stages</p>
          <StageBuilder idPrefix="start-stage" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" loading={pending}>
          {pending ? "Starting…" : "Start workflow"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Every named approver is checked for WORKFLOW_APPROVE before anything is written.
        </p>
      </div>

      <ResultBanner tone={TONE[state.status]} message={"message" in state ? state.message : undefined}>
        {"workflow" in state && (
          <p className="text-xs">
            Workflow ID: <CopyableId value={state.workflow.workflow_instance_id} />
          </p>
        )}
      </ResultBanner>
    </form>
  );
}

// ─── Decide ──────────────────────────────────────────────────────────────────

export function DecideWorkflowForm({ idempotencyKey }: { idempotencyKey: string }) {
  const [state, action, pending] = useActionState<DecideWorkflowState, FormData>(decideWorkflowAction, IDLE_DECIDE);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="decide_workflow_instance_id">
            Workflow ID
          </label>
          <input id="decide_workflow_instance_id" name="workflow_instance_id" required className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
        <fieldset>
          <legend className={LABEL}>Decision</legend>
          <div className="flex gap-4 text-sm text-slate-700 dark:text-slate-300">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="decision" value="APPROVE" defaultChecked /> Approve
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="decision" value="REJECT" /> Reject
            </label>
          </div>
        </fieldset>
        <div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" name="quorum" /> This is a vote on a quorum stage
          </label>
          <p className={HINT}>Quorum stages take one vote per eligible approver on a separate route.</p>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="decide_rationale">
            Reason <span className={OPTIONAL}>(required to reject)</span>
          </label>
          <textarea id="decide_rationale" name="rationale" rows={2} className={FIELD} />
        </div>
      </div>
      <Button type="submit" size="sm" loading={pending}>
        {pending ? "Recording…" : "Record decision"}
      </Button>
      <ResultBanner tone={TONE[state.status]} message={"message" in state ? state.message : undefined}>
        {"workflow" in state && state.workflow.decision_id && (
          <p className="text-xs">
            Governance record: <CopyableId value={state.workflow.decision_id} />
          </p>
        )}
      </ResultBanner>
    </form>
  );
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

const COMMANDS = [
  { value: "escalate", label: "Escalate", hint: "Marks the workflow escalated. Its current approver can still decide." },
  { value: "escalate-to", label: "Escalate to a named owner", hint: "Hands the current stage to somebody else. Not the initiator." },
  { value: "cancel", label: "Cancel", hint: "Ends the workflow. Participants need WORKFLOW_CANCEL, anyone else WORKFLOW_ADMINISTER." },
  { value: "request-changes", label: "Request changes", hint: "Reopens a pending or rejected workflow for a new review cycle. WORKFLOW_ADMINISTER." },
  { value: "invalidate", label: "Invalidate", hint: "The subject changed after approval, so the approval no longer covers it. WORKFLOW_INVALIDATE." },
] as const;

export function LifecycleForm({ idempotencyKey }: { idempotencyKey: string }) {
  const [state, action, pending] = useActionState<LifecycleState, FormData>(lifecycleAction, IDLE_LIFECYCLE);
  const [command, setCommand] = useState<(typeof COMMANDS)[number]["value"]>("escalate");
  const current = COMMANDS.find((c) => c.value === command);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="life_workflow_instance_id">
            Workflow ID
          </label>
          <input id="life_workflow_instance_id" name="workflow_instance_id" required className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
        <div>
          <label className={LABEL} htmlFor="life_command">
            Action
          </label>
          <select
            id="life_command"
            name="command"
            className={FIELD}
            value={command}
            onChange={(e) => setCommand(e.target.value as typeof command)}
          >
            {COMMANDS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {current && <p className={HINT}>{current.hint}</p>}
        </div>

        {command === "escalate-to" && (
          <>
            <div>
              <label className={LABEL} htmlFor="life_target">
                Escalate to (principal ID)
              </label>
              <input id="life_target" name="escalation_target" className={`${FIELD} font-mono text-xs`} autoComplete="off" />
            </div>
            <div>
              <label className={LABEL} htmlFor="life_reason">
                Reason code
              </label>
              <input id="life_reason" name="reason_code" className={`${FIELD} font-mono text-xs`} placeholder="e.g. APPROVER_UNAVAILABLE" autoComplete="off" />
            </div>
          </>
        )}

        {command === "invalidate" && (
          <>
            <div>
              <label className={LABEL} htmlFor="life_invalidate_reason">
                Reason
              </label>
              <select id="life_invalidate_reason" name="reason_code" className={FIELD} defaultValue="">
                <option value="" disabled>
                  Choose a governed reason
                </option>
                {INVALIDATION_REASONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label} ({r.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="life_version">
                Version you last read
              </label>
              <input id="life_version" name="expected_version" inputMode="numeric" className={FIELD} autoComplete="off" />
              <p className={HINT}>Shown when you view the workflow above. A stale version is refused.</p>
            </div>
          </>
        )}

        {command !== "escalate" && command !== "cancel" && (
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="life_narrative">
              {command === "request-changes" ? "What needs to change" : "Note"} <span className={OPTIONAL}>(optional)</span>
            </label>
            <textarea id="life_narrative" name="narrative" rows={2} className={FIELD} />
          </div>
        )}
      </div>
      <Button type="submit" size="sm" variant={command === "cancel" || command === "invalidate" ? "secondary" : "primary"} loading={pending}>
        {pending ? "Applying…" : current?.label ?? "Apply"}
      </Button>
      <ResultBanner tone={TONE[state.status]} message={"message" in state ? state.message : undefined} />
    </form>
  );
}

// ─── Verify release ──────────────────────────────────────────────────────────

export function VerifyReleaseForm() {
  const [state, action, pending] = useActionState<ReleaseState, FormData>(verifyReleaseAction, IDLE_RELEASE);
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="rel_workflow_instance_id">
            Workflow ID
          </label>
          <input id="rel_workflow_instance_id" name="workflow_instance_id" required className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
        <div>
          <label className={LABEL} htmlFor="rel_fingerprint">
            Subject fingerprint now
          </label>
          <input id="rel_fingerprint" name="subject_fingerprint" required placeholder="sha256:…" className={`${FIELD} font-mono text-xs`} autoComplete="off" />
        </div>
        <div>
          <label className={LABEL} htmlFor="rel_version">
            Subject version now <span className={OPTIONAL}>(optional)</span>
          </label>
          <input id="rel_version" name="subject_version" inputMode="numeric" className={FIELD} autoComplete="off" />
        </div>
      </div>
      <Button type="submit" size="sm" variant="secondary" loading={pending}>
        {pending ? "Checking…" : "Check"}
      </Button>
      <ResultBanner tone={TONE[state.status]} message={"message" in state ? state.message : undefined} />
    </form>
  );
}

// ─── Definitions ─────────────────────────────────────────────────────────────

export function DefineWorkflowForm() {
  const [state, action, pending] = useActionState<DefineWorkflowState, FormData>(defineWorkflowAction, IDLE_DEFINE);
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="def_workflow_type">
            Workflow type
          </label>
          <TypeField id="def_workflow_type" />
        </div>
        <div>
          <label className={LABEL} htmlFor="def_version">
            Version
          </label>
          <input id="def_version" name="version" type="number" min={1} defaultValue={1} className={FIELD} />
        </div>
        <div>
          <label className={LABEL} htmlFor="def_name">
            Name <span className={OPTIONAL}>(optional)</span>
          </label>
          <input id="def_name" name="name" className={FIELD} autoComplete="off" />
        </div>
        <div className="sm:col-span-3">
          <label className={LABEL} htmlFor="def_description">
            Description <span className={OPTIONAL}>(optional)</span>
          </label>
          <input id="def_description" name="description" className={FIELD} autoComplete="off" />
        </div>
      </div>
      <div>
        <p className={LABEL}>Route</p>
        <StageBuilder idPrefix="def-stage" />
      </div>
      <Button type="submit" size="sm" loading={pending}>
        {pending ? "Registering…" : "Register definition"}
      </Button>
      <ResultBanner tone={TONE[state.status]} message={"message" in state ? state.message : undefined}>
        {"definition" in state && (
          <p className="text-xs">
            Definition ID: <CopyableId value={state.definition.workflow_definition_id} />
          </p>
        )}
      </ResultBanner>
    </form>
  );
}

export function DefinitionCommandForm({ definitions }: { definitions: WorkflowDefinition[] }) {
  const [state, action, pending] = useActionState<DefinitionCommandState, FormData>(
    definitionCommandAction,
    IDLE_DEFINITION_COMMAND,
  );
  const [command, setCommand] = useState("suspend");
  const label = (d: WorkflowDefinition) =>
    `${d.name || d.workflow_type} — v${d.version} (${d.is_active ? "active" : "inactive"})`;

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="defcmd_id">
            Definition
          </label>
          <select id="defcmd_id" name="workflow_definition_id" className={FIELD} defaultValue="">
            <option value="" disabled>
              Choose
            </option>
            {definitions.map((d) => (
              <option key={d.workflow_definition_id} value={d.workflow_definition_id}>
                {label(d)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="defcmd_command">
            Action
          </label>
          <select id="defcmd_command" name="command" className={FIELD} value={command} onChange={(e) => setCommand(e.target.value)}>
            <option value="activate">Activate</option>
            <option value="suspend">Suspend</option>
            <option value="retire">Retire</option>
            <option value="supersede">Supersede with another version</option>
          </select>
        </div>
        {command === "supersede" && (
          <div>
            <label className={LABEL} htmlFor="defcmd_new">
              Replaced by
            </label>
            <select id="defcmd_new" name="new_definition_id" className={FIELD} defaultValue="">
              <option value="" disabled>
                Choose
              </option>
              {definitions.map((d) => (
                <option key={d.workflow_definition_id} value={d.workflow_definition_id}>
                  {label(d)}
                </option>
              ))}
            </select>
            <p className={HINT}>Must be the same workflow type. The one being replaced must be active.</p>
          </div>
        )}
      </div>
      <Button type="submit" size="sm" variant="secondary" loading={pending}>
        {pending ? "Applying…" : "Apply"}
      </Button>
      <ResultBanner tone={TONE[state.status]} message={"message" in state ? state.message : undefined} />
    </form>
  );
}
