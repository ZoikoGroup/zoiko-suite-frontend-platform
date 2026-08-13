"use server";

// Server Actions for secret-vault-integration-svc (:8087).
//
// Server Actions are reachable by direct POST, so the session is verified inside
// every action rather than relying on the proxy's /admin matcher.
//
// SECRET MATERIAL NEVER ROUNDTRIPS THROUGH THIS CONSOLE'S OUTPUT. Two things are
// live credentials — the material an operator seeds, and the lease token the
// broker mints. The first goes straight to the service and is never echoed back.
// The second is dropped from every action's return value before it reaches a
// client component, so it cannot end up in the RSC payload, the browser's memory,
// or a screenshot. Only its existence is reported.
//
// This service performs no authorization of its own on the ADMIN routes: creating
// a policy, versioning it, activating it, seeding material, and rotating are all
// ungated beyond the console's session check. The broker route is the one that
// authorizes — and it authorizes the requesting workload against the policy, not
// the operator against the console.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createSecretPolicy,
  createSecretPolicyVersion,
  activateSecretPolicyVersion,
  putSecretMaterial,
  brokerSecret,
  revokeLease,
  rotateSecret,
  getLease,
  explainSecretVaultError,
  SECRET_CLASSES,
  DATA_CLASSIFICATIONS,
  type VaultErrorSubject,
} from "@/lib/api/secret-vault";
import type { LookupState } from "@/components/admin/shared/lookup";
import type { BrokerState, RevokeState, RotateState, VaultWriteState } from "./state";

const PATH = "/admin/secrets";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

const EXPIRED: VaultWriteState = {
  status: "error",
  message: "Your session has expired — sign in again.",
};

function writeFailure(
  status: number | undefined,
  message: string,
  subject?: VaultErrorSubject,
): VaultWriteState {
  if (status === 409)
    return { status: "conflict", message: explainSecretVaultError(message, subject) };
  return { status: "error", message: explainSecretVaultError(message, subject) };
}

/** Register a secret path. Step 1 of 3 — grants come from its versions. */
export async function submitSecretPolicy(
  _previous: VaultWriteState,
  formData: FormData,
): Promise<VaultWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const secretClass = String(formData.get("secret_class") ?? "").trim();
  const secretPath = String(formData.get("secret_path") ?? "").trim();
  const dataClassification = String(formData.get("data_classification") ?? "").trim();

  if (!(SECRET_CLASSES as readonly string[]).includes(secretClass)) {
    return { status: "error", message: "Select a secret class." };
  }
  if (!secretPath) return { status: "error", message: "A secret path is required." };
  if (
    dataClassification &&
    !(DATA_CLASSIFICATIONS as readonly string[]).includes(dataClassification)
  ) {
    return { status: "error", message: "Data classification must be one of the four listed." };
  }

  const result = await createSecretPolicy({
    secretClass,
    secretPath,
    principalId: identity.principalId,
    dataClassification: dataClassification || undefined,
  });

  if (!result.ok) return writeFailure(result.error.status, result.error.message);

  revalidatePath(PATH);

  return result.status === 201
    ? {
        status: "created",
        policy: result.data,
        message: `Path registered. Nothing can broker it yet — add a version, activate it, then seed the material.`,
      }
    : {
        status: "replayed",
        policy: result.data,
        message: "That path was already registered with these exact attributes; nothing was written.",
      };
}

/** Add a DRAFT access rule. Step 2 of 3 — no effect until activated. */
export async function submitSecretVersion(
  _previous: VaultWriteState,
  formData: FormData,
): Promise<VaultWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const secretPolicyId = String(formData.get("secret_policy_id") ?? "").trim();
  const workloadsRaw = String(formData.get("allowed_workload_ids") ?? "").trim();
  const durationRaw = String(formData.get("max_lease_duration_seconds") ?? "").trim();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();
  const scope = String(formData.get("scope") ?? "tenant").trim();

  if (!secretPolicyId) return { status: "error", message: "A secret policy ID is required." };
  if (!effectiveFrom) return { status: "error", message: "An effective-from date is required." };

  const duration = Number(durationRaw);
  if (!Number.isFinite(duration) || duration <= 0) {
    return { status: "error", message: "Maximum lease duration must be greater than zero seconds." };
  }

  // Comma or newline separated. An empty list is legal and denies everyone — the
  // service accepts it silently, so the console says what it means instead.
  const allowedWorkloadIds = workloadsRaw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const result = await createSecretPolicyVersion({
    secretPolicyId,
    allowedWorkloadIds,
    maxLeaseDurationSeconds: duration,
    effectiveFrom: new Date(`${effectiveFrom}T00:00:00Z`).toISOString(),
    tenantId: scope === "global" ? undefined : identity.tenantId,
    legalEntityId: scope === "entity" ? identity.legalEntityId : undefined,
    principalId: identity.principalId,
  });

  if (!result.ok) return writeFailure(result.error.status, result.error.message);

  revalidatePath(PATH);

  const lockdown =
    allowedWorkloadIds.length === 0
      ? " The allowed-workload list is empty, so once active this version denies every caller."
      : "";

  return result.status === 201
    ? {
        status: "created",
        version: result.data,
        message: `Version created as ${result.data.version_status}. It grants nothing until activated.${lockdown}`,
      }
    : {
        status: "replayed",
        version: result.data,
        message: `An identical version already existed; nothing was written.${lockdown}`,
      };
}

/** Activate a DRAFT version. Step 3 of 3 for policy — material is separate. */
export async function submitSecretActivation(
  _previous: VaultWriteState,
  formData: FormData,
): Promise<VaultWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const secretPolicyId = String(formData.get("secret_policy_id") ?? "").trim();
  const versionId = String(formData.get("version_id") ?? "").trim();
  if (!secretPolicyId || !versionId) {
    return { status: "error", message: "Both a policy ID and a version ID are required." };
  }

  const result = await activateSecretPolicyVersion({
    secretPolicyId,
    versionId,
    principalId: identity.principalId,
  });

  if (!result.ok) return writeFailure(result.error.status, result.error.message, "version");

  revalidatePath(PATH);

  // The service answers 200 whether it transitioned a DRAFT or short-circuited
  // on an already-ACTIVE version, so `transitioned` is what separates a real
  // activation from a no-op repeat — reported as two different outcomes rather
  // than one green banner covering both.
  if (!result.data.transitioned) {
    return {
      status: "replayed",
      version: result.data,
      message: `No change — this version was already ${result.data.version_status}, so nothing was written and no activation was attributed to you. The earlier activation stands.`,
    };
  }

  return {
    status: "created",
    version: result.data,
    message: `Version is now ${result.data.version_status}, activated by you. Brokering will still fail until material is seeded for this path.`,
  };
}

/**
 * Seed secret material into the vault backend.
 *
 * The submitted value is base64-encoded here and sent onward; it is never
 * returned, never revalidated into a rendered page, and never written to this
 * console's own state.
 */
export async function submitSecretMaterial(
  _previous: VaultWriteState,
  formData: FormData,
): Promise<VaultWriteState> {
  try {
    await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const secretPolicyId = String(formData.get("secret_policy_id") ?? "").trim();
  const material = String(formData.get("material") ?? "");

  if (!secretPolicyId) return { status: "error", message: "A secret policy ID is required." };
  if (!material) return { status: "error", message: "Enter the secret material to store." };

  const result = await putSecretMaterial({
    secretPolicyId,
    materialBase64: Buffer.from(material, "utf-8").toString("base64"),
  });

  if (!result.ok) return writeFailure(result.error.status, result.error.message);

  return {
    status: "created",
    message: `Material stored for ${result.data.secret_path}. The value is not readable back through this console — only brokered as a lease.`,
  };
}

/**
 * Request access to a secret.
 *
 * Splits the three refusal modes apart, because they have different causes:
 * 404 means no active policy covers the path (deny-by-absence, usually an
 * un-activated version), 403 means a policy exists and excluded the principal,
 * and a vault failure means policy allowed it but the material is missing.
 */
export async function submitBrokerRequest(
  _previous: BrokerState,
  formData: FormData,
): Promise<BrokerState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const secretPath = String(formData.get("secret_path") ?? "").trim();
  const principal =
    String(formData.get("requested_by") ?? "").trim() || identity.principalId;
  const scope = String(formData.get("scope") ?? "tenant").trim();

  if (!secretPath) return { status: "error", message: "A secret path is required." };

  const result = await brokerSecret({
    secretPath,
    requestId: crypto.randomUUID(),
    principalId: principal,
    tenantId: scope === "global" ? undefined : identity.tenantId,
    legalEntityId: scope === "entity" ? identity.legalEntityId : undefined,
  });

  revalidatePath(PATH);

  if (!result.ok) {
    const { status, message } = result.error;
    if (status === 404) {
      return { status: "no-policy", message: explainSecretVaultError("no_applicable_secret_policy") };
    }
    if (status === 403) {
      return { status: "denied", message: explainSecretVaultError("access_denied") };
    }
    if (message.includes("vault_backend_unavailable")) {
      return {
        status: "vault-down",
        message:
          "Policy allowed the request, but no material could be fetched for this path. This usually means material was never seeded — the grant path is unreachable until it is.",
      };
    }
    return { status: "error", message: explainSecretVaultError(message) };
  }

  // Strip the token before it can cross into a client component. Everything
  // below this line is safe to render.
  const { lease_token, ...leaseMetadata } = result.data;

  return {
    status: "granted",
    lease: leaseMetadata,
    tokenIssued: Boolean(lease_token),
    message: `Access granted. Lease expires ${new Date(leaseMetadata.expires_at).toISOString()}. A token was minted and deliberately not returned to this page.`,
  };
}

/**
 * Revoke a lease.
 *
 * The service answers 200 with the unchanged lease when nothing transitioned, so
 * success alone does not prove a revocation happened — `revoked_at` does, and
 * that is what this checks.
 */
export async function submitRevoke(
  _previous: RevokeState,
  formData: FormData,
): Promise<RevokeState> {
  try {
    await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const leaseId = String(formData.get("lease_id") ?? "").trim();
  if (!leaseId) return { status: "error", message: "A lease ID is required." };

  const result = await revokeLease(leaseId);

  if (!result.ok) {
    if (result.error.status === 409) {
      return {
        status: "already-terminal",
        message: explainSecretVaultError("invalid_transition", "lease"),
      };
    }
    return { status: "error", message: explainSecretVaultError(result.error.message, "lease") };
  }

  revalidatePath(PATH);

  const lease = result.data;
  if (!lease.revoked_at) {
    return {
      status: "already-terminal",
      lease,
      message: `The service returned this lease unchanged and it carries no revoked_at, so nothing was revoked — its status is ${lease.status}.`,
    };
  }

  // Revoking an already-REVOKED lease is a 200 returning the record untouched,
  // not the 409 this once assumed — the store short-circuits on status REVOKED
  // and writes no second audit entry. `revoked_at` cannot tell the two apart
  // because it is already set on a repeat, so `transitioned` is what does.
  if (!lease.transitioned) {
    return {
      status: "already-terminal",
      lease,
      message: `No change — this lease was already REVOKED as of ${lease.revoked_at}. Nothing was written and no second REVOKED entry was added to the audit log.`,
    };
  }

  return {
    status: "revoked",
    lease,
    message: `Lease revoked. The revocation is recorded in the access audit log as a REVOKED entry.`,
  };
}

/**
 * Rotate a secret, revoking every live lease on its path.
 *
 * A replayed request_id returns the original rotation with `revoked_lease_count`
 * of 0. That zero is the replay, not a rotation that found nothing — reported
 * distinctly so it is not read as "there were no leases".
 */
export async function submitRotation(
  _previous: RotateState,
  formData: FormData,
): Promise<RotateState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const secretPolicyId = String(formData.get("secret_policy_id") ?? "").trim();
  const requestIdRaw = String(formData.get("request_id") ?? "").trim();
  if (!secretPolicyId) return { status: "error", message: "A secret policy ID is required." };

  // An operator may supply a request id to deliberately test the replay path;
  // otherwise a fresh one makes this a real rotation.
  const requestId = requestIdRaw || crypto.randomUUID();
  const replayIntended = Boolean(requestIdRaw);

  const result = await rotateSecret({
    secretPolicyId,
    requestId,
    principalId: identity.principalId,
  });

  if (!result.ok) {
    return { status: "error", message: explainSecretVaultError(result.error.message) };
  }

  revalidatePath(PATH);

  const rotated = result.data;
  if (replayIntended && rotated.revoked_lease_count === 0) {
    return {
      status: "replayed",
      result: rotated,
      message: `This request ID was already used, so the original rotation was returned and nothing rotated again. The zero lease count reflects the replay, not an absence of leases.`,
    };
  }

  return {
    status: "rotated",
    result: rotated,
    message: `Rotated ${rotated.secret_path} and revoked ${rotated.revoked_lease_count} live lease${rotated.revoked_lease_count === 1 ? "" : "s"}. Note that the revoke step and the ROTATED audit write are not one transaction — the service documents this itself.`,
  };
}

/** Read one lease by id. */
export async function lookupLease(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  try {
    await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const leaseId = String(formData.get("lease_id") ?? "").trim();
  if (!leaseId) return { status: "error", message: "Enter a lease ID." };

  const result = await getLease(leaseId);

  if (!result.ok) {
    if (result.error.status === 404) {
      return { status: "missing", message: "No lease with that id exists." };
    }
    return { status: "error", message: explainSecretVaultError(result.error.message, "lease") };
  }

  return { status: "found", record: result.data, message: "" };
}
