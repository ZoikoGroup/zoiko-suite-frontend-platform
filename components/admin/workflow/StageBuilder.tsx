"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";

type Draft = {
  key: number;
  stage_type: "SINGLE" | "QUORUM" | "ROLE";
  approver_principal_id: string;
  quorum_text: string;
  required_approvals: string;
  approver_role: string;
  due_at_hours: string;
};

function blank(key: number): Draft {
  return {
    key,
    stage_type: "SINGLE",
    approver_principal_id: "",
    quorum_text: "",
    required_approvals: "1",
    approver_role: "",
    due_at_hours: "",
  };
}

/**
 * An approval route, one stage per row, submitted as a hidden `stages` field.
 *
 * Built from fields rather than typed as JSON because workflow-svc stores a
 * definition's route without parsing it — a malformed one is accepted and only
 * fails when somebody later starts a workflow from it. The server action
 * re-checks everything here; this only keeps the shape right.
 */
export function StageBuilder({ idPrefix, minStages = 1 }: { idPrefix: string; minStages?: number }) {
  // Keys end up in DOM ids, so they are counted per instance from 0 — a
  // module-level counter would number them differently on the server and in
  // the browser and fail hydration.
  const [stages, setStages] = useState<Draft[]>(() =>
    Array.from({ length: minStages }, (_, i) => blank(i)),
  );
  const [nextKey, setNextKey] = useState(minStages);

  const update = (key: number, patch: Partial<Draft>) =>
    setStages((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const serialised = JSON.stringify(
    stages.map((s) => ({
      stage_type: s.stage_type,
      approver_principal_id: s.stage_type === "SINGLE" ? s.approver_principal_id.trim() : undefined,
      quorum_approvers:
        s.stage_type === "QUORUM"
          ? s.quorum_text.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean)
          : undefined,
      required_approvals: s.stage_type === "QUORUM" ? Number(s.required_approvals) : undefined,
      approver_role: s.stage_type === "ROLE" ? s.approver_role.trim() : undefined,
      due_at_hours: s.due_at_hours ? Number(s.due_at_hours) : undefined,
    })),
  );

  return (
    <div className="space-y-3">
      <input type="hidden" name="stages" value={stages.length ? serialised : ""} />

      {stages.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          No stages. The route will be taken from the definition.
        </p>
      )}

      {stages.map((stage, index) => {
        const id = `${idPrefix}-${stage.key}`;
        return (
          <fieldset
            key={stage.key}
            className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
          >
            <legend className="px-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Stage {index + 1}
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className={LABEL} htmlFor={`${id}-type`}>
                  Who decides
                </label>
                <select
                  id={`${id}-type`}
                  className={FIELD}
                  value={stage.stage_type}
                  onChange={(e) => update(stage.key, { stage_type: e.target.value as Draft["stage_type"] })}
                >
                  <option value="SINGLE">One named person</option>
                  <option value="QUORUM">Some of a named group</option>
                  <option value="ROLE">Anyone with a role</option>
                </select>
              </div>

              {stage.stage_type === "SINGLE" && (
                <div className="sm:col-span-2">
                  <label className={LABEL} htmlFor={`${id}-approver`}>
                    Approver principal ID
                  </label>
                  <input
                    id={`${id}-approver`}
                    className={`${FIELD} font-mono text-xs`}
                    value={stage.approver_principal_id}
                    onChange={(e) => update(stage.key, { approver_principal_id: e.target.value })}
                    autoComplete="off"
                  />
                </div>
              )}

              {stage.stage_type === "QUORUM" && (
                <>
                  <div className="sm:col-span-2">
                    <label className={LABEL} htmlFor={`${id}-pool`}>
                      Approver pool <span className={OPTIONAL}>(principal IDs, comma-separated)</span>
                    </label>
                    <input
                      id={`${id}-pool`}
                      className={`${FIELD} font-mono text-xs`}
                      value={stage.quorum_text}
                      onChange={(e) => update(stage.key, { quorum_text: e.target.value })}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor={`${id}-needed`}>
                      Approvals needed
                    </label>
                    <input
                      id={`${id}-needed`}
                      type="number"
                      min={1}
                      className={FIELD}
                      value={stage.required_approvals}
                      onChange={(e) => update(stage.key, { required_approvals: e.target.value })}
                    />
                  </div>
                </>
              )}

              {stage.stage_type === "ROLE" && (
                <div className="sm:col-span-2">
                  <label className={LABEL} htmlFor={`${id}-role`}>
                    Role code
                  </label>
                  <input
                    id={`${id}-role`}
                    className={`${FIELD} font-mono text-xs`}
                    value={stage.approver_role}
                    onChange={(e) => update(stage.key, { approver_role: e.target.value })}
                    placeholder="e.g. FINANCE_APPROVER"
                    autoComplete="off"
                  />
                </div>
              )}

              <div>
                <label className={LABEL} htmlFor={`${id}-due`}>
                  Deadline <span className={OPTIONAL}>(hours)</span>
                </label>
                <input
                  id={`${id}-due`}
                  type="number"
                  min={1}
                  className={FIELD}
                  value={stage.due_at_hours}
                  onChange={(e) => update(stage.key, { due_at_hours: e.target.value })}
                />
              </div>
            </div>

            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setStages((all) => all.filter((s) => s.key !== stage.key))}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600 dark:text-slate-400"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Remove stage
              </button>
            </div>
          </fieldset>
        );
      })}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setStages((all) => [...all, blank(nextKey)]);
            setNextKey((k) => k + 1);
          }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add stage
        </Button>
        <p className={HINT}>
          Stages run in order. The same person may not appear in two stages, and the person starting
          the workflow may not appear in any.
        </p>
      </div>
    </div>
  );
}
