// Shared contract between the flag Server Action and the form that calls it.
//
// This lives outside actions.ts deliberately: a "use server" file may only
// export async functions, so the initial-state constant cannot live there.

export type FlagActionState = {
  status: "idle" | "created" | "unchanged" | "error";
  message: string;
  /** Echoed back so the UI can name what was acted on. */
  key?: string;
};

export const IDLE_STATE: FlagActionState = { status: "idle", message: "" };
