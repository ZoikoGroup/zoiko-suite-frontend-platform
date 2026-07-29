"use server";

// Server Actions that WRITE to configuration-feature-flag-svc (:8086).
//
// Server Actions are reachable by direct POST, not only through this UI, so the
// session is verified inside every action rather than relying on the proxy's
// /admin matcher.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { upsertFeatureFlag } from "@/lib/api/configuration";
import type { FlagActionState } from "./state";

async function requirePrincipal(): Promise<string> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return session.email;
}

/**
 * Create or re-assert a feature flag from the form.
 *
 * Returns the backend's own verdict: 201 means a new version was written, 200
 * means the submitted state already matched and the service deliberately did
 * nothing.
 */
export async function submitFlag(
  _previous: FlagActionState,
  formData: FormData,
): Promise<FlagActionState> {
  let principalId: string;
  try {
    principalId = await requirePrincipal();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const key = String(formData.get("key") ?? "").trim();
  const environment = String(formData.get("environment") ?? "").trim();
  const enabled = formData.get("enabled") === "on";
  const rolloutRaw = String(formData.get("rollout_percentage") ?? "").trim();

  if (!key) return { status: "error", message: "Flag key is required." };
  if (!environment) return { status: "error", message: "Environment is required." };

  let rolloutPercentage: number | undefined;
  if (rolloutRaw !== "") {
    const parsed = Number(rolloutRaw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
      return { status: "error", message: "Rollout must be a whole number between 0 and 100." };
    }
    rolloutPercentage = parsed;
  }

  const result = await upsertFeatureFlag({
    key,
    enabled,
    environment,
    rolloutPercentage,
    principalId,
  });

  if (!result.ok) return { status: "error", message: result.error.message, key };

  revalidatePath("/admin/settings");

  return result.status === 201
    ? {
        status: "created",
        key,
        message: `Transition recorded — ${key} is now ${enabled ? "enabled" : "disabled"} in ${environment}.`,
      }
    : {
        status: "unchanged",
        key,
        message: `No change — ${key} was already ${enabled ? "enabled" : "disabled"} in ${environment}. Nothing written.`,
      };
}

/**
 * Flip an existing flag. Same append-only write as submitFlag; the rollout
 * percentage is carried over so a toggle doesn't silently reset it.
 */
export async function toggleFlag(formData: FormData): Promise<void> {
  const principalId = await requirePrincipal();

  const key = String(formData.get("key") ?? "");
  const environment = String(formData.get("environment") ?? "");
  const nextEnabled = formData.get("next_enabled") === "true";
  const rolloutRaw = String(formData.get("rollout_percentage") ?? "");

  await upsertFeatureFlag({
    key,
    enabled: nextEnabled,
    environment,
    rolloutPercentage: rolloutRaw === "" ? undefined : Number(rolloutRaw),
    principalId,
  });

  revalidatePath("/admin/settings");
}
