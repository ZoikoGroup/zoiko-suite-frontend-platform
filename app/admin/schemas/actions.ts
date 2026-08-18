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
import {
  isValidEventName,
  parseViolations,
  registerVersion,
  explainSchemaError,
  COMPATIBILITY_MODES,
} from "@/lib/api/schemas";
import { IDLE_REGISTER_SCHEMA, type RegisterSchemaState } from "./state";

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
          "The registry received no verified principal. The console sends one, so this points at gateway or service wiring rather than your permissions.",
      };
    }
    if (status === 403) {
      return {
        status: "unauthorized",
        message:
          "authorization-svc refused this publication. Your principal needs the SCHEMA_PUBLISH grant — event contracts are governed, not self-served.",
      };
    }
    if (status === 503) {
      return {
        status: "unavailable",
        message:
          "The registry could not obtain an authorization decision or reach its store, so it refused rather than guessing. Nothing was written.",
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
            "This schema would break existing consumers of the current version, so it was refused. Each violation below names the field that broke. Adding an optional field is always safe; removing a required one, or changing a type, is not.",
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
  return {
    status: "registered",
    schema: result.data,
    message:
      `Registered ${result.data.event_name} v${result.data.version} under ${result.data.compatibility_mode}. ` +
      (result.data.compatibility_mode === "NONE"
        ? "Compatibility was not checked — this version is recorded as exempt, and that exemption is visible in the register."
        : "It is a backward-compatible evolution of the previous version.") +
      " Versions are immutable: this one can never be edited or removed, only superseded.",
  };
}
