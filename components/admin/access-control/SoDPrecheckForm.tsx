"use client";

import { useActionState } from "react";
import { ShieldQuestion } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL, PANEL } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { precheckSoDAction } from "@/app/admin/access-control/audit-actions";
import {
  IDLE_SOD_PRECHECK,
  type SoDPrecheckState,
} from "@/app/admin/access-control/state";

/**
 * "Would granting this break separation of duties?" — asked before granting.
 *
 * ── THE QUESTION THE CHECK ABOVE CANNOT ANSWER ──────────────────────────────
 *
 * Separation of duties is breached by a COMBINATION. The evaluation endpoint
 * answers what a person currently holds, so a breach only becomes visible once
 * the combination already exists — which meant the only way to discover that a
 * role must not go to somebody was to give it to them and then watch every use
 * of it be refused.
 *
 * That is the control working and the workflow failing. The operator is left
 * holding a live grant that confers nothing, and no explanation until somebody
 * goes and reads a decision log. This asks it the other way round: given what
 * this person already holds, would these actions be grantable at all.
 *
 * ── IT RECORDS NOTHING ──────────────────────────────────────────────────────
 *
 * Worth saying in the UI, because the check immediately above this one on the
 * same page does the opposite: every question put to the evaluation endpoint
 * writes a decision artifact an auditor will later read. This writes nothing,
 * so it is safe to run repeatedly while somebody is still making up their mind.
 *
 * ── A CONFLICT IS A FINDING, NOT AN ERROR ───────────────────────────────────
 *
 * Rendered as a finding with a remedy, in its own state, for the same reason
 * the decision summary separates a denial from a failure: "this must not be
 * granted" and "we could not tell you whether it may be granted" are opposite
 * facts, and the second is the one that must never read as an all-clear.
 *
 * ── TWO SHAPES OF CONFLICT, TWO REMEDIES ────────────────────────────────────
 *
 * They are reported separately because what has to change differs:
 *
 *   already held  the person has the other half. Something they currently hold
 *                 has to be withdrawn, or the duty moved to somebody else.
 *   within the    the set conflicts with itself. A role carrying both hands
 *   set           everybody who holds it two duties they may not combine and
 *                 then refuses them both — so the set has to be split.
 */
export function SoDPrecheckForm({
  /** The session's own company, used when the field is left blank. */
  legalEntityId,
}: {
  legalEntityId?: string;
}) {
  const [state, action, pending] = useActionState<SoDPrecheckState, FormData>(
    precheckSoDAction,
    IDLE_SOD_PRECHECK,
  );

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="candidate_actions" className={LABEL}>
            Which actions are you about to grant?
          </label>
          <textarea
            id="candidate_actions"
            name="candidate_actions"
            required
            rows={3}
            placeholder={"PAYMENT_APPROVE\nPAYMENT_INITIATE"}
            className={cn(FIELD, "font-mono text-xs")}
          />
          <p className={HINT}>
            One per line, or comma-separated. Paste the whole permission set you are
            considering — checking them one at a time would miss a set that conflicts with
            itself.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="precheck_principal_id" className={LABEL}>
              For whom? <span className={OPTIONAL}>optional</span>
            </label>
            <input
              id="precheck_principal_id"
              name="principal_id"
              placeholder="00000000-0000-0000-0000-000000000000"
              className={cn(FIELD, "font-mono text-xs")}
              autoComplete="off"
            />
            <p className={HINT}>
              Name somebody to check against what they already hold — including anything lent
              to them by a delegation, which conflicts just as hard. Leave it blank to check
              only whether the set conflicts with itself, which is the question when designing
              a role nobody holds yet.
            </p>
          </div>

          <div>
            <label htmlFor="precheck_legal_entity_id" className={LABEL}>
              In which company? <span className={OPTIONAL}>optional</span>
            </label>
            <input
              id="precheck_legal_entity_id"
              name="legal_entity_id"
              defaultValue={legalEntityId ?? ""}
              placeholder="Your own company"
              className={cn(FIELD, "font-mono text-xs")}
              autoComplete="off"
            />
            <p className={HINT}>
              Needed whenever a person is named — what somebody holds is recorded per company,
              so there is no answer without one.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            <ShieldQuestion className="h-4 w-4" aria-hidden="true" />
            {pending ? "Checking…" : "Check for conflicts"}
          </Button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Records nothing — unlike the check above, which writes a decision every time it is
            asked. Run this as often as you like.
          </p>
        </div>
      </form>

      {state.status === "refused" && <ResultBanner tone="warning" message={state.message} />}
      {state.status === "unauthorized" && <ResultBanner tone="error" message={state.message} />}
      {state.status === "error" && <ResultBanner tone="error" message={state.message} />}

      {state.status === "clear" && (
        <ResultBanner
          tone={state.ownObjectRestricted.length > 0 ? "neutral" : "success"}
          message={state.headline}
        >
          <p className="text-xs leading-relaxed">{state.detail}</p>
        </ResultBanner>
      )}

      {state.status === "conflict" && (
        <ResultBanner tone="error" message={state.headline}>
          <p className="text-xs leading-relaxed">{state.detail}</p>

          <div className={cn(PANEL, "bg-white/60 dark:bg-slate-900/40")}>
            <ul className="space-y-2">
              {state.conflicts.map((conflict) => (
                <li
                  key={conflict.candidate_action + ":" + conflict.conflicts_with}
                  className="flex flex-wrap items-center gap-2 text-xs"
                >
                  <span className="font-mono">{conflict.candidate_action}</span>
                  <span className="text-slate-400 dark:text-slate-500">cannot go with</span>
                  <span className="font-mono">{conflict.conflicts_with}</span>
                  {/* The stored source value drives the label, and both are
                      shown: an auditor cites what the service said, and the
                      operator needs to know which remedy applies. */}
                  <Badge tone={conflict.source === "held" ? "danger" : "warning"}>
                    {conflict.source === "held"
                      ? "already held — withdraw something first"
                      : "within this set — split the role"}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs leading-relaxed">
            This is the control working, found before the grant was made rather than after
            every use of it started being refused. Do not resolve it by retiring the conflict
            rule unless withdrawing that control is a decision somebody has actually taken.
          </p>
        </ResultBanner>
      )}
    </div>
  );
}
