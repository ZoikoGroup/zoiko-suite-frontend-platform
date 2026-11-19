import type { SessionIdentity } from "@/lib/auth";
import type { ApiError, ApiResult } from "@/lib/api/client";
import {
  getObligationSummary,
  listObligations,
  listClocks,
  listUpcomingObligations,
  type Obligation,
  type Clock,
  type ClockState,
  type UpcomingObligation,
  type ObligationSummary,
  CLOCK_STATE_LABEL,
  CLOCK_CLASS_LABEL,
} from "@/lib/api/obligations";

/** A register's rows, or why there are none to show. `more` = cut at the limit. */
export type Read<T> = { rows: T[]; error: ApiError | null; more: boolean };

/** How many recent obligations the console lists and summarises. */
export const OBLIGATION_WINDOW = 1000;

export type ObligationsData = {
  summary: { value: ObligationSummary | null; error: ApiError | null };
  obligations: Read<Obligation>;
  clocks: Read<Clock>;
  upcoming: Read<UpcomingObligation>;
};

export type ObligationsCtx = {
  data: ObligationsData;
  reload: () => void;
};

// Re-export clock labels for console components
export { CLOCK_STATE_LABEL, CLOCK_CLASS_LABEL };

type Page<T> = { items: T[]; next_cursor?: string; page_size: number };
type PageRequest = { pageSize?: number; cursor?: string };

async function readAll<T>(
  read: (page: PageRequest) => Promise<ApiResult<T[]>>,
  limit = 1000,
): Promise<ApiResult<{ rows: T[]; more: boolean }>> {
  const rows: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const r = await read({ pageSize: 200, cursor });
    if (!r.ok) return r;
    rows.push(...r.data);
    cursor = undefined; // obligations API doesn't support cursor pagination yet
    if (!cursor) return { ok: true, data: { rows, more: false } };
    if (rows.length >= limit) return { ok: true, data: { rows, more: true } };
  }
}

function read<T>(r: ApiResult<{ rows: T[]; more: boolean }>): Read<T> {
  return r.ok ? { rows: r.data.rows, error: null, more: r.data.more } : { rows: [], error: r.error, more: false };
}

export async function loadObligations(identity: SessionIdentity): Promise<ObligationsData> {
  const who = { ...identity, tenantId: identity.tenantId };
  const [summary, obligations, clocks, upcoming] = await Promise.all([
    getObligationSummary(who),
    readAll<Obligation>((p) => listObligations({ ...who, ...p }), OBLIGATION_WINDOW),
    readAll<Clock>((p) => listClocks({ ...who, ...p }), OBLIGATION_WINDOW),
    listUpcomingObligations(5, who),
  ]);
  return {
    summary: summary.ok ? { value: summary.data, error: null } : { value: null, error: summary.error },
    obligations: read(obligations),
    clocks: read(clocks),
    upcoming: upcoming.ok ? { rows: upcoming.data, error: null, more: false } : { rows: [], error: upcoming.error, more: false },
  };
}

/** The first unreadable register among these, ignoring "you may not see this" (403). */
export function firstProblem(...reads: { error: ApiError | null }[]): ApiError | null {
  return reads.find((r) => r.error && r.error.status !== 403)?.error ?? null;
}

/** Clock state ordering for pipeline display. */
export const CLOCK_PIPELINE_ORDER: ClockState[] = [
  "PLANNED",
  "ACTIVE",
  "DUE_SOON",
  "DUE",
  "OVERDUE",
  "FULFILLED",
  "WAIVED",
  "NOT_APPLICABLE",
  "SUPERSEDED",
];

/** Whether a clock state is in the active pipeline (not terminal). */
export function isActivePipelineState(state: ClockState): boolean {
  return ["PLANNED", "ACTIVE", "DUE_SOON", "DUE", "OVERDUE"].includes(state);
}

/** Whether a clock state is terminal. */
export function isTerminalClockState(state: ClockState): boolean {
  return ["FULFILLED", "WAIVED", "NOT_APPLICABLE", "SUPERSEDED"].includes(state);
}