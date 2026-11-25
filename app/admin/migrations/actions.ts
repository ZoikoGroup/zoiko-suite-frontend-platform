"use server";

// Every action acts as the signed-in session. They used to accept the tenant,
// principal and legal entity from the browser (and fall back to a demo
// identity), so any signed-in user could read and write migration jobs as any
// tenant; a "QA suite" action also wrote jobs as two fixed tenants. Both are
// gone. The legal entity of a validation is the session's.

import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  getMigrationIntegrityHealth,
  validateMigration,
  listMigrationJobs,
  getMigrationJobById,
  remediateAuditEntry,
  archiveMigrationJob,
  type HeaderOptions,
  type RemediateInput,
  type ValidateMigrationRequest,
} from "@/lib/api/migration-integrity";

const UNAUTHENTICATED = { ok: false as const, status: 401, error: "Your session has expired — sign in again." };

async function sessionHeaders(): Promise<HeaderOptions | null> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId || !session.tenantId) return null;
  return { tenantId: session.tenantId, principalId: session.principalId, legalEntityId: session.legalEntityId };
}

export async function checkMigrationHealthAction() {
  return await getMigrationIntegrityHealth();
}

export async function validateMigrationAction(req: Omit<ValidateMigrationRequest, "legal_entity_id">) {
  const opts = await sessionHeaders();
  if (!opts) return { ok: false, status: 401, data: { error: UNAUTHENTICATED.error } };
  return await validateMigration({ ...req, legal_entity_id: opts.legalEntityId ?? "" }, opts);
}

export async function listMigrationJobsAction(filters: { status?: string } = {}) {
  const opts = await sessionHeaders();
  if (!opts) return { ...UNAUTHENTICATED, jobs: [], count: 0 };
  return await listMigrationJobs({ ...filters, legalEntityId: opts.legalEntityId }, opts);
}

export async function getMigrationJobByIdAction(id: string) {
  const opts = await sessionHeaders();
  if (!opts) return UNAUTHENTICATED;
  return await getMigrationJobById(id, opts);
}

export async function remediateAuditEntryAction(jobId: string, entryId: string, input: RemediateInput) {
  const opts = await sessionHeaders();
  if (!opts) return UNAUTHENTICATED;
  return await remediateAuditEntry(jobId, entryId, input, opts);
}

export async function archiveMigrationJobAction(id: string) {
  const opts = await sessionHeaders();
  if (!opts) return UNAUTHENTICATED;
  return await archiveMigrationJob(id, opts);
}
