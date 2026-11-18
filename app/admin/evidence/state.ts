// Shared contract between the evidence Server Actions and the dialogs that call
// them. The result shape is the Authorization console's (AuthzResult), so every
// console dialog — reason, step-up retry, result — behaves the same way.

export { IDLE, type AuthzResult as EvidenceResult } from "@/app/admin/authorization/state";

/** Domain codes the console offers when creating a requirement or evaluating.
 *  Free-form in the service — this narrows only our own forms. */
export const DOMAIN_CODES = [
  "FINANCE",
  "PAYROLL",
  "HR",
  "LEGAL",
  "TAX",
  "COMPLIANCE",
  "COMMERCIAL_OPS",
] as const;
