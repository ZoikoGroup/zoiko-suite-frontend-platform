"use client";

import { useActionState, useState } from "react";
import { AlertCircle, HelpCircle, Info, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { evaluateAccessAction } from "@/app/admin/access-control/actions";
import {
  IDLE_EVALUATE_ACCESS,
  type EvaluateAccessState,
} from "@/app/admin/access-control/state";
import { PLATFORM_SCOPE_SENTINEL } from "@/lib/api/authorization";
import { AccessDecisionSummary } from "./AccessDecisionSummary";

/**
 * Ask the authorization plane a question.
 *
 * This is `POST /v1/authorize`, and until now nothing in the console could
 * reach it. Everything else on this page — roles, permitted actions, grants,
 * delegations, conflict rules, attribute conditions — exists to change what
 * this endpoint answers, and there was no way to ask it anything. An operator
 * built a grant and then waited for some other service to exercise it to find
 * out whether it worked; if the answer was no, there was nothing to read.
 *
 * TWO THINGS THIS FORM SAYS OUT LOUD, because both are surprising and neither
 * is discoverable:
 *
 *  1. It is not a dry run. Every evaluation is written to the decision log
 *     before the answer comes back — that is the constraint the service is
 *     built around, not a side effect — so checking a grant from here leaves
 *     the same artifact a real service call would, for an auditor to find.
 *  2. A "no" is an answer, not a fault. It is rendered as a finding with a
 *     reason and a remedy. The failure case — the service could not evaluate —
 *     is rendered completely differently, because "you may not" and "we could
 *     not determine whether you may" are opposite facts and nobody was told
 *     anything in the second one.
 */
export function EvaluateAccessForm({
  /** The session's own legal entity, offered as the default scope so the
   *  common case needs no reference pasted. */
  legalEntityId,
}: {
  legalEntityId: string;
}) {
  const [state, action, pending] = useActionState<EvaluateAccessState, FormData>(
    evaluateAccessAction,
    IDLE_EVALUATE_ACCESS,
  );
  const [scope, setScope] = useState<"entity" | "platform">("entity");
  const [advanced, setAdvanced] = useState(false);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="subject_principal_id" className={LABEL}>
              Who is the question about?
            </label>
            <input
              id="subject_principal_id"
              name="subject_principal_id"
              required
              placeholder="00000000-0000-0000-0000-000000000000"
              className={`${FIELD} font-mono text-xs`}
              autoComplete="off"
            />
            <p className={HINT}>
              The person whose access is being checked — not you, unless you are checking your
              own. Copy a reference from the grants register below.
            </p>
          </div>

          <div>
            <label htmlFor="evaluation_action_type" className={LABEL}>
              Which action?
            </label>
            <input
              id="evaluation_action_type"
              name="evaluation_action_type"
              required
              placeholder="PAYMENT_APPROVE"
              className={`${FIELD} font-mono text-xs`}
              autoComplete="off"
            />
            <p className={HINT}>
              Has to be the same code the calling service uses. Nothing tidies it up at the point
              of the check, so a near-miss comes back as no grant rather than as a typo.
            </p>
          </div>

          <div className="sm:col-span-2">
            <span className={LABEL}>Where does it apply?</span>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="scope_choice"
                  value="entity"
                  checked={scope === "entity"}
                  onChange={() => setScope("entity")}
                  className="h-4 w-4"
                />
                One company
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="scope_choice"
                  value="platform"
                  checked={scope === "platform"}
                  onChange={() => setScope("platform")}
                  className="h-4 w-4"
                />
                Platform-wide
              </label>
            </div>

            {scope === "entity" ? (
              <>
                <input
                  id="evaluation_legal_entity_id"
                  name="evaluation_legal_entity_id"
                  required
                  defaultValue={legalEntityId}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className={`${FIELD} mt-2 font-mono text-xs`}
                  autoComplete="off"
                />
                <p className={HINT}>
                  Access is held per company. Somebody granted a role in one company holds nothing
                  in another, so the company is part of the question rather than a filter on it.
                </p>
              </>
            ) : (
              <>
                {/* The sentinel, not a synthetic uuid. Every service used to
                    invent its own id for platform-wide acts, and a grant
                    seeded against one was invisible to a check made against
                    another — silently, and fail-closed. */}
                <input
                  type="hidden"
                  name="evaluation_legal_entity_id"
                  value={PLATFORM_SCOPE_SENTINEL}
                />
                <p className={`${HINT} mt-2`}>
                  For acts that belong to no single company. This resolves to the one platform
                  scope the whole estate shares — services used to each invent their own, which
                  made a grant seeded against one invisible to a check made against another.
                </p>
              </>
            )}
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setAdvanced((a) => !a)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-700 transition-colors hover:text-navy-900 dark:text-navy-300 dark:hover:text-navy-100"
          >
            <span className={cn("transition-transform", advanced && "rotate-90")} aria-hidden="true">
              ›
            </span>
            {advanced ? "Hide the two extra inputs" : "Add the two inputs that turn on more checks"}
          </button>

          {advanced && (
            <div className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-800/40">
              <div>
                <label htmlFor="resource_owner_principal_id" className={LABEL}>
                  Who prepared the item? <span className={OPTIONAL}>(optional)</span>
                </label>
                <input
                  id="resource_owner_principal_id"
                  name="resource_owner_principal_id"
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className={`${FIELD} font-mono text-xs`}
                  autoComplete="off"
                />
                <p className={HINT}>
                  Supplying this turns on the own-work check — a person may hold an action in
                  general and still be refused it over something they prepared themselves. Leave
                  it blank and that check is not attempted at all.
                </p>
              </div>

              <div>
                <label htmlFor="evaluation_attributes" className={LABEL}>
                  Details of the request <span className={OPTIONAL}>(optional)</span>
                </label>
                <textarea
                  id="evaluation_attributes"
                  name="evaluation_attributes"
                  rows={3}
                  placeholder={'{"amount": 5000, "channel": "web"}'}
                  className={`${FIELD} font-mono text-xs`}
                />
                <p className={HINT}>
                  What the attribute conditions are checked against. Numbers are fine as written
                  — they are sent as text, and comparisons like &ldquo;is at most&rdquo; still
                  order them as numbers. An attribute a condition names and this omits counts as
                  not met, deliberately, so a caller cannot get past a required condition by
                  leaving a field out.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={pending} size="sm">
            {!pending && <ScanSearch className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            {pending ? "Asking…" : "Ask"}
          </Button>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            This is not a rehearsal — the answer is recorded as a decision, the same as any
            service asking the same question.
          </p>
        </div>
      </form>

      <EvaluationResult state={state} />
    </div>
  );
}

/**
 * The three outcomes, rendered as three different things.
 *
 * A grant and a denial are both answers and both get the decision summary. The
 * unevaluated case gets none of it, and says so in its own words: there is no
 * decision to show, because none was made or recorded.
 */
function EvaluationResult({ state }: { state: EvaluateAccessState }) {
  if (state.status === "idle") return null;

  if (state.status === "granted" || state.status === "denied") {
    const granted = state.status === "granted";
    return (
      <div
        className={cn(
          "rounded-lg border p-4 animate-fade-up",
          granted
            ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10"
            : "border-rose-200 bg-rose-50/70 dark:border-rose-500/30 dark:bg-rose-500/10",
        )}
        role="status"
        aria-live="polite"
      >
        <p
          className={cn(
            "mb-3 text-sm font-medium",
            granted
              ? "text-emerald-800 dark:text-emerald-300"
              : "text-rose-800 dark:text-rose-300",
          )}
        >
          {state.message}
        </p>
        <div className="rounded-lg bg-white/70 p-3 ring-1 ring-inset ring-black/5 dark:bg-slate-900/40 dark:ring-white/5">
          <AccessDecisionSummary decision={state.decision} />
        </div>
      </div>
    );
  }

  // Not an answer. Given its own treatment so it can never be read as one —
  // nothing was decided, nothing was recorded, and nobody has been told
  // anything either way.
  if (state.status === "unevaluated") {
    return (
      <div
        className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm animate-fade-up dark:border-amber-500/40 dark:bg-amber-500/10"
        role="status"
        aria-live="polite"
      >
        <HelpCircle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400"
          aria-hidden="true"
        />
        <div className="space-y-1.5">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            No answer — and that is not a no.
          </p>
          <p className="leading-relaxed text-amber-800 dark:text-amber-300">{state.message}</p>
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            Nothing was decided and nothing was recorded, so do not read this as a refusal. Any
            service asking this same question right now is being refused rather than allowed,
            which is the safe direction but is not the same as an answer.
          </p>
        </div>
      </div>
    );
  }

  const isUnauthorized = state.status === "unauthorized";
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm animate-fade-up",
        isUnauthorized
          ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
          : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
      )}
      role="status"
      aria-live="polite"
    >
      {isUnauthorized ? (
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <p className="leading-relaxed">{state.message}</p>
    </div>
  );
}
