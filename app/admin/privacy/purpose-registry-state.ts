// Action-state types for the privacy-purpose-registry-svc (PRV-01) panel.
// Kept separate from actions.ts's ConsentActionState (privacy-consent-svc)
// and transfer-actions.ts's equivalents (privacy-transfer-svc) — three
// different backend services share this page.

export type PurposeRegistryActionState = {
  status: "idle" | "success" | "error";
  message: string;
  purposeId?: string;
  versionId?: string;
  activityId?: string;
  activityVersionId?: string;
  findings?: { code: string; field: string; message: string }[];
};

export const IDLE_PURPOSE_REGISTRY_STATE: PurposeRegistryActionState = { status: "idle", message: "" };
