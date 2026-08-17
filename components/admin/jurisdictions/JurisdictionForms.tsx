"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import {
  AUTHORITY_TYPES,
  JURISDICTION_TYPES,
  RULE_DOMAINS,
  RULE_STATUSES,
  type Jurisdiction,
} from "@/lib/api/jurisdictions";
import {
  deactivateJurisdictionAction,
  recordRuleAction,
  registerJurisdictionAction,
} from "@/app/admin/jurisdictions/actions";
import {
  IDLE_RECORD_RULE,
  IDLE_REGISTER_JURISDICTION,
  type RecordRuleState,
  type RegisterJurisdictionState,
} from "@/app/admin/jurisdictions/state";

/**
 * Tones.
 *
 * `replayed` is neutral, not green: the registry answered 200 because the
 * jurisdiction already existed with exactly these attributes and nothing was
 * written, and colouring that as a fresh success would tell someone they had
 * just created a jurisdiction that has existed for months. `conflict` is amber
 * — the registry refusing to let one key mean two different things is the
 * control working, not a fault.
 */
const REGISTER_TONE = {
  registered: "success",
  replayed: "neutral",
  conflict: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

const RULE_TONE = {
  recorded: "success",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

/** Suggestions, not a closed set — every one of these is a VARCHAR in the
 *  service precisely so a new value arrives by data migration. A datalist
 *  offers the known values without making the console the thing that has to be
 *  redeployed for a new jurisdiction type. */
function Suggestions({ id, values }: { id: string; values: readonly string[] }) {
  return (
    <datalist id={id}>
      {values.map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  );
}

export function RegisterJurisdictionForm({ jurisdictions }: { jurisdictions: Jurisdiction[] }) {
  const [state, action, pending] = useActionState<RegisterJurisdictionState, FormData>(
    registerJurisdictionAction,
    IDLE_REGISTER_JURISDICTION,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="jurisdiction_code">Code</label>
          <input
            id="jurisdiction_code"
            name="jurisdiction_code"
            required
            className={`${FIELD} font-mono text-xs`}
            placeholder="GB-SCT"
            autoComplete="off"
          />
          <p className={HINT}>Short and human-readable. It is what every other page shows instead of the UUID.</p>
        </div>
        <div>
          <label className={LABEL} htmlFor="jurisdiction_name">Name</label>
          <input
            id="jurisdiction_name"
            name="jurisdiction_name"
            required
            className={FIELD}
            placeholder="Scotland"
            autoComplete="off"
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="jurisdiction_type">Type</label>
          <input
            id="jurisdiction_type"
            name="jurisdiction_type"
            required
            list="jurisdiction-types"
            className={FIELD}
            defaultValue="COUNTRY"
            autoComplete="off"
          />
          <Suggestions id="jurisdiction-types" values={JURISDICTION_TYPES} />
        </div>
        <div>
          <label className={LABEL} htmlFor="authority_type">Authority</label>
          <input
            id="authority_type"
            name="authority_type"
            required
            list="authority-types"
            className={FIELD}
            defaultValue="FEDERAL"
            autoComplete="off"
          />
          <Suggestions id="authority-types" values={AUTHORITY_TYPES} />
        </div>
        <div>
          <label className={LABEL} htmlFor="j_effective_from">Effective from</label>
          <input id="j_effective_from" name="effective_from" type="date" required className={FIELD} />
        </div>
        <div>
          <label className={LABEL} htmlFor="j_effective_to">
            Effective to <span className={OPTIONAL}>optional</span>
          </label>
          <input id="j_effective_to" name="effective_to" type="date" className={FIELD} />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="parent_jurisdiction_id">
            Nested in <span className={OPTIONAL}>optional</span>
          </label>
          <select id="parent_jurisdiction_id" name="parent_jurisdiction_id" className={FIELD} defaultValue="">
            <option value="">No parent — this is a root jurisdiction</option>
            {jurisdictions.map((j) => (
              <option key={j.jurisdiction_id} value={j.jurisdiction_id}>
                {j.jurisdiction_name} ({j.jurisdiction_code})
              </option>
            ))}
          </select>
          <p className={HINT}>
            Nesting is what makes a rule inherited: a rule on the parent applies here unless this
            jurisdiction declares the same rule code itself.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Registering…" : "Register jurisdiction"}
      </Button>

      <ResultBanner tone={REGISTER_TONE[state.status]} message={"message" in state ? state.message : undefined}>
        {"jurisdiction" in state && (
          <p className="text-xs">
            <span className="text-slate-500 dark:text-slate-400">id </span>
            <CopyableId value={state.jurisdiction.jurisdiction_id} />
          </p>
        )}
      </ResultBanner>
    </form>
  );
}

/** Deactivation is a state change, not a delete — the button says so on hover. */
export function DeactivateJurisdictionButton({ jurisdictionId }: { jurisdictionId: string }) {
  const [state, action, pending] = useActionState<RegisterJurisdictionState, FormData>(
    deactivateJurisdictionAction,
    IDLE_REGISTER_JURISDICTION,
  );

  return (
    <form action={action} className="inline">
      <input type="hidden" name="jurisdiction_id" value={jurisdictionId} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        loading={pending}
        title="Clears active_flag and end-dates the row. Nothing is deleted — records already bound to it still resolve."
      >
        {pending ? "Deactivating…" : "Deactivate"}
      </Button>
      {state.status !== "idle" && "message" in state && (
        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{state.message}</span>
      )}
    </form>
  );
}

export function RecordRuleForm({ jurisdictions }: { jurisdictions: Jurisdiction[] }) {
  const [state, action, pending] = useActionState<RecordRuleState, FormData>(
    recordRuleAction,
    IDLE_RECORD_RULE,
  );

  const EXAMPLE = `{
  "applies_to_entity_types": ["COMPANY", "BRANCH"],
  "filing_frequency": "MONTHLY",
  "authority_code": "HMRC"
}`;

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="rule_jurisdiction_id">Jurisdiction</label>
          <select id="rule_jurisdiction_id" name="jurisdiction_id" required className={FIELD} defaultValue="">
            <option value="" disabled>Select a jurisdiction…</option>
            {jurisdictions.map((j) => (
              <option key={j.jurisdiction_id} value={j.jurisdiction_id}>
                {j.jurisdiction_name} ({j.jurisdiction_code})
                {j.active_flag ? "" : " — inactive"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="rule_domain">Domain</label>
          <input
            id="rule_domain"
            name="rule_domain"
            required
            list="rule-domains"
            className={FIELD}
            defaultValue="TAX"
            autoComplete="off"
          />
          <Suggestions id="rule-domains" values={RULE_DOMAINS} />
        </div>
        <div>
          <label className={LABEL} htmlFor="rule_code">Rule code</label>
          <input
            id="rule_code"
            name="rule_code"
            required
            className={`${FIELD} font-mono text-xs`}
            placeholder="VAT-REGISTRATION"
            autoComplete="off"
          />
          <p className={HINT}>
            One rule wins per (domain, code) when a pack resolves — this is the key that decides
            which one a nested jurisdiction overrides.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="rule_name">Name</label>
          <input id="rule_name" name="rule_name" required className={FIELD}
            placeholder="VAT registration threshold applicability" autoComplete="off" />
        </div>
        <div>
          <label className={LABEL} htmlFor="r_effective_from">Effective from</label>
          <input id="r_effective_from" name="effective_from" type="date" required className={FIELD} />
        </div>
        <div>
          <label className={LABEL} htmlFor="rule_status">Status</label>
          <select id="rule_status" name="rule_status" className={FIELD} defaultValue="DRAFT">
            {RULE_STATUSES.filter((s) => s === "DRAFT" || s === "ACTIVE").map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <p className={HINT}>
            A DRAFT rule is registered but does not resolve into a rule pack. Only DRAFT and ACTIVE
            are offered — a rule cannot be created directly into a closed state.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="source_reference">
            Source reference <span className={OPTIONAL}>optional</span>
          </label>
          <input id="source_reference" name="source_reference" className={FIELD}
            placeholder="VATA 1994 s.3, Sch 1" autoComplete="off" />
          <p className={HINT}>The legislation this rule encodes. It is what a drift review is checked against.</p>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="rule_payload">Applicability payload</label>
          <textarea
            id="rule_payload"
            name="rule_payload"
            required
            rows={7}
            className={`${FIELD} font-mono text-xs`}
            defaultValue={EXAMPLE}
            spellCheck={false}
          />
          <p className={HINT}>
            Applicability metadata only — who the rule applies to, how often they file, which
            authority. Thresholds and rates belong to the Tax and Payroll services; a number here
            would be a second copy of a figure this registry does not own.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Recording…" : "Record rule"}
      </Button>

      <ResultBanner tone={RULE_TONE[state.status]} message={"message" in state ? state.message : undefined}>
        {"rule" in state && (
          <p className="text-xs">
            <span className="text-slate-500 dark:text-slate-400">rule id </span>
            <CopyableId value={state.rule.jurisdiction_rule_id} />
          </p>
        )}
      </ResultBanner>
    </form>
  );
}
