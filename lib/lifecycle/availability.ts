// Which backend releases this deployment's services include, so a lifecycle
// action whose route exists only in a later release is offered (and sent) only
// where the backend serves it.
//
// ZOIKO_BACKEND_RELEASES is a comma-separated server setting, read at runtime.
// Empty (the default) means backend main: actions tagged with a release stay
// hidden and are refused. A deployment running the Blocks 6-10 backend
// (fix/blocks-6-10-final, as the zv verification stack does) sets
// ZOIKO_BACKEND_RELEASES=blocks-6-10-final.

import type { LifecycleActionSpec } from "./types";

export const BACKEND_RELEASES = ["blocks-6-10-final"] as const;
export type BackendRelease = (typeof BACKEND_RELEASES)[number];

/** The releases this server is configured with. Server-side only. */
export function enabledBackendReleases(): BackendRelease[] {
  return (process.env.ZOIKO_BACKEND_RELEASES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is BackendRelease => (BACKEND_RELEASES as readonly string[]).includes(s));
}

/** Whether an action's route is served, given the enabled releases. */
export function actionAvailable(spec: Pick<LifecycleActionSpec, "backendRelease">, enabled: readonly string[]): boolean {
  return !spec.backendRelease || enabled.includes(spec.backendRelease);
}
