"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { SCENARIO_TYPES } from "@/lib/api/evidence-manifest";
import { generateManifestAction } from "@/app/admin/evidence-manifests/actions";
import { IDLE_GENERATE, type GenerateManifestState } from "@/app/admin/evidence-manifests/state";

const TONE = {
  generated: "success",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

export function GenerateManifestForm({ legalEntityId }: { legalEntityId: string }) {
  const [state, action, pending] = useActionState<GenerateManifestState, FormData>(
    generateManifestAction,
    IDLE_GENERATE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="legal_entity_id">
            Legal entity <span className={OPTIONAL}>(defaults to your session)</span>
          </label>
          <input
            className={FIELD}
            id="legal_entity_id"
            name="legal_entity_id"
            defaultValue={legalEntityId}
          />
          <p className={HINT}>Manifests are authorized per legal entity, not per tenant.</p>
        </div>

        <div>
          <label className={LABEL} htmlFor="scenario_type">
            Scenario type
          </label>
          <select className={FIELD} id="scenario_type" name="scenario_type" defaultValue="AUDIT" required>
            {SCENARIO_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className={HINT}>Why this manifest exists. The service will not accept one without it.</p>
        </div>

        <div>
          <label className={LABEL} htmlFor="requested_by">
            Requested by <span className={OPTIONAL}>(optional)</span>
          </label>
          <input className={FIELD} id="requested_by" name="requested_by" placeholder="Defaults to your principal" />
        </div>
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Sources — at least one is required
        </legend>

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="governance_decisions_from">
              Governance decisions from <span className={OPTIONAL}>(date)</span>
            </label>
            <input
              className={FIELD}
              id="governance_decisions_from"
              name="governance_decisions_from"
              type="date"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="governance_decisions_to">
              Governance decisions to <span className={OPTIONAL}>(date)</span>
            </label>
            <input className={FIELD} id="governance_decisions_to" name="governance_decisions_to" type="date" />
            <p className={HINT}>Auto-discovers every governance decision for this entity in the date range.</p>
          </div>

          <div>
            <label className={LABEL} htmlFor="governance_decision_ids">
              Explicit governance decision IDs <span className={OPTIONAL}>(optional)</span>
            </label>
            <textarea
              className={FIELD}
              id="governance_decision_ids"
              name="governance_decision_ids"
              rows={2}
              placeholder={"One per line, or comma-separated\ngd-2026-0142"}
            />
          </div>

          <div>
            <label className={LABEL} htmlFor="access_decision_ids">
              Explicit access decision IDs <span className={OPTIONAL}>(optional)</span>
            </label>
            <textarea
              className={FIELD}
              id="access_decision_ids"
              name="access_decision_ids"
              rows={2}
              placeholder={"One per line, or comma-separated\nad-2026-0091"}
            />
            <p className={HINT}>
              authorization-svc has no date-range discovery for these — explicit IDs only.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="workflow_instance_ids">
              Explicit workflow instance IDs <span className={OPTIONAL}>(optional)</span>
            </label>
            <textarea
              className={FIELD}
              id="workflow_instance_ids"
              name="workflow_instance_ids"
              rows={2}
              placeholder={"One per line, or comma-separated\nwf-2026-0037"}
            />
            <p className={HINT}>
              Each instance also pulls its full transition history from workflow-history-svc automatically —
              that is not a separate field.
            </p>
          </div>
        </div>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? "Generating…" : "Generate manifest"}
      </Button>

      <ResultBanner tone={TONE[state.status]} message={state.status === "idle" ? undefined : state.message}>
        {state.status === "generated" && (
          <div className="mt-2 space-y-1 text-xs">
            <CopyableId value={state.manifest.manifest_id} />
            <div>
              Status <strong>{state.manifest.status}</strong> · Checksum{" "}
              <span className="font-mono">{state.manifest.checksum_sha256?.slice(0, 16) ?? "—"}…</span>
            </div>
          </div>
        )}
      </ResultBanner>
    </form>
  );
}
