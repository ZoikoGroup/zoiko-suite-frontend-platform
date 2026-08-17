import type { DriftEvent, Jurisdiction, JurisdictionRule, RulePack } from "@/lib/api/jurisdictions";

/**
 * Action states for the jurisdiction registry.
 *
 * Each write has its own state rather than one shared union, because the page
 * shows several forms at once and a shared state would let one form's banner
 * appear under another. `raced` and `replayed` are kept apart from `error` on
 * purpose: neither is a failure, and both would otherwise read as one.
 */

export type RegisterJurisdictionState =
  | { status: "idle" }
  | { status: "registered"; jurisdiction: Jurisdiction; message: string }
  /** The service answers 200 for an identical re-submission. Nothing was written,
   *  and that is the correct outcome — not an error to report as one. */
  | { status: "replayed"; jurisdiction: Jurisdiction; message: string }
  | { status: "conflict"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export type RecordRuleState =
  | { status: "idle" }
  | { status: "recorded"; rule: JurisdictionRule; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export type RulePackState =
  | { status: "idle" }
  | {
      status: "resolved";
      pack: RulePack;
      /** Codes for the ids in `resolved_from`, so the chain reads as
       *  "GB-SCT → GB" rather than as three UUIDs. */
      chain: { id: string; label: string }[];
      subject: string;
      message: string;
    }
  | { status: "error"; message: string };

export type RuleActionState =
  | { status: "idle" }
  | { status: "transitioned"; rule: JurisdictionRule; message: string }
  | { status: "drifted"; rule: JurisdictionRule; message: string }
  | { status: "history"; ruleId: string; events: DriftEvent[]; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

export const IDLE_REGISTER_JURISDICTION: RegisterJurisdictionState = { status: "idle" };
export const IDLE_RECORD_RULE: RecordRuleState = { status: "idle" };
export const IDLE_RULE_PACK: RulePackState = { status: "idle" };
export const IDLE_RULE_ACTION: RuleActionState = { status: "idle" };
