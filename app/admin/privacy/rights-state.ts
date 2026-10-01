import type { RightsRequest, DiscoveryManifest } from "@/lib/api/privacy-rights";

export type RightsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  action?: "create" | "verify" | "manifest" | "close" | "lookup" | "list_subject" | "wfc_ref";
  request?: RightsRequest;
  manifests?: DiscoveryManifest[];
  subjectRequests?: RightsRequest[];
  error?: string;
};

export const IDLE_RIGHTS_STATE: RightsActionState = {
  status: "idle",
};
