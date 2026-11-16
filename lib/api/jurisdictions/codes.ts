// The case each kind of code has in jurisdiction-rules-svc. Some are upper
// case (payment terms, obligations), others lower case (deployment rings and
// regions, calendars, signing keys, rollout families, pack refs). A person
// may type either; the console sends the service's case, so "CANARY" and
// "canary" name the same ring instead of one of them being refused.
//
// The patterns mirror the service's validation and are used by the tests.

export const CODE_PATTERNS = {
  ring: /^[a-z0-9][a-z0-9._-]*$/,
  region: /^[a-z0-9][a-z0-9._-]*$/,
  calendar: /^[a-z0-9][a-z0-9._-]{1,63}$/,
  key: /^[a-z0-9][a-z0-9._:-]*$/,
  family: /^[a-z0-9][a-z0-9._-]{0,63}$/,
  pack: /^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/,
  term: /^[A-Z][A-Z0-9_]{1,31}$/,
  obligation: /^[A-Z][A-Z0-9_]{1,63}$/,
} as const;

export type CodeKind = keyof typeof CODE_PATTERNS;

const UPPER: ReadonlySet<CodeKind> = new Set(["term", "obligation"]);

/** A typed code in the case the service stores it (trimmed; undefined stays undefined). */
export function codeOf<T extends string | undefined>(kind: CodeKind, typed: T): T {
  if (typed === undefined) return typed;
  const v = typed.trim();
  return (UPPER.has(kind) ? v.toUpperCase() : v.toLowerCase()) as T;
}
