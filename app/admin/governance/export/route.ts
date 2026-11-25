// GET /admin/governance/export — the register's current filter as CSV.
//
// Pages through GET /v1/decisions on the server (the service caps a page at
// 200) up to EXPORT_CAP rows, so the file is exactly what the register shows
// under the same filters, read with the caller's own identity and authorization.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decodeSession, toIdentity } from "@/lib/auth";
import { decisionTitle, listDecisionRecords, statusView, type DecisionFilters, type GovernanceDecision } from "@/lib/api/governance";
import { filtersOf } from "@/components/admin/governance/console/data";

const EXPORT_CAP = 10_000;
const PAGE = 200;

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  // Neutralise spreadsheet formula injection (=, +, -, @ at the start of a cell).
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const COLUMNS: [string, (d: GovernanceDecision) => unknown][] = [
  ["Reference", (d) => d.display_ref],
  ["Decision ID", (d) => d.decision_id],
  ["Title", (d) => decisionTitle(d)],
  ["Status", (d) => statusView(d).label],
  ["Outcome", (d) => d.outcome],
  ["Domain", (d) => d.domain],
  ["Priority", (d) => d.priority],
  ["Legal entity", (d) => d.legal_entity_id],
  ["Jurisdiction", (d) => d.jurisdiction_context],
  ["Decided at", (d) => d.decided_at],
  ["Recorded at", (d) => d.recorded_at],
  ["Decision owner", (d) => d.actor_id],
  ["Action type", (d) => d.action_type],
  ["Rule basis", (d) => d.rule_basis],
  ["Policy version", (d) => d.policy_version_id],
  ["Reference (subject)", (d) => d.action_subject_id],
  ["Related obligation", (d) => d.related_obligation_id],
  ["Follows up", (d) => d.causation_id],
  ["Tags", (d) => d.tags],
  ["Chain position", (d) => d.chain_seq],
  ["Chain hash", (d) => d.curr_hash],
];

export async function GET(request: NextRequest) {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId || !session.tenantId) {
    return NextResponse.json({ error: "sign in again" }, { status: 401 });
  }
  const identity = toIdentity(session);
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const base: DecisionFilters = { ...filtersOf(query), limit: PAGE, offset: 0 };

  const rows: GovernanceDecision[] = [];
  for (let offset = 0; offset < EXPORT_CAP; offset += PAGE) {
    const page = await listDecisionRecords({ ...base, offset }, identity);
    if (!page.ok) {
      return NextResponse.json({ error: page.error.message }, { status: page.error.status ?? 502 });
    }
    rows.push(...page.data.records);
    if (rows.length >= page.data.total_count || page.data.records.length < PAGE) break;
  }

  const lines = [COLUMNS.map(([h]) => csvCell(h)).join(",")];
  for (const d of rows.slice(0, EXPORT_CAP)) lines.push(COLUMNS.map(([, get]) => csvCell(get(d))).join(","));
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  return new NextResponse("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="governance-log-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
