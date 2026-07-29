// obligations-svc (:8088) — the statutory / regulatory obligation registry.
//
// Contract: GET /v1/obligations returns a JSON array of obligations.

import { apiGet, type ApiResult } from "./client";

/** Wire shape from the backend. Field names match the Go json tags exactly. */
export type Obligation = {
  obligation_id: string;
  legal_entity_id: string;
  jurisdiction_id: string;
  obligation_source_type: string;
  obligation_source_id: string;
  obligation_code: string;
  obligation_type: string;
  obligation_status: string;
  due_date: string;
  severity_level: string;
  responsible_function: string;
  source_reference: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type UpcomingObligation = {
  id: string;
  title: string;
  entity: string;
  dueInDays: number;
  overdue: boolean;
};

/**
 * Fetch obligations, sorted soonest-due first and mapped for the UI.
 *
 * The backend has no due-date sort or "upcoming only" filter, so ordering and
 * the closed-obligation filter happen here.
 */
export async function listUpcomingObligations(
  limit = 5,
): Promise<ApiResult<UpcomingObligation[]>> {
  const result = await apiGet<Obligation[]>("obligations", "/v1/obligations");

  if (!result.ok) return result;

  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "obligations returned a non-array list" },
    };
  }

  const upcoming = result.data
    .filter((o) => o.closed_at === null)
    .map(toUpcoming)
    .sort((a, b) => a.dueInDays - b.dueInDays)
    .slice(0, limit);

  return { ok: true, data: upcoming };
}

export type ObligationStats = {
  open: number;
  overdue: number;
  dueWithin7Days: number;
  /** Share of open obligations that are not overdue, 0–100. Null when none are open. */
  onTrackPercent: number | null;
};

/**
 * Roll up the obligation registry for the Overview KPIs.
 *
 * obligations-svc has no count or aggregate endpoint, so this reads the list and
 * counts locally.
 */
export async function getObligationStats(): Promise<ApiResult<ObligationStats>> {
  const result = await apiGet<Obligation[]>("obligations", "/v1/obligations");

  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return {
      ok: false,
      error: { kind: "malformed", message: "obligations returned a non-array list" },
    };
  }

  const open = result.data.filter((o) => o.closed_at === null);
  const days = open.map((o) => daysUntil(o.due_date));
  const overdue = days.filter((d) => d < 0).length;

  return {
    ok: true,
    data: {
      open: open.length,
      overdue,
      dueWithin7Days: days.filter((d) => d >= 0 && d <= 7).length,
      onTrackPercent:
        open.length === 0 ? null : Math.round(((open.length - overdue) / open.length) * 100),
    },
  };
}

function toUpcoming(obligation: Obligation): UpcomingObligation {
  const dueInDays = daysUntil(obligation.due_date);

  return {
    id: obligation.obligation_id,
    // obligation_code is the human-recognisable identifier (e.g. VAT-RETURN-Q2);
    // obligation_type is the category. Prefer the code, fall back to the type.
    title: obligation.obligation_code || obligation.obligation_type || "Untitled obligation",
    entity: obligation.legal_entity_id,
    dueInDays,
    overdue: dueInDays < 0,
  };
}

function daysUntil(isoDate: string): number {
  const due = new Date(isoDate).getTime();
  if (Number.isNaN(due)) return 0;
  return Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
}
