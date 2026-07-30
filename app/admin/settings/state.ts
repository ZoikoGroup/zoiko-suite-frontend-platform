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

/** Config entries use the same three outcomes as flags — 201 for a real change,
 *  200 for a value that already matched — so they share the state shape. */
export type ConfigActionState = FlagActionState;

export const IDLE_CONFIG_STATE: ConfigActionState = { status: "idle", message: "" };
