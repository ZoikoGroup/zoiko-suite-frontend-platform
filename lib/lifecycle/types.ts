// What one lifecycle action (a transition after create) sends to its service.
// Pure types: imported by the catalog, the Server Action and the row buttons.

import type { ServiceName } from "@/lib/api/config";
import type { FieldSpec } from "@/components/admin/intelligence/create-state";

export type LifecycleMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export type LifecycleActionSpec = {
  /** The registered service the action is sent to. */
  service: ServiceName;
  /** The service's name, as shown in a refusal. */
  serviceLabel: string;
  method: LifecycleMethod;
  /** The service route. "{id}" is the record's id, "{sub}" an optional second id (e.g. a line item). */
  path: string;
  /** Button label. */
  label: string;
  /** The reader's inputs. Only these names are sent in the body; nothing else is. */
  fields?: FieldSpec[];
  /** Body fields with a fixed value for this action, e.g. a target status. Never identity. */
  fixed?: Record<string, string | number | boolean>;
  /**
   * Body fields that record who acted (e.g. "executed_by"). The Server Action
   * sets them to the session's principal; the reader never types them.
   */
  actorFields?: readonly string[];
  /** For a route without "{id}": the body field that carries the record's id instead. */
  idField?: string;
  /** Fields the reader types as JSON; sent as the parsed object, refused if not an object. */
  jsonFields?: readonly string[];
  /**
   * Select fields whose options the page supplies from a live list (e.g. other
   * records of the same register). The service validates the value; the
   * Server Action only checks it is an id.
   */
  dynamicFields?: readonly string[];
  /** Fields typed as comma- or newline-separated values; sent as a string array. */
  listFields?: readonly string[];
  /** A comma-separated field sent as the X-Evidence-Refs header instead of in the body. */
  evidenceRefsField?: string;
  /** Fields that must be UUIDs. */
  uuidFields?: readonly string[];
  /** Fields that must be given together or not at all, the first not after the second. */
  pairedDates?: readonly (readonly [string, string])[];
  /** A check on the reader's values before anything is sent; a message refuses the action. Pure. */
  validate?: (body: Record<string, unknown>) => string | null;
  /** Body reshaping the service needs (e.g. nesting a reference), applied last. Pure. */
  shape?: (body: Record<string, unknown>) => Record<string, unknown>;
  /** X-Purpose-Context, for services that refuse a write without one. */
  purposeContext?: string;
  /** The record statuses the service accepts this action from. Absent: always shown. */
  from?: readonly string[];
  /** Ask for a second click before sending (for irreversible actions). */
  confirm?: boolean;
  /** How the record's version is sent: If-Match "v<n>", If-Match "<n>", or X-Expected-Version. */
  version?: "if-match-v" | "if-match" | "expected-version";
  /** A destructive action is drawn in red. */
  danger?: boolean;
  /** One line under the form: what the action records, and what it does not do. */
  note?: string;
};

export type LifecycleResult = {
  ok: boolean;
  /** The service's HTTP status; absent when the request never reached it. */
  httpStatus?: number;
  message: string;
  /** The record's status after the action, as the service returned it. */
  status?: string;
};
