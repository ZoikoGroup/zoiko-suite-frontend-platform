"use client";

import { useActionState } from "react";
import { Snowflake } from "lucide-react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import {
  createHoldAction,
  createPolicyAction,
  releaseHoldAction,
  resolveAction,
} from "@/app/admin/retention/actions";
import {
  IDLE_CREATE_HOLD,
  IDLE_CREATE_POLICY,
  IDLE_RELEASE_HOLD,
  IDLE_RESOLVE,
  type CreateHoldState,
  type CreatePolicyState,
  type ReleaseHoldState,
  type ResolveState,
} from "@/app/admin/retention/state";
import { retentionWindow, type LegalHold } from "@/lib/api/retention";

/**
 * Tones.
 *
 * `engaged` is amber rather than green. Engaging a hold succeeded, but what it
 * achieved is a freeze — painting it as an unqualified success reads as "done,
 * nothing to think about", when the operator has just blocked deletion, export
 * and migration for a scope until someone deliberately releases it.
 *
 * `alreadyReleased` is neutral: a 409 is a fact about the hold, not a fault in
 * the request. Somebody already released it, and red would invite a retry that
 * will be refused identically.
 *
 * `released` IS green, because unblocking is the outcome that was asked for and
 * the accountable approver is recorded on the row.
 */
const POLICY_TONE = {
  created: "success",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

const HOLD_TONE = {
  engaged: "warning",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

const RELEASE_TONE = {
  released: "success",
  alreadyReleased: "neutral",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

/** Suggestions, not a closed set — record_class is free text in the service on
 *  purpose, so a new class of record never needs a redeploy. */
const RECORD_CLASSES = [
  "FINANCIAL_LEDGER",
  "AUDIT_EVENT",
  "HR_RECORD",
  "PAYROLL_RECORD",
  "CONTRACT",
  "TAX_FILING",
  "GOVERNANCE_DECISION",
] as const;

// ─── Record a retention policy ───────────────────────────────────────────────

export function RecordPolicyForm({ correlationId }: { correlationId: string }) {
  const [state, action, pending] = useActionState<CreatePolicyState, FormData>(
    createPolicyAction,
    IDLE_CREATE_POLICY,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="correlation_id" value={correlationId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="policy_record_class">
            Record class
          </label>
          <input
            className={FIELD}
            id="policy_record_class"
            name="record_class"
            placeholder="FINANCIAL_LEDGER"
            required
          />
          <p className={HINT}>
            Upper-cased and underscored for you — these are compared exactly, so a lower-case entry
            would be a rule matching nothing. Common classes: {RECORD_CLASSES.slice(0, 4).join(", ")}.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="legal_regulatory_basis">
            Legal or regulatory basis
          </label>
          <input
            className={FIELD}
            id="legal_regulatory_basis"
            name="legal_regulatory_basis"
            placeholder="Companies Act 2006 s.388"
            required
          />
          <p className={HINT}>
            A retention period with no cited basis is a number nobody can defend later.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="min_retention_days">
            Minimum retention (days)
          </label>
          <input
            className={FIELD}
            id="min_retention_days"
            name="min_retention_days"
            type="number"
            min={1}
            placeholder="2555"
            required
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="max_retention_days">
            Maximum retention (days) <span className={OPTIONAL}>(optional)</span>
          </label>
          <input className={FIELD} id="max_retention_days" name="max_retention_days" type="number" min={1} />
          <p className={HINT}>
            Leave blank for &quot;at least the minimum, no upper bound&quot;.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="policy_jurisdiction_code">
            Jurisdiction <span className={OPTIONAL}>(optional)</span>
          </label>
          <input className={FIELD} id="policy_jurisdiction_code" name="jurisdiction_code" placeholder="GB" />
          <p className={HINT}>Blank applies regardless of jurisdiction.</p>
        </div>
        <div>
          <label className={LABEL} htmlFor="effective_from">
            Effective from
          </label>
          <input className={FIELD} id="effective_from" name="effective_from" type="date" required />
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
        <input type="checkbox" name="platform_wide" className="mt-0.5" />
        <span>
          Platform-wide — binds <strong>every tenant</strong>, not just yours. Sent as an explicit
          choice rather than inferred from a blank field, because &quot;I left it blank&quot; and
          &quot;I meant every tenant&quot; are different intentions.
        </span>
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Recording…" : "Record policy"}
      </Button>

      {state.status !== "idle" && (
        <ResultBanner tone={POLICY_TONE[state.status]} message={state.message}>
          {state.status === "created" && <CopyableId value={state.policy.retention_policy_id} />}
        </ResultBanner>
      )}
    </form>
  );
}

// ─── Engage a legal hold ─────────────────────────────────────────────────────

export function EngageHoldForm({ correlationId }: { correlationId: string }) {
  const [state, action, pending] = useActionState<CreateHoldState, FormData>(
    createHoldAction,
    IDLE_CREATE_HOLD,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="correlation_id" value={correlationId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="scope_description">
            What is being frozen
          </label>
          <input
            className={FIELD}
            id="scope_description"
            name="scope_description"
            placeholder="All ledger records relating to the 2026 HMRC enquiry"
            required
          />
          <p className={HINT}>This is the matter record, read by whoever reviews the hold later.</p>
        </div>
        <div>
          <label className={LABEL} htmlFor="authority">
            Authority
          </label>
          <input className={FIELD} id="authority" name="authority" placeholder="HMRC enquiry ref 12345" required />
          <p className={HINT}>
            The court, regulator or internal body that ordered the freeze. A hold with no stated
            authority cannot be defended or audited.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="hold_record_class">
            Record class <span className={OPTIONAL}>(optional)</span>
          </label>
          <input className={FIELD} id="hold_record_class" name="record_class" placeholder="FINANCIAL_LEDGER" />
          <p className={HINT}>Blank freezes every record class in scope — the broadest option.</p>
        </div>
        <div>
          <label className={LABEL} htmlFor="entity_ref">
            Entity reference <span className={OPTIONAL}>(optional)</span>
          </label>
          <input className={FIELD} id="entity_ref" name="entity_ref" placeholder="invoice:INV-2026-0042" />
        </div>
        <div>
          <label className={LABEL} htmlFor="custodians_objects">
            Custodians and objects <span className={OPTIONAL}>(optional)</span>
          </label>
          <textarea
            className={FIELD}
            id="custodians_objects"
            name="custodians_objects"
            rows={2}
            placeholder="finance-team, general-ledger-svc"
          />
          <p className={HINT}>Comma- or newline-separated. Who and what holds the evidence.</p>
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
        <input type="checkbox" name="platform_wide" className="mt-0.5" />
        <span>
          Platform-wide freeze — blocks deletion for <strong>every tenant</strong>.
        </span>
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Engaging…" : "Engage hold"}
        </Button>
        <p className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Snowflake className="h-3.5 w-3.5" />
          Blocks deletion, export and migration until released.
        </p>
      </div>

      {state.status !== "idle" && (
        <ResultBanner tone={HOLD_TONE[state.status]} message={state.message}>
          {state.status === "engaged" && <CopyableId value={state.hold.legal_hold_id} />}
        </ResultBanner>
      )}
    </form>
  );
}

// ─── Release a legal hold ────────────────────────────────────────────────────

export function ReleaseHoldForm({
  activeHolds,
  principalId,
  correlationId,
}: {
  activeHolds: LegalHold[];
  principalId: string;
  correlationId: string;
}) {
  const [state, action, pending] = useActionState<ReleaseHoldState, FormData>(
    releaseHoldAction,
    IDLE_RELEASE_HOLD,
  );

  if (activeHolds.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No active holds to release.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="correlation_id" value={correlationId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="legal_hold_id">
            Hold
          </label>
          <select className={FIELD} id="legal_hold_id" name="legal_hold_id" required>
            <option value="">Choose an active hold…</option>
            {activeHolds.map((h) => (
              <option key={h.legal_hold_id} value={h.legal_hold_id}>
                {h.scope_description} — {h.authority}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="release_approved_by_principal_id">
            Approved by
          </label>
          <input
            className={FIELD}
            id="release_approved_by_principal_id"
            name="release_approved_by_principal_id"
            defaultValue={principalId}
          />
          <p className={HINT}>
            Recorded on the hold as the accountable approver. The service requires it and does not
            default it — it is prefilled with you, and changing it to the person who actually
            approved is the point of the field.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "Releasing…" : "Release hold"}
      </Button>

      {state.status !== "idle" && (
        <ResultBanner tone={RELEASE_TONE[state.status]} message={state.message}>
          {state.status === "released" && <CopyableId value={state.hold.legal_hold_id} />}
        </ResultBanner>
      )}
    </form>
  );
}

// ─── Resolve ─────────────────────────────────────────────────────────────────

/**
 * The pre-deletion check, rendered as TWO findings and never one verdict.
 *
 * The service returns them separately on purpose: a hold blocks regardless of
 * policy, and a record past its minimum retention with no hold is still a
 * decision the caller applies. A single green tick here would be the console
 * inventing a permission the service never gave.
 */
export function ResolveForm() {
  const [state, action, pending] = useActionState<ResolveState, FormData>(
    resolveAction,
    IDLE_RESOLVE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="resolve_record_class">
            Record class
          </label>
          <input
            className={FIELD}
            id="resolve_record_class"
            name="record_class"
            placeholder="FINANCIAL_LEDGER"
            required
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="resolve_jurisdiction_code">
            Jurisdiction <span className={OPTIONAL}>(optional)</span>
          </label>
          <input className={FIELD} id="resolve_jurisdiction_code" name="jurisdiction_code" placeholder="GB" />
        </div>
        <div>
          <label className={LABEL} htmlFor="resolve_entity_ref">
            Entity reference <span className={OPTIONAL}>(optional)</span>
          </label>
          <input className={FIELD} id="resolve_entity_ref" name="entity_ref" placeholder="invoice:INV-2026-0042" />
        </div>
      </div>

      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "Checking…" : "Check"}
      </Button>

      {state.status === "error" && <ResultBanner tone="error" message={state.message} />}

      {state.status === "answered" && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <ResultBanner
            tone={state.resolution.blocked ? "warning" : "neutral"}
            message={
              state.resolution.blocked
                ? `${state.recordClass} is FROZEN by an active legal hold. No deletion, export or migration, whatever the retention policy permits.`
                : `${state.recordClass} is not frozen by any legal hold.`
            }
          />

          {state.resolution.matched_hold && (
            <div className="text-xs text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-900 dark:text-slate-100">Hold:</span>{" "}
              {state.resolution.matched_hold.scope_description} —{" "}
              {state.resolution.matched_hold.authority}
            </div>
          )}

          <div className="text-xs text-slate-600 dark:text-slate-400">
            <span className="font-medium text-slate-900 dark:text-slate-100">
              Applicable retention policy:
            </span>{" "}
            {state.resolution.applicable_policy ? (
              <>
                {retentionWindow(state.resolution.applicable_policy)} —{" "}
                {state.resolution.applicable_policy.legal_regulatory_basis}
              </>
            ) : (
              // Not "you may delete this". No policy means nothing here states a
              // period, which is a gap in the register rather than permission.
              <>
                none found. That is not permission to delete — it means no rule has been recorded
                for this record class and scope.
              </>
            )}
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Two independent findings. This service never deletes anything; applying them is the
            caller&apos;s decision.
          </p>
        </div>
      )}
    </form>
  );
}
