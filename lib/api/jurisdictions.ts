// jurisdiction-rules-svc (:8082) — read-only, and only for one purpose.
//
// obligations-svc validates jurisdiction_id against this service on the write
// path and FAILS CLOSED: an unknown id is 404 `jurisdiction_not_found`, and an
// unreachable jurisdiction-rules-svc is 503 `jurisdiction_service_unavailable`
// rather than a silently accepted obligation. Verified live — both branches
// reproduce.
//
// That is why the console reads this register at all. Without it the raise form
// would need a free-text UUID field, and every value a human typed would come
// back 404. The picker is not decoration; it is the difference between a usable
// form and a guessing game.
//
// Deliberately NOT a full client for this service. It owns rules, rule versions,
// and effective-dating that nothing on the obligations page consumes, and
// wrapping endpoints nobody calls would imply a coverage this console does not
// have.

import { apiGet, type ApiResult } from "./client";

/** Wire shape. Field names match the Go json tags exactly. */
export type Jurisdiction = {
  jurisdiction_id: string;
  jurisdiction_code: string;
  jurisdiction_name: string;
  jurisdiction_type: string;
  parent_jurisdiction_id: string | null;
  authority_type: string;
  effective_from: string;
  effective_to: string | null;
  active_flag: boolean;
  created_at: string;
  created_by_principal_id: string;
};

/**
 * List jurisdictions for the picker, active ones first then by code.
 *
 * Inactive rows are kept rather than filtered out: obligations-svc's validator
 * only checks that the id resolves to 200, so an obligation CAN be bound to an
 * inactive jurisdiction and the console should be able to show that rather than
 * pretend the row does not exist. The form labels them instead.
 */
export async function listJurisdictions(): Promise<ApiResult<Jurisdiction[]>> {
  const result = await apiGet<Jurisdiction[]>("jurisdictionRules", "/v1/jurisdictions");

  if (!result.ok) return result;

  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: "jurisdiction-rules-svc returned a non-array jurisdiction list",
      },
    };
  }

  return {
    ok: true,
    data: [...result.data].sort((a, b) => {
      if (a.active_flag !== b.active_flag) return a.active_flag ? -1 : 1;
      return a.jurisdiction_code.localeCompare(b.jurisdiction_code);
    }),
  };
}

/** "United Kingdom (GB)" — what a picker option should read as. */
export function describeJurisdiction(jurisdiction: Jurisdiction): string {
  const label = `${jurisdiction.jurisdiction_name} (${jurisdiction.jurisdiction_code})`;
  return jurisdiction.active_flag ? label : `${label} — inactive`;
}

/**
 * Resolve ids to codes for the register.
 *
 * An obligation stores only the jurisdiction UUID, so a register that rendered it
 * raw would show a column of indistinguishable UUIDs. Unresolved ids are left to
 * the caller to render as the id, not dropped.
 */
export function jurisdictionCodesById(
  jurisdictions: Jurisdiction[],
): Map<string, string> {
  return new Map(jurisdictions.map((j) => [j.jurisdiction_id, j.jurisdiction_code]));
}
