"use server";

// Server Actions for schema-registry-svc (:8093).
//
// Server Actions are reachable by direct POST, so the session is verified
// inside the action rather than relying on the proxy's /admin matcher.
//
// This service enforces identity and authorization properly, and these
// actions are written against what it actually does rather than assuming:
//
//  - No verified principal is 401; no SCHEMA_PUBLISH grant is 403; an
//    unreachable authorization-svc is 503 and nothing is written.
//  - A 409 is two different facts — an incompatible schema, or a lost version
//    race — and they are reported apart because the reader's next step differs.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import type { LookupState } from "@/components/admin/shared";
import {
  isValidEventName,
  parseViolations,
  registerVersion,
  explainSchemaError,
  describeCompatibilityMode,
  getLatest,
  listVersions,
  COMPATIBILITY_MODES,
  MAX_VERSION_PAGE,
} from "@/lib/api/schemas";
import { IDLE_REGISTER_SCHEMA, type ContractReport, type RegisterSchemaState } from "./state";

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

export async function registerSchemaAction(
  _prev: RegisterSchemaState,
  formData: FormData,
): Promise<RegisterSchemaState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_REGISTER_SCHEMA, status: "error", message: "Your session has expired — sign in again." };
  }

  const eventName = String(formData.get("event_name") ?? "").trim();
  if (!isValidEventName(eventName)) {
    return {
      status: "error",
      message:
        "Event names are dotted lowercase tokens, like entity.status.changed. The registry enforces this too — it is the primary key of a canonical register, and a name that does not match what publishers actually emit would create an entry nothing ever satisfies.",
    };
  }

  const rawSchema = String(formData.get("json_schema") ?? "").trim();
  if (!rawSchema) {
    return { status: "error", message: "A JSON Schema is required." };
  }

  let parsedSchema: unknown;
  try {
    parsedSchema = JSON.parse(rawSchema);
  } catch (cause) {
    return {
      status: "error",
      message: `That is not valid JSON — ${(cause as Error).message}. Checked here so a syntax error does not travel to the service as a generic 400.`,
    };
  }
  if (typeof parsedSchema !== "object" || parsedSchema === null || Array.isArray(parsedSchema)) {
    return {
      status: "error",
      message: "A JSON Schema must be an object. The compatibility checker reads its `properties` and `required` keys.",
    };
  }
  // `{}` parses, is an object, and constrains nothing. The registry refuses it
  // too — a contract that permits every payload is not a contract, and one
  // stored as the first version of an event cannot be usefully evolved.
  if (Object.keys(parsedSchema as Record<string, unknown>).length === 0) {
    return {
      status: "error",
      message:
        "An empty object declares no contract at all. Give the schema at least a `properties` map, so there is something for the compatibility checker to hold future versions to.",
    };
  }

  const mode = String(formData.get("compatibility_mode") ?? "BACKWARD");
  if (!(COMPATIBILITY_MODES as readonly string[]).includes(mode)) {
    return { status: "error", message: `${mode} is not a mode this registry can enforce.` };
  }

  const result = await registerVersion(
    eventName,
    {
      json_schema: parsedSchema,
      compatibility_mode: mode,
      owning_service: String(formData.get("owning_service") ?? "").trim() || undefined,
    },
    identity,
  );

  if (!result.ok) {
    const { status, message } = result.error;
    const error = result.error;

    if (status === 401) {
      return {
        status: "unauthenticated",
        message:
          "The registry could not tell who was asking. The console does send your identity, so this points at a wiring problem between the two rather than at your permissions. Nothing was written.",
      };
    }
    if (status === 403) {
      return {
        status: "unauthorized",
        message:
          "Your account does not have permission to publish event contracts, so nothing was registered. Contracts are governed, not self-served — ask whoever administers permissions to grant it. The permission is recorded as SCHEMA_PUBLISH, which is the name to quote when asking.",
      };
    }
    if (status === 503) {
      return {
        status: "unavailable",
        message:
          "The registry could not confirm your permission, or could not reach its own store, so it refused rather than guessing. Nothing was written — nothing to undo, and worth trying again shortly.",
      };
    }
    if (status === 409) {
      // Two different 409s. A race message tells the reader to retry; a
      // compatibility failure tells them to change the schema. Distinguished
      // on the violations the service returns rather than on wording alone.
      const violations = parseViolations(error);
      if (violations.length > 0) {
        return {
          status: "incompatible",
          violations,
          message:
            "This version would break whoever already reads this event, so it was refused and nothing was registered. Each item below names the field that broke and what to do instead. Adding an optional field is always safe; dropping a compulsory one, or changing the kind of value a field carries, is not.",
        };
      }
      return {
        status: "raced",
        message:
          "Another registration claimed this version while yours was being checked. Nothing was written. Re-read the latest version and resubmit — your schema was validated against a version that is no longer current, so it needs checking again rather than simply retrying.",
      };
    }
    return { status: "error", message: explainSchemaError(message) };
  }

  // refresh(), not revalidatePath: nothing on this route is cached — every
  // panel reads cookies() for the session — so there was no cache to
  // invalidate, while in a Server Function revalidatePath additionally
  // refreshes every previously visited page. Same migration as the other
  // console routes.
  refresh();
  // The outcome in the reader's own terms. The mode is not interpolated as a
  // code — "registered under NONE" tells whoever just did it nothing about what
  // they did. The code itself is still on screen: the summary rendered below
  // this message carries it under the label, as everywhere else in the console.
  // A first version is not compared with anything, whatever mode it declares —
  // so the confirmation cannot claim a comparison. Same distinction the badge
  // and the register make; stating it here too because this sentence is the
  // one the person who just registered actually reads.
  const first = result.data.version <= 1;
  const checked = describeCompatibilityMode(result.data.compatibility_mode).checked;
  return {
    status: "registered",
    schema: result.data,
    message:
      `Registered as version ${result.data.version} of ${result.data.event_name}. ` +
      (first
        ? "Being the first version, it was not compared with anything — there was nothing to compare it with. Each later version declares for itself whether it is checked against the one before it."
        : checked
          ? "It was compared with the version before it, and nothing in it would break anyone already reading this event."
          : "It was not compared with the version before it, and the register now shows this version as one that went in unchecked.") +
      " Nothing here can be edited or deleted afterwards — a later change adds the next version instead.",
  };
}

/**
 * "Type an event name, read its contract."
 *
 * The register lists every event and its current version, and until this
 * existed there was no way to see what any of those contracts actually says —
 * the only readable answer was to fetch the schema and read the JSON. This
 * composes the two reads that answer the question together: the current
 * contract, and the versions behind it.
 *
 * A malformed name is refused here rather than sent. The service answers 404
 * for an unregisterable name, which is truthful and reads as "no such
 * contract" — sending the reader to look for an event that could never have
 * been registered under the name they typed.
 */
export async function lookupContract(
  _previous: LookupState<ContractReport>,
  formData: FormData,
): Promise<LookupState<ContractReport>> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Your session has expired — sign in again." };
  }

  const eventName = String(formData.get("event_name") ?? "").trim();
  if (!eventName) return { status: "error", message: "Enter an event name." };
  if (!isValidEventName(eventName)) {
    return {
      status: "error",
      message:
        "Event names are dotted lowercase tokens, like entity.status.changed. Nothing can be registered under any other spelling, so nothing can be found under one either.",
    };
  }

  const latest = await getLatest(eventName, identity);
  if (!latest.ok) {
    if (latest.error.status === 404) {
      return {
        status: "missing",
        message:
          "No event is registered under that name. Names are exact and case-sensitive, and an event with no registered version does not appear in the register at all.",
      };
    }
    return { status: "error", message: explainSchemaError(latest.error.message) };
  }

  // The history is read as the window ending at the current version, so a long
  // history shows its most recent versions rather than its founding ones.
  // Versions are numbered from 1 and assigned consecutively by the registry,
  // which is what makes the offset computable without a count endpoint.
  const offset = Math.max(0, latest.data.version - MAX_VERSION_PAGE);
  const history = await listVersions(eventName, identity, { limit: MAX_VERSION_PAGE, offset });

  if (!history.ok) {
    // A failed history read must not hide the contract that was read fine.
    return {
      status: "found",
      record: { latest: latest.data, versions: [], truncated: false },
      message:
        "The current contract was read. Its earlier versions could not be read just now, so no history is shown — the contract below is unaffected.",
    };
  }

  return {
    status: "found",
    record: { latest: latest.data, versions: history.data, truncated: offset > 0 },
    message: "",
  };
}
