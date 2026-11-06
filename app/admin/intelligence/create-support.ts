// Server-side helpers for the Blocks 8-10 create actions
// (app/admin/{intelligence,security,integration}/actions.ts and the tax
// authority form).
//
// Identity is the session's and nothing else: a form never carries a tenant,
// principal or legal entity. Required fields are checked here and refused with
// a message rather than defaulted, and a service's refusal is returned as the
// service gave it, with its HTTP status.

import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, toIdentity, type SessionIdentity } from "@/lib/auth";
import type { ApiError, ApiWriteResult } from "@/lib/api/client";
import type { CreateState, RecordField } from "@/components/admin/intelligence/create-state";

export async function sessionIdentity(): Promise<SessionIdentity | null> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email || !session.tenantId || !session.principalId || !session.legalEntityId) return null;
  return toIdentity(session);
}

export const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
export const checked = (fd: FormData, name: string) => fd.get(name) === "on";

/** Comma- or newline-separated values, blanks dropped. */
export const listOf = (fd: FormData, name: string) =>
  text(fd, name)
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** A number the reader typed, or undefined when the field is blank. NaN when it is not a number. */
export function numberOf(fd: FormData, name: string): number | undefined {
  const raw = text(fd, name);
  if (raw === "") return undefined;
  return Number(raw);
}

/** Everything the reader entered, minus secrets, so a refusal does not clear the form. */
export function echo(fd: FormData, secret: string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string" || k.startsWith("$") || secret.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

export const nextSeq = (previous: CreateState) => previous.seq + 1;

export function expired(previous: CreateState, fd: FormData, secret: string[] = []): CreateState {
  return {
    status: "error",
    seq: nextSeq(previous),
    httpStatus: 401,
    message: "Your session has expired — sign in again.",
    values: echo(fd, secret),
  };
}

/**
 * The first missing required field, as a refusal, or null when all are there.
 * `numbers` are also checked to be finite.
 */
export function missing(
  previous: CreateState,
  fd: FormData,
  required: [name: string, label: string][],
  numbers: [name: string, label: string][] = [],
  secret: string[] = [],
): CreateState | null {
  for (const [name, label] of required) {
    if (text(fd, name) === "") {
      return { status: "error", seq: nextSeq(previous), message: `${label} is required.`, values: echo(fd, secret) };
    }
  }
  for (const [name, label] of numbers) {
    const v = numberOf(fd, name);
    if (v !== undefined && !Number.isFinite(v)) {
      return { status: "error", seq: nextSeq(previous), message: `${label} must be a number.`, values: echo(fd, secret) };
    }
  }
  return null;
}

export function invalid(previous: CreateState, fd: FormData, message: string, secret: string[] = []): CreateState {
  return { status: "error", seq: nextSeq(previous), message, values: echo(fd, secret) };
}

/**
 * The service's refusal as it gave it. The client folds error/detail/message
 * into one line; a per-field `errors` list (RFC 9457 extensions) is appended
 * so a validation failure names the field, not only "request body failed
 * validation".
 */
export function describeError(error: ApiError): string {
  const body = error.body as { errors?: unknown } | undefined;
  const items = Array.isArray(body?.errors) ? (body!.errors as Record<string, unknown>[]) : [];
  const details = items
    .map((e) => {
      const where = String(e.pointer ?? e.field ?? "").replace(/^[#/]+/, "");
      const what = String(e.detail ?? e.reason ?? e.message ?? "");
      return [where, what].filter(Boolean).join(": ");
    })
    .filter((d) => d && !error.message.includes(d));
  return details.length ? `${error.message} (${details.join("; ")})` : error.message;
}

/** A write's result as form state: the record the service returned, or its refusal verbatim. */
export function toState<T>(
  previous: CreateState,
  fd: FormData,
  res: ApiWriteResult<T>,
  service: string,
  summarize: (data: T) => RecordField[],
  secret: string[] = [],
): CreateState {
  if (!res.ok) {
    return {
      status: "error",
      seq: nextSeq(previous),
      httpStatus: res.error.status,
      message: describeError(res.error),
      values: echo(fd, secret),
    };
  }
  return {
    status: "created",
    seq: nextSeq(previous),
    httpStatus: res.status,
    message:
      res.status === 201
        ? `${service} recorded it.`
        : `${service} answered ${res.status}: it recognised the request and wrote nothing new.`,
    fields: summarize(res.data).filter(([, v]) => v !== ""),
  };
}

/** A field of a returned record as display text ("" when absent, so it is left out). */
export const show = (v: unknown): string => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
