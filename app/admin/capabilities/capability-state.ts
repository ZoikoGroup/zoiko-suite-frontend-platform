import type {
  Capability,
  MarketRelease,
  IntegrationCapability,
  Release,
  CapabilityClaim,
  CapabilityResolution,
} from "@/lib/api/capability-registry";

export type CapabilityActionState = {
  status: "idle" | "success" | "error";
  action?:
    | "create_capability"
    | "get_capability"
    | "create_market_release"
    | "create_integration"
    | "update_health"
    | "set_release_state"
    | "create_claim"
    | "resolve_capability";
  message?: string;
  error?: string;
  capability?: Capability;
  marketRelease?: MarketRelease;
  integration?: IntegrationCapability;
  integrations?: IntegrationCapability[];
  release?: Release;
  claim?: CapabilityClaim;
  claims?: CapabilityClaim[];
  resolution?: CapabilityResolution;
};

export const IDLE_CAPABILITY_STATE: CapabilityActionState = {
  status: "idle",
};
