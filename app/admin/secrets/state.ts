// Shared contract between the secret-vault Server Actions and the forms that
// call them.

import type {
  BrokerResult,
  RotateResult,
  SecretLease,
  SecretPolicy,
  SecretPolicyVersion,
} from "@/lib/api/secret-vault";

/** Policy, version, activation, and material writes all report the same three
 *  outcomes, so they share a state shape. `conflict` is separate from `error`
 *  because a 409 here means a redefinition attempt, not a failure. */
export type VaultWriteState = {
  status: "idle" | "created" | "replayed" | "conflict" | "error";
  message: string;
  policy?: SecretPolicy;
  version?: SecretPolicyVersion;
};

export const IDLE_VAULT_WRITE: VaultWriteState = { status: "idle", message: "" };

/**
 * Broker outcome.
 *
 * Four terminal states, because the three ways a request can fail to produce a
 * lease are genuinely different and lead to different fixes:
 *
 *   granted        — a lease exists
 *   denied         — a policy was found and it excluded this principal (403)
 *   no-policy      — nothing active covers this path and scope (404), so the
 *                    refusal is deny-by-absence rather than a decision
 *   vault-down     — policy allowed it but the material could not be fetched
 */
export type BrokerState = {
  status: "idle" | "granted" | "denied" | "no-policy" | "vault-down" | "error";
  message: string;
  /** The lease's metadata. Never the token — that is a live credential. */
  lease?: Omit<BrokerResult, "lease_token">;
  tokenIssued?: boolean;
};

export const IDLE_BROKER: BrokerState = { status: "idle", message: "" };

export type RotateState = {
  status: "idle" | "rotated" | "replayed" | "error";
  message: string;
  result?: RotateResult;
};

export const IDLE_ROTATE: RotateState = { status: "idle", message: "" };

export type RevokeState = {
  status: "idle" | "revoked" | "already-terminal" | "error";
  message: string;
  lease?: SecretLease;
};

export const IDLE_REVOKE: RevokeState = { status: "idle", message: "" };
