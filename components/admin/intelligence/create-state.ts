// The state a create form's Server Action returns, and the description of its
// fields. Pure types and constants: imported by the Server Actions and by the
// client form alike.

/** One label/value pair of the record the service returned. */
export type RecordField = [label: string, value: string];

export type CreateState =
  | { status: "idle"; seq: number }
  | {
      status: "created";
      seq: number;
      /** The HTTP status the service answered (201, or 200 for a replay). */
      httpStatus: number;
      message: string;
      /** The record as the service returned it: id and status first. */
      fields: RecordField[];
    }
  | {
      status: "error";
      seq: number;
      /** The service's HTTP status; absent when the request never reached it or the form was incomplete. */
      httpStatus?: number;
      message: string;
      /** What the reader entered, so a refusal does not clear the form. Secrets are never echoed. */
      values: Record<string, string>;
    };

export const IDLE: CreateState = { status: "idle", seq: 0 };

export type FieldOption = { value: string; label: string };

export type FieldSpec = {
  name: string;
  label: string;
  kind: "text" | "number" | "date" | "select" | "checkbox" | "textarea" | "password" | "hidden" | "url" | "email";
  required?: boolean;
  options?: FieldOption[];
  hint?: string;
  placeholder?: string;
  /** Only for a value that is genuinely the caller's (e.g. the sender's own name) or a hidden reference. */
  initial?: string;
  step?: string;
};

/** Options from enum values, shown as they are sent. */
export const opts = (...values: string[]): FieldOption[] => values.map((v) => ({ value: v, label: v }));
