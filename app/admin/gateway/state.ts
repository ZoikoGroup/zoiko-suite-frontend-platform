import type { VerifyOutcome } from "@/lib/api/gateway-auth";

/**
 * The gateway's answer for the signed-in session, plus what the console knows
 * that the gateway's answer alone does not say: whether the injected identity
 * is the one the session was issued for.
 */
export type GatewayVerifyState =
  | { status: "idle" }
  | {
      status: "allowed" | "refused" | "unresolved" | "unreachable";
      outcome: VerifyOutcome;
      hadEnvelope: boolean;
      /** Injected header → whether it matches the session. Absent when there is
       *  nothing in the session to compare against. */
      matches: Record<string, boolean>;
      message: string;
    }
  | { status: "error"; message: string };

export const IDLE_GATEWAY_VERIFY: GatewayVerifyState = { status: "idle" };
