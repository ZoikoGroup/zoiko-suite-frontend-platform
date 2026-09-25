"use client";

import { useActionState } from "react";
import { Building2, HandCoins } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { ResultBanner, type BannerTone } from "@/components/admin/shared";
import { CELL, FIELD, HEAD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import {
  checkDelegatedAccessAction,
  checkEntityScopeAction,
} from "@/app/admin/access-control/audit-actions";
import {
  IDLE_DELEGATED_ACCESS_CHECK,
  IDLE_ENTITY_SCOPE_CHECK,
  type DelegatedAccessCheckState,
  type EntityScopeCheckState,
} from "@/app/admin/access-control/state";
import { PLATFORM_SCOPE_SENTINEL, type AuthzTone } from "@/lib/api/authorization";

/**
 * The two remaining §8.3 pre-flight questions, neither of which the evaluate
 * form above can answer and neither of which records anything.
 *
 * ── WHY THEY ARE NOT JUST THE EVALUATE FORM RUN TWICE ───────────────────────
 *
 * "Which companies may this person act in" through the evaluate form is one
 * submission per company AND — because every evaluation writes its decision
 * artifact — one row in the audit log per company, for a question nobody acted
 * on. Asking about five companies would write five audit records to work out
 * which buttons to offer.
 *
 * "Whose authority is this person using" the evaluate form cannot answer at
 * all. It returns one "allowed" for both paths and names the role as the reason
 * when both apply — so somebody who holds an action in their own right AND has
 * it lent to them reads as ordinary role-based access. For any step that needs
 * two different people, that is the whole question.
 *
 * Both live in one file because they are the same question from two directions
 * — where can this person reach, and on whose authority — and an operator
 * looking into somebody's access asks them together.
 */

const TONE: Record<AuthzTone, BannerTone> = {
  success: "success",
  info: "neutral",
  neutral: "neutral",
  warning: "warning",
  danger: "error",
};

const RECORDS_NOTHING =
  "Records nothing — unlike the check further up this page, which writes a decision every time it is asked.";

// ── where can this person act? ──────────────────────────────────────────────

export function EntityScopeCheckForm({
  /** Pre-filled so the common single-company question needs nothing pasted. */
  legalEntityId,
}: {
  legalEntityId?: string;
}) {
  const [state, action, pending] = useActionState<EntityScopeCheckState, FormData>(
    checkEntityScopeAction,
    IDLE_ENTITY_SCOPE_CHECK,
  );

  // Echoed back as defaultValue on every field. React re-creates this form's
  // subtree when the panel's shape changes between statuses, which discards an
  // uncontrolled input's value — so without this a second submit re-sent the
  // FIRST question while showing the operator the text they had typed.
  // Measured in a browser: a two-line company list came back as one line after
  // the first submit. Same fix DecisionLogPanel carries for its filters.
  const prior = state.status === "idle" ? null : state.submitted;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="scope_principal_id" className={LABEL}>
              Who?
            </label>
            <input
              id="scope_principal_id"
              name="principal_id"
              required
              defaultValue={prior?.principalId ?? ""}
              placeholder="00000000-0000-0000-0000-000000000000"
              className={cn(FIELD, "font-mono text-xs")}
              autoComplete="off"
            />
            <p className={HINT}>
              Copy a reference from the live grants register, or from a row in the decision
              history.
            </p>
          </div>

          <div>
            <label htmlFor="scope_action_type" className={LABEL}>
              Doing what? <span className={OPTIONAL}>optional</span>
            </label>
            <input
              id="scope_action_type"
              name="action_type"
              defaultValue={prior?.actionType ?? ""}
              placeholder="Anything at all"
              className={cn(FIELD, "font-mono text-xs uppercase")}
              autoComplete="off"
            />
            <p className={HINT}>
              Leave blank to ask whether they can act in each company <em>at all</em>, which
              also lists everything they hold there. Name an action to ask the narrower
              question.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="legal_entity_ids" className={LABEL}>
            In which companies?
          </label>
          <textarea
            id="legal_entity_ids"
            name="legal_entity_ids"
            rows={3}
            defaultValue={prior ? prior.legalEntityIdsRaw : (legalEntityId ?? "")}
            placeholder={"00000000-0000-0000-0000-000000000000\nPLATFORM"}
            className={cn(FIELD, "font-mono text-xs")}
          />
          <p className={HINT}>
            One per line, or comma-separated, up to 100. Answered in the order you list them,
            so you can line the results up against your own list. Use{" "}
            <span className="font-mono">{PLATFORM_SCOPE_SENTINEL}</span> for something that
            belongs to no single company. Blank uses your own.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            <Building2 className="h-4 w-4" aria-hidden="true" />
            {pending ? "Checking…" : "Check their reach"}
          </Button>
          <p className="text-xs text-slate-400 dark:text-slate-500">{RECORDS_NOTHING}</p>
        </div>
      </form>

      {state.status === "refused" && <ResultBanner tone="warning" message={state.message} />}
      {state.status === "unauthorized" && <ResultBanner tone="error" message={state.message} />}
      {state.status === "error" && <ResultBanner tone="error" message={state.message} />}

      {state.status === "checked" && (
        <div className="space-y-3">
          <ResultBanner
            tone={state.inScopeCount > 0 ? "success" : "warning"}
            message={state.message}
          />

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th scope="col" className={cn(HEAD, "text-left")}>
                    Company
                  </th>
                  <th scope="col" className={cn(HEAD, "text-left")}>
                    Can act?
                  </th>
                  <th scope="col" className={cn(HEAD, "text-left")}>
                    On what basis
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {state.results.map(({ result, explanation }) => (
                  <tr key={result.legal_entity_id}>
                    <td className={cn(CELL, "font-mono text-xs")}>
                      {result.legal_entity_id}
                    </td>
                    <td className={CELL}>
                      <Badge tone={result.in_scope ? "success" : "neutral"}>
                        {result.in_scope ? "Yes" : "No"}
                      </Badge>
                    </td>
                    <td className={CELL}>
                      <p className="text-xs leading-relaxed">{explanation}</p>
                      {result.permitted_actions && result.permitted_actions.length > 0 && (
                        <p className="mt-1.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                          {result.permitted_actions.join(", ")}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── whose authority is it? ──────────────────────────────────────────────────

export function DelegatedAccessCheckForm({
  legalEntityId,
}: {
  legalEntityId?: string;
}) {
  const [state, action, pending] = useActionState<DelegatedAccessCheckState, FormData>(
    checkDelegatedAccessAction,
    IDLE_DELEGATED_ACCESS_CHECK,
  );

  // See EntityScopeCheckForm above for why every field echoes its submission.
  const prior = state.status === "idle" ? null : state.submitted;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="borrowed_principal_id" className={LABEL}>
              Who?
            </label>
            <input
              id="borrowed_principal_id"
              name="principal_id"
              required
              defaultValue={prior?.principalId ?? ""}
              placeholder="00000000-0000-0000-0000-000000000000"
              className={cn(FIELD, "font-mono text-xs")}
              autoComplete="off"
            />
            <p className={HINT}>The person who acted, or is about to.</p>
          </div>

          <div>
            <label htmlFor="borrowed_action_type" className={LABEL}>
              Doing what? <span className={OPTIONAL}>optional</span>
            </label>
            <input
              id="borrowed_action_type"
              name="action_type"
              defaultValue={prior?.actionType ?? ""}
              placeholder="Anything lent to them"
              className={cn(FIELD, "font-mono text-xs uppercase")}
              autoComplete="off"
            />
            <p className={HINT}>
              Name an action to find out whether they also hold it in their own right —
              which is the answer a two-person step needs.
            </p>
          </div>

          <div>
            <label htmlFor="borrowed_legal_entity_id" className={LABEL}>
              In which company?
            </label>
            <input
              id="borrowed_legal_entity_id"
              name="legal_entity_id"
              defaultValue={prior ? prior.legalEntityId : (legalEntityId ?? "")}
              placeholder="Your own company"
              className={cn(FIELD, "font-mono text-xs")}
              autoComplete="off"
            />
            <p className={HINT}>Borrowed authority is recorded per company.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            <HandCoins className="h-4 w-4" aria-hidden="true" />
            {pending ? "Checking…" : "Whose authority?"}
          </Button>
          <p className="text-xs text-slate-400 dark:text-slate-500">{RECORDS_NOTHING}</p>
        </div>
      </form>

      {state.status === "refused" && <ResultBanner tone="warning" message={state.message} />}
      {state.status === "unauthorized" && <ResultBanner tone="error" message={state.message} />}
      {state.status === "error" && <ResultBanner tone="error" message={state.message} />}

      {state.status === "checked" && (
        <ResultBanner tone={TONE[state.tone]} message={state.headline}>
          <p className="text-xs leading-relaxed">{state.detail}</p>

          {state.bothPaths && (
            // The finding, called out rather than left inside the paragraph:
            // this is the case a check on the outcome alone cannot see.
            <p className="text-xs font-medium leading-relaxed">
              Worth acting on: a check that only read the answer would have reported this as
              ordinary role-based access. If a step here needs two different people, this
              person is not the second one.
            </p>
          )}

          {state.delegatedActions.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                Lent to them in this company:
              </p>
              <p className="font-mono text-[11px]">{state.delegatedActions.join(", ")}</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                Already narrowed to what the lenders still hold themselves — a delegation
                shrinks automatically when the lender&rsquo;s own access does.
              </p>
            </div>
          )}
        </ResultBanner>
      )}
    </div>
  );
}
