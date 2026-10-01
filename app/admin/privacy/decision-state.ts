import type { PrivacyDecision } from "@/lib/api/privacy-decision";

export type DecisionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  decision?: PrivacyDecision;
  decisionId?: string;
  error?: string;
};

export const IDLE_DECISION_STATE: DecisionActionState = {
  status: "idle",
};
