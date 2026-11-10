"use server";

// Server Actions that CREATE records in obligation-tracking-svc,
// counterparty-management-svc and corporate-actions-svc.
//
// legal_entity_id and created_by are the session's: lib/api/legal.ts sets both
// from the identity resolved here, and the services refuse a created_by that is
// not the calling principal. Every other value is the reader's; nothing is
// defaulted. A refusal is returned as the service sent it, with its status.
//
// Required-field checks the services make themselves (title, name) are left to
// them, so the reader sees the service's own refusal; the console checks only
// what the services do not: enum values, date formats, jurisdiction ids.

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import type { ApiError } from "@/lib/api/client";
import {
  createObligation,
  createCounterparty,
  createCorporateAction,
  OBLIGATION_SOURCE_TYPES,
  RISK_LEVELS,
  COUNTERPARTY_TYPES,
  RISK_CATEGORIES,
  CORPORATE_ACTION_TYPES,
  type Obligation,
  type Counterparty,
  type CorporateAction,
  type ObligationSourceType,
  type RiskLevel,
  type CounterpartyType,
  type RiskCategory,
} from "@/lib/api/legal";
import type { LegalCreateState } from "./state";

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

type Failure = { status: "error"; message: string };
const EXPIRED: Failure = { status: "error", message: "Your session has expired — sign in again." };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const fail = (message: string): Failure => ({ status: "error", message });
const oneOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/** The shared client's message already names the service, the status and its detail. */
function refusal(error: ApiError): Failure {
  return { status: "error", message: error.message };
}

/**
 * Record a contract-derived obligation. obligation-tracking-svc accepts only
 * CONTRACTUAL obligations sourced from a CONTRACT or CLAUSE, and lands them
 * PLANNED.
 */
export async function createObligationAction(
  _prev: LegalCreateState<Obligation>,
  fd: FormData,
): Promise<LegalCreateState<Obligation>> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const sourceType = text(fd, "source_type");
  const sourceId = text(fd, "source_id");
  const title = text(fd, "title");
  const description = text(fd, "description");
  const riskLevel = text(fd, "risk_level");
  const dueDate = text(fd, "due_date");
  const assignedTo = text(fd, "assigned_to");
  const effectiveFrom = text(fd, "effective_from");
  const effectiveTo = text(fd, "effective_to");

  if (!oneOf<ObligationSourceType>(OBLIGATION_SOURCE_TYPES, sourceType)) return fail("Choose whether the source is a contract or a clause.");
  if (!sourceId) return fail("The source contract or clause ID is required.");
  if (!oneOf<RiskLevel>(RISK_LEVELS, riskLevel)) return fail("Choose a risk level.");
  if (!DATE_RE.test(dueDate)) return fail("The due date is required.");
  if (!DATE_RE.test(effectiveFrom)) return fail("The effective-from date is required.");
  if (effectiveTo && (!DATE_RE.test(effectiveTo) || effectiveTo < effectiveFrom)) {
    return fail("The effective-to date must be on or after the effective-from date.");
  }

  const res = await createObligation(
    {
      source_type: sourceType,
      source_id: sourceId,
      title,
      ...(description ? { description } : {}),
      obligation_type: "CONTRACTUAL",
      risk_level: riskLevel,
      due_date: dueDate,
      ...(assignedTo ? { assigned_to: assignedTo } : {}),
      effective_from: effectiveFrom,
      ...(effectiveTo ? { effective_to: effectiveTo } : {}),
    },
    identity,
  );
  if (!res.ok) return refusal(res.error);

  refresh();
  const o = res.data;
  return { status: "success", message: `Obligation ${o.obligation_id} recorded as ${o.status}.`, record: o };
}

/** Register a counterparty. counterparty-management-svc lands it ONBOARDING, compliance PENDING. */
export async function createCounterpartyAction(
  _prev: LegalCreateState<Counterparty>,
  fd: FormData,
): Promise<LegalCreateState<Counterparty>> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const name = text(fd, "name");
  const type = text(fd, "counterparty_type");
  const jurisdictionId = text(fd, "jurisdiction_id");
  const effectiveFrom = text(fd, "effective_from");
  const risk = text(fd, "risk_category");
  const optional = {
    registration_number: text(fd, "registration_number"),
    tax_id: text(fd, "tax_id"),
    contact_email: text(fd, "contact_email"),
    phone: text(fd, "phone"),
    address: text(fd, "address"),
  };

  if (!oneOf<CounterpartyType>(COUNTERPARTY_TYPES, type)) return fail("Choose a counterparty type.");
  if (!UUID_RE.test(jurisdictionId)) return fail("Choose a jurisdiction from the register.");
  if (risk && !oneOf<RiskCategory>(RISK_CATEGORIES, risk)) return fail("Choose a risk category.");
  if (!DATE_RE.test(effectiveFrom)) return fail("The effective-from date is required.");
  if (optional.contact_email && !EMAIL_RE.test(optional.contact_email)) return fail("The contact email is not an email address.");

  const res = await createCounterparty(
    {
      name,
      counterparty_type: type,
      jurisdiction_id: jurisdictionId,
      effective_from: effectiveFrom,
      ...(risk ? { risk_category: risk as RiskCategory } : {}),
      ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v)),
    },
    identity,
  );
  if (!res.ok) return refusal(res.error);

  refresh();
  const c = res.data;
  return {
    status: "success",
    message: `Counterparty ${c.counterparty_id} registered as ${c.status}, compliance ${c.compliance_status}.`,
    record: c,
  };
}

/** Propose a corporate action. corporate-actions-svc lands it PROPOSED. */
export async function createCorporateActionAction(
  _prev: LegalCreateState<CorporateAction>,
  fd: FormData,
): Promise<LegalCreateState<CorporateAction>> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return EXPIRED;
  }

  const title = text(fd, "title");
  const actionType = text(fd, "action_type");
  const effectiveDate = text(fd, "effective_date");
  const description = text(fd, "description");
  const resolutionId = text(fd, "resolution_id");

  if (!oneOf(CORPORATE_ACTION_TYPES, actionType)) return fail("Choose an action type.");
  if (!DATE_RE.test(effectiveDate)) return fail("The effective date is required.");

  const res = await createCorporateAction(
    {
      title,
      action_type: actionType,
      effective_date: effectiveDate,
      ...(description ? { description } : {}),
      ...(resolutionId ? { resolution_id: resolutionId } : {}),
    },
    identity,
  );
  if (!res.ok) return refusal(res.error);

  refresh();
  const a = res.data;
  return { status: "success", message: `Corporate action ${a.action_id} recorded as ${a.status}.`, record: a };
}
