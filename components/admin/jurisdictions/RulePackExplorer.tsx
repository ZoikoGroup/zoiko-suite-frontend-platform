"use client";

import { useActionState, useState } from "react";
import { ChevronRight, History } from "lucide-react";
import { Button } from "@/components/ui";
import { CopyableId, JsonBlock, ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL, PANEL } from "@/components/admin/shared/form";
import {
  DRIFT_STATES,
  RULE_STATUSES,
  isDriftedInForce,
  type Jurisdiction,
  type JurisdictionRule,
} from "@/lib/api/jurisdictions";
import {
  loadDriftHistoryAction,
  recordDriftAction,
  resolveRulePackAction,
  transitionRuleAction,
} from "@/app/admin/jurisdictions/actions";
import {
  IDLE_RULE_ACTION,
  IDLE_RULE_PACK,
  type RulePackState,
  type RuleActionState,
} from "@/app/admin/jurisdictions/state";

function StatusBadge({ value, drifted }: { value: string; drifted?: boolean }) {
  const tone = drifted
    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
    : value === "ACTIVE" || value === "CURRENT"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : value === "DRAFT"
        ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
        : "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{value}</span>
  );
}

/**
 * Per-rule controls: transition its status, record legal drift, read its history.
 *
 * Each rule owns its own action state. Selecting a shared state by rule id would
 * be the mistake this codebase has already made once — never key a row's
 * useActionState by state the write itself mutates, because the row re-renders
 * under a value that has just changed and the banner lands on the wrong row.
 */
function RuleActions({ rule }: { rule: JurisdictionRule }) {
  const [open, setOpen] = useState<"none" | "transition" | "drift">("none");
  const [transitionState, transitionAction, transitionPending] = useActionState<RuleActionState, FormData>(
    transitionRuleAction, IDLE_RULE_ACTION);
  const [driftState, driftAction, driftPending] = useActionState<RuleActionState, FormData>(
    recordDriftAction, IDLE_RULE_ACTION);
  const [historyState, historyAction, historyPending] = useActionState<RuleActionState, FormData>(
    loadDriftHistoryAction, IDLE_RULE_ACTION);

  const tone = (s: RuleActionState) =>
    s.status === "transitioned" || s.status === "drifted"
      ? "success"
      : s.status === "history"
        ? "neutral"
        : "error";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm"
          onClick={() => setOpen(open === "transition" ? "none" : "transition")}>
          <ChevronRight className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Transition
        </Button>
        <Button type="button" variant="secondary" size="sm"
          onClick={() => setOpen(open === "drift" ? "none" : "drift")}>
          Record drift
        </Button>
        <form action={historyAction} className="inline">
          <input type="hidden" name="rule_id" value={rule.jurisdiction_rule_id} />
          <Button type="submit" variant="secondary" size="sm" loading={historyPending}>
            <History className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Drift history
          </Button>
        </form>
      </div>

      {open === "transition" && (
        <form action={transitionAction} className={PANEL}>
          <input type="hidden" name="rule_id" value={rule.jurisdiction_rule_id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor={`status_${rule.jurisdiction_rule_id}`}>New status</label>
              <select id={`status_${rule.jurisdiction_rule_id}`} name="new_status" className={FIELD}
                defaultValue={rule.rule_status === "DRAFT" ? "ACTIVE" : "SUPERSEDED"}>
                {RULE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor={`endsat_${rule.jurisdiction_rule_id}`}>
                End date <span className={OPTIONAL}>optional</span>
              </label>
              <input id={`endsat_${rule.jurisdiction_rule_id}`} name="effective_to" type="date" className={FIELD} />
              <p className={HINT}>
                For a closing transition. Omitted means now — and a SUPERSEDED rule left without an
                end date keeps matching every point-in-time query beside its own replacement.
              </p>
            </div>
          </div>
          <Button type="submit" size="sm" loading={transitionPending} className="mt-3">Apply transition</Button>
          <ResultBanner tone={tone(transitionState)} className="mt-3"
            message={"message" in transitionState ? transitionState.message : undefined} />
        </form>
      )}

      {open === "drift" && (
        <form action={driftAction} className={PANEL}>
          <input type="hidden" name="rule_id" value={rule.jurisdiction_rule_id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={LABEL} htmlFor={`drift_${rule.jurisdiction_rule_id}`}>Drift state</label>
              <select id={`drift_${rule.jurisdiction_rule_id}`} name="drift_state" className={FIELD}
                defaultValue="DRIFTED">
                {DRIFT_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL} htmlFor={`reason_${rule.jurisdiction_rule_id}`}>Reason</label>
              <input id={`reason_${rule.jurisdiction_rule_id}`} name="reason" required className={FIELD}
                placeholder="Finance Act 2026 raised the threshold; stored rule still encodes the 2025 basis"
                autoComplete="off" />
              <p className={HINT}>
                The evidence for the change. A drift entry without it records that a rule diverged
                and not what diverged, which is the only part anyone needs later.
              </p>
            </div>
          </div>
          <Button type="submit" size="sm" loading={driftPending} className="mt-3">Record drift</Button>
          <ResultBanner tone={tone(driftState)} className="mt-3"
            message={"message" in driftState ? driftState.message : undefined} />
        </form>
      )}

      {historyState.status === "history" && historyState.ruleId === rule.jurisdiction_rule_id && (
        <div className={PANEL}>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{historyState.message}</p>
          {historyState.events.length > 0 && (
            <ul className="space-y-1.5">
              {historyState.events.map((e) => (
                <li key={e.drift_event_id} className="text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-mono">{e.effective_at.slice(0, 10)}</span>{" "}
                  <span className="text-slate-400">{e.from_state} →</span>{" "}
                  <span className="font-medium">{e.to_state}</span>
                  {e.reason ? <span className="text-slate-500 dark:text-slate-400"> — {e.reason}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {historyState.status === "error" && (
        <ResultBanner tone="error" message={historyState.message} />
      )}
    </div>
  );
}

/**
 * Resolve a rule pack for a jurisdiction at a date, and show the chain it was
 * assembled from.
 *
 * The as-at date is the point of this panel. Rules are effective-dated, so "the
 * rules" is always "the rules at a date" — a register that only ever answered
 * for today could not explain a decision taken last year, which is the question
 * an auditor actually asks.
 */
export function RulePackExplorer({ jurisdictions }: { jurisdictions: Jurisdiction[] }) {
  const [state, action, pending] = useActionState<RulePackState, FormData>(
    resolveRulePackAction, IDLE_RULE_PACK);

  return (
    <div className="space-y-4">
      <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="pack_jurisdiction_id">Jurisdiction</label>
          <select id="pack_jurisdiction_id" name="jurisdiction_id" required className={FIELD} defaultValue="">
            <option value="" disabled>Select a jurisdiction…</option>
            {jurisdictions.map((j) => (
              <option key={j.jurisdiction_id} value={j.jurisdiction_id}>
                {j.jurisdiction_name} ({j.jurisdiction_code}){j.active_flag ? "" : " — inactive"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="effective_at">
            As at <span className={OPTIONAL}>optional</span>
          </label>
          <input id="effective_at" name="effective_at" type="date" className={FIELD} />
          <p className={HINT}>Omitted means now.</p>
        </div>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Resolving…" : "Resolve rule pack"}
          </Button>
        </div>
      </form>

      {state.status === "error" && <ResultBanner tone="error" message={state.message} />}

      {state.status === "resolved" && (
        <div className="space-y-4">
          <ResultBanner tone={state.pack.rules?.length ? "success" : "neutral"} message={state.message} />

          <div className={PANEL}>
            <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Resolved from
            </p>
            <p className="flex flex-wrap items-center gap-1.5 text-sm">
              {state.chain.map((link, i) => (
                <span key={link.id} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-slate-400" aria-hidden="true">→</span>}
                  <span className={i === 0 ? "font-medium text-slate-800 dark:text-slate-100" : "text-slate-600 dark:text-slate-300"}>
                    {link.label}
                  </span>
                </span>
              ))}
            </p>
            <p className={HINT}>
              Nearest first. Where two of these declare the same (domain, code), the one on the left
              wins — that is what makes a rule inherited rather than duplicated.
            </p>
          </div>

          {(state.pack.rules ?? []).map((rule) => (
            <div key={rule.jurisdiction_rule_id} className={PANEL}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-100">
                      {rule.rule_code}
                    </span>
                    <StatusBadge value={rule.rule_domain} />
                    <StatusBadge value={rule.rule_status} />
                    <StatusBadge value={rule.legal_drift_state} drifted={rule.legal_drift_state !== "CURRENT"} />
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{rule.rule_name}</p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    in force from {rule.effective_from.slice(0, 10)}
                    {rule.effective_to ? ` to ${rule.effective_to.slice(0, 10)}` : ""}
                    {rule.source_reference ? ` · ${rule.source_reference}` : ""}
                  </p>
                  {isDriftedInForce(rule) && (
                    <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                      Still ACTIVE and known to have diverged from the law it encodes. It continues
                      to resolve into this pack — being drifted does not take a rule out of force.
                    </p>
                  )}
                </div>
                <CopyableId value={rule.jurisdiction_rule_id} />
              </div>

              <div className="mt-3">
                <JsonBlock value={rule.rule_payload} />
              </div>

              <div className="mt-3">
                <RuleActions rule={rule} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
