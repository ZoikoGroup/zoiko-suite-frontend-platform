// Shared contract between the flag Server Action and the form that calls it.
//
// This lives outside actions.ts deliberately: a "use server" file may only
// export async functions, so the initial-state constant cannot live there.

import type { ConfigEntry, FeatureFlag } from "@/lib/api/configuration";

export type FlagActionState = {
  status: "idle" | "created" | "unchanged" | "error";
  message: string;
  /** Echoed back so the UI can name what was acted on. */
  key?: string;
  /**
   * The version the service actually recorded, so the form can read it back in
   * plain English instead of asserting what it thinks it wrote.
   *
   * It is the service that decides the effective-from stamp, the rollout default
   * when none was sent, and whether the write was a transition at all — so the
   * only honest confirmation is the row that came back, not an echo of the form.
   */
  flag?: FeatureFlag;
};

export const IDLE_STATE: FlagActionState = { status: "idle", message: "" };

/** Config entries use the same three outcomes as flags — 201 for a real change,
 *  200 for a value that already matched — so they share the state shape, with
 *  the recorded row typed for their own resource. */
export type ConfigActionState = Omit<FlagActionState, "flag"> & {
  entry?: ConfigEntry;
};

export const IDLE_CONFIG_STATE: ConfigActionState = { status: "idle", message: "" };
