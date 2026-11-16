// Shared contract between exception-actions.ts and the form that calls it.
// Outside the "use server" file, which may export only async functions.

import type { EscalatedException, ExceptionSeverity } from "@/lib/api/compliance";

export type ExceptionCreateState = {
  status: "idle" | "success" | "error";
  message: string;
  /** The case exception-escalation-svc returned. */
  record?: EscalatedException;
};

export const IDLE_EXCEPTION_STATE: ExceptionCreateState = { status: "idle", message: "" };

/** exception-escalation-svc's SeverityLevel values. */
export const EXCEPTION_SEVERITIES: readonly ExceptionSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
