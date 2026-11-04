// Who a principal ID is, for display.
//
// The authorization registers name people by principal ID. Showing those raw
// is the single biggest reason an access screen is unreadable: an approver
// cannot tell "33333333-…" from "99999999-…", and an approval nobody can read
// is an approval nobody checked. The console's governed accounts are the
// people this deployment knows by name; anyone else is shown by a short ID
// with the full one a click away.

import { GOVERNED_USER_ACCOUNTS } from "@/lib/auth";

export type Person = {
  principalId: string;
  name: string;
  title: string;
  email: string;
  known: boolean;
};

const BY_ID = new Map(
  GOVERNED_USER_ACCOUNTS.map((u) => [
    u.principalId,
    { principalId: u.principalId, name: u.name, title: u.role, email: u.email, known: true } satisfies Person,
  ]),
);

/** A service principal written by a seed or a workload, not a person. */
const SYSTEM = /^(e2e-|it-|system|svc-|[a-z][a-z0-9-]*-svc$)/;

export function person(principalId: string | null | undefined): Person {
  const id = (principalId ?? "").trim();
  const hit = BY_ID.get(id);
  if (hit) return hit;
  if (SYSTEM.test(id)) return { principalId: id, name: "System", title: id, email: "", known: false };
  return { principalId: id, name: id ? `${id.slice(0, 8)}…` : "—", title: "", email: "", known: false };
}

/** Everyone the console knows, for pickers. */
export function directory(): Person[] {
  return [...BY_ID.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Initials for an avatar. */
export function initials(p: Person): string {
  if (!p.known) return "?";
  return p.name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
