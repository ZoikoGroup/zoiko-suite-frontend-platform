/**
 * One result shape for every action on the Authorization page.
 *
 *   done     — the change was made, or the check answered
 *   pending  — accepted but not yet in force (maker-checker: awaiting approval)
 *   refused  — the service decided no (a permission, an SoD rule, a checker
 *              rule) — the control working, shown amber, not as a fault
 *   error    — nothing was decided (unreachable, store down, malformed)
 *
 * Results are key/value `details` and, for lists, a small `table` — never raw
 * JSON (docs/UI_DESIGN_STANDARDS.md §7).
 */
export type AuthzResult = {
  status: "idle" | "done" | "pending" | "refused" | "error";
  message: string;
  details?: { label: string; value: string }[];
  table?: { headers: string[]; rows: string[][] };
};

export const IDLE: AuthzResult = { status: "idle", message: "" };

/**
 * Reason codes offered on every privileged or destructive command. The
 * service requires one (AUTHZ_COMMAND_CONTRACT=enforce) and records it with
 * the change; which list a button offers depends on what it does.
 */
export const REASONS = {
  end: [
    ["ACCESS_NO_LONGER_REQUIRED", "Access no longer needed"],
    ["ROLE_CHANGE", "Change of role"],
    ["LEAVER", "Person is leaving"],
    ["SECURITY_CONCERN", "Security concern"],
    ["REVIEW_OUTCOME", "Access review outcome"],
    ["ERROR_CORRECTION", "Correcting a mistake"],
    ["OTHER", "Other (explain in the note)"],
  ],
  restore: [
    ["ACCESS_REINSTATED", "Access reinstated"],
    ["ERROR_CORRECTION", "Correcting a mistake"],
    ["POLICY_CHANGE", "Policy change"],
    ["OTHER", "Other (explain in the note)"],
  ],
  approve: [
    ["MEETS_POLICY", "Meets policy"],
    ["BUSINESS_NEED_CONFIRMED", "Business need confirmed"],
    ["OTHER", "Other (explain in the note)"],
  ],
  reject: [
    ["NOT_JUSTIFIED", "Not justified"],
    ["EXCESSIVE_ACCESS", "More access than needed"],
    ["SOD_RISK", "Separation-of-duties risk"],
    ["OTHER", "Other (explain in the note)"],
  ],
  change: [
    ["POLICY_CHANGE", "Policy change"],
    ["INCIDENT_RESPONSE", "Incident response"],
    ["ERROR_CORRECTION", "Correcting a mistake"],
    ["OTHER", "Other (explain in the note)"],
  ],
} as const;

export type ReasonSet = keyof typeof REASONS;
