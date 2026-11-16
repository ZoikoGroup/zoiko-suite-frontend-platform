// Shared contract between app/admin/tax/tax-actions.ts and the forms that call
// it. Lives outside the "use server" file, which may export only async
// functions.

import type {
  TaxRule,
  TaxDetermination,
  CorporateTaxReturn,
  WithholdingTaxObligation,
} from "@/lib/api/tax";

/**
 * One write's outcome. `record` is the service's own response body, so the
 * form reads back what was stored rather than what was typed; `message` on an
 * error is the service's refusal as it was sent.
 */
export type TaxWriteState<T> = {
  status: "idle" | "success" | "error";
  message: string;
  record?: T;
};

export type TaxRuleState = TaxWriteState<TaxRule>;
export type DeterminationState = TaxWriteState<TaxDetermination>;
export type CorporateTaxState = TaxWriteState<CorporateTaxReturn>;
export type WithholdingState = TaxWriteState<WithholdingTaxObligation>;

export const IDLE_TAX_STATE: TaxWriteState<never> = { status: "idle", message: "" };

/** tax-rules-svc's declared categories (domain.ValidCategory). */
export const TAX_RULE_CATEGORIES = [
  "VAT", "GST", "SALES_TAX", "CORPORATE_INCOME", "WITHHOLDING", "EXCISE", "CUSTOMS",
] as const;
