"use server";

// One Server Action for every lifecycle transition on the Blocks 6-10 pages.
//
// The caller names an action from the catalog and the record it applies to.
// The service, route, method and the body's field names all come from the
// catalog, never from the caller, so a page cannot reach a route that is not
// listed there. Identity is the session's only; the reader's values fill only
// the fields the catalog lists for the action. A refusal is returned in the
// service's own words with its HTTP status.

import { refresh } from "next/cache";
import { sessionIdentity } from "@/app/admin/intelligence/create-support";
import { isUuid } from "@/lib/api/tenants";
import { apiDelete, apiPatch, apiPost, apiPut, type ApiWriteResult } from "@/lib/api/client";
import { LIFECYCLE_ACTIONS } from "@/lib/lifecycle/catalog";
import type { LifecycleResult } from "@/lib/lifecycle/types";
import { actionAvailable, enabledBackendReleases } from "@/lib/lifecycle/availability";

// Ids are UUIDs or service-generated keys; anything else would let a value
// change the route, so it is refused before a request is built.
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
// A date and time with its offset, as the row form sends it (converted from the
// reader's local time in the browser, so the server's timezone plays no part).
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** The status the service reports on the record it returned, under its usual names. */
function statusOf(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const top = data as Record<string, unknown>;
  // Some services wrap the record, e.g. {exception_case: {...}, escalation_record: {...}}.
  const wrapped = top.exception_case ?? top.assessment;
  const r = wrapped && typeof wrapped === "object" ? (wrapped as Record<string, unknown>) : top;
  for (const k of ["status", "state", "case_status", "lifecycle_status", "resolution_status", "approval_status", "due_diligence_status", "decision"]) {
    if (typeof r[k] === "string" && r[k]) return r[k] as string;
  }
  return undefined;
}

export async function runLifecycleAction(
  actionKey: string,
  recordId: string,
  values: Record<string, string>,
  version?: string | number,
  subId?: string,
): Promise<LifecycleResult> {
  const spec = Object.prototype.hasOwnProperty.call(LIFECYCLE_ACTIONS, actionKey) ? LIFECYCLE_ACTIONS[actionKey] : undefined;
  if (!spec) return { ok: false, message: `Unknown action ${actionKey}.` };
  if (!actionAvailable(spec, enabledBackendReleases())) {
    return { ok: false, message: `${spec.label} is not available: ${spec.serviceLabel} in this deployment does not serve it.` };
  }
  if (!ID_RE.test(recordId)) return { ok: false, message: "The record id is not valid." };
  if (spec.path.includes("{sub}") && !(subId && ID_RE.test(subId))) return { ok: false, message: "Choose the item this action applies to." };

  // The shared check: a session must carry tenant, principal and legal entity.
  const identity = await sessionIdentity();
  if (!identity) return { ok: false, message: "Your session has expired or is incomplete — sign in again." };

  const body: Record<string, unknown> = {};
  let evidenceRefs: string[] | undefined;
  for (const f of spec.fields ?? []) {
    const raw = String(values?.[f.name] ?? "").trim();
    if (f.name === spec.evidenceRefsField) {
      const refs = raw.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
      if (f.required && refs.length === 0) return { ok: false, message: `${f.label} is required.` };
      if (refs.length) evidenceRefs = refs;
      continue;
    }
    if (f.kind === "checkbox") {
      body[f.name] = raw === "on" || raw === "true";
      continue;
    }
    if (!raw) {
      if (f.required) return { ok: false, message: `${f.label} is required.` };
      continue;
    }
    if (spec.dynamicFields?.includes(f.name)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,160}$/.test(raw)) return { ok: false, message: `${f.label}: choose one from the list.` };
      body[f.name] = raw;
      continue;
    }
    if (spec.uuidFields?.includes(f.name) && !isUuid(raw)) return { ok: false, message: `${f.label} must be a UUID.` };
    if (spec.listFields?.includes(f.name)) {
      body[f.name] = raw.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
      continue;
    }
    if (f.kind === "datetime-local") {
      if (!ISO_WITH_OFFSET.test(raw) || Number.isNaN(new Date(raw).getTime())) {
        return { ok: false, message: `${f.label} must be a date and time.` };
      }
      body[f.name] = new Date(raw).toISOString();
      continue;
    }
    if (f.kind === "select" && f.options && !f.options.some((o) => o.value === raw)) {
      return { ok: false, message: `${f.label}: choose one of the listed values.` };
    }
    if (spec.jsonFields?.includes(f.name)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { ok: false, message: `${f.label} must be JSON.` };
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, message: `${f.label} must be a JSON object.` };
      body[f.name] = parsed;
      continue;
    }
    if (f.kind === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { ok: false, message: `${f.label} must be a number.` };
      if (f.step === "1" && !Number.isInteger(n)) return { ok: false, message: `${f.label} must be a whole number.` };
      if (f.min !== undefined && n < Number(f.min)) return { ok: false, message: `${f.label} must be at least ${f.min}.` };
      if (f.max !== undefined && n > Number(f.max)) return { ok: false, message: `${f.label} must be at most ${f.max}.` };
      body[f.name] = n;
      continue;
    }
    body[f.name] = raw;
  }
  const invalidReason = spec.validate?.(body);
  if (invalidReason) return { ok: false, message: invalidReason };
  Object.assign(body, spec.fixed ?? {});
  if (spec.idField) body[spec.idField] = recordId;
  for (const [a, b] of spec.pairedDates ?? []) {
    const has = (k: string) => body[k] !== undefined;
    if (has(a) !== has(b)) return { ok: false, message: "Give both dates of the period, or neither." };
    if (has(a) && String(body[a]) > String(body[b])) return { ok: false, message: "The period must not end before it starts." };
  }
  for (const f of spec.actorFields ?? []) {
    if (!identity.principalId) return { ok: false, message: "Your session has no principal; sign in again." };
    body[f] = identity.principalId;
  }

  const sent = spec.shape ? spec.shape(body) : body;
  const v = version === undefined || version === null || version === "" ? undefined : String(version);
  if (spec.version && !v) return { ok: false, message: "The record's version is unknown; refresh the list and try again." };
  const options = {
    identity,
    ...(spec.purposeContext ? { purposeContext: spec.purposeContext } : {}),
    ...(evidenceRefs ? { evidenceRefs } : {}),
    ...(spec.version === "if-match-v" && v ? { ifMatch: `"v${v.replace(/^v/, "")}"` } : {}),
    ...(spec.version === "if-match" && v ? { ifMatch: `"${v}"` } : {}),
    ...(spec.version === "expected-version" && v ? { expectedVersion: v } : {}),
  };

  const path = spec.path
    .replace("{id}", encodeURIComponent(recordId))
    .replace("{sub}", encodeURIComponent(subId ?? ""));

  let res: ApiWriteResult<unknown>;
  switch (spec.method) {
    case "POST":
      res = await apiPost<unknown>(spec.service, path, sent, options);
      break;
    case "PUT":
      res = await apiPut<unknown>(spec.service, path, sent, options);
      break;
    case "PATCH":
      res = await apiPatch<unknown>(spec.service, path, sent, options);
      break;
    case "DELETE":
      res = await apiDelete<unknown>(spec.service, path, { ...options, ...(Object.keys(sent).length ? { data: sent } : {}) });
      break;
  }
  if (!res.ok) {
    return { ok: false, httpStatus: res.error.status || undefined, message: res.error.message };
  }

  refresh();
  const status = statusOf(res.data);
  return {
    ok: true,
    httpStatus: res.status,
    status,
    message: `${spec.label}: ${spec.serviceLabel} accepted it${status ? ` — now ${status}` : ""}.`,
  };
}
