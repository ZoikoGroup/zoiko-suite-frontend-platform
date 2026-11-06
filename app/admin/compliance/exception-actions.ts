"use server";

// Raise a compliance exception case in exception-escalation-svc.
//
// The legal entity and created_by are the session's (createEscalatedException
// sets both from the identity); the service refuses a created_by that is not
// the calling principal. Everything else is the reader's, and a refusal is
// returned as the service sent it.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import { createEscalatedException, type ExceptionSeverity } from "@/lib/api/compliance";
import { EXCEPTION_SEVERITIES, type ExceptionCreateState } from "./exception-state";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
    envelopeJwt: session.envelopeJwt,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message: string): ExceptionCreateState => ({ status: "error", message });

export async function createExceptionAction(
  _prev: ExceptionCreateState,
  fd: FormData,
): Promise<ExceptionCreateState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return fail("Your session has expired — sign in again.");
  }

  const text = (k: string) => String(fd.get(k) ?? "").trim();
  const jurisdictionId = text("jurisdiction_id");
  const exceptionType = text("exception_type");
  const severity = text("severity_level");
  const linkedObjectType = text("linked_object_type");
  const linkedObjectId = text("linked_object_id");
  const description = text("description");
  const assignedToRole = text("assigned_to_role");

  if (!UUID_RE.test(jurisdictionId)) return fail("Choose a jurisdiction from the register.");
  // exception_type and the linked record are required by exception-escalation-svc,
  // which refuses them empty in its own words; that refusal is shown as sent.
  if (!(EXCEPTION_SEVERITIES as readonly string[]).includes(severity)) return fail("Choose a severity.");
  if (!description) return fail("A description is required.");

  const res = await createEscalatedException({
    identity,
    jurisdictionId,
    exceptionType,
    severityLevel: severity as ExceptionSeverity,
    linkedObjectType,
    linkedObjectId,
    description,
    ...(assignedToRole ? { assignedToRole } : {}),
  });
  if (!res.ok) {
    // The shared client's message names the service, the status and its detail.
    return fail(res.error.message);
  }

  refresh();
  const c = res.data;
  return {
    status: "success",
    message: `Exception case ${c.exception_case_id} opened as ${c.case_status}.`,
    record: c,
  };
}
