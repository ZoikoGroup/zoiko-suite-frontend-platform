// GET /admin/policies/export — the Policies & Controls register as CSV.
//
// The ticked rows (?ids=…, repeated) or, when none is ticked, every row under
// the register's current filters. Read with the caller's own identity, so the
// file holds exactly what the page shows them.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decodeSession, toIdentity } from "@/lib/auth";
import { person } from "@/lib/directory";
import { policyTypeLabel } from "@/lib/api/policies";
import { loadConsole, entityName } from "@/components/admin/policies/console/data";
import { DOMAIN_LABEL, EFF_LABEL, STATUS_LABEL, filterRows, type Row } from "@/components/admin/policies/console/model";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  // Neutralise spreadsheet formula injection (=, +, -, @ at the start of a cell).
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(request: NextRequest) {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId || !session.tenantId) {
    return NextResponse.json({ error: "sign in again" }, { status: 401 });
  }
  const identity = toIdentity(session);
  const sp = request.nextUrl.searchParams;
  const data = await loadConsole(identity);
  const failed = data.families.error ?? data.versions.error ?? data.controls.error;
  if (failed) return NextResponse.json({ error: failed.message }, { status: failed.status ?? 502 });

  const ids = new Set(sp.getAll("ids"));
  const rows = ids.size
    ? data.model.rows.filter((r) => ids.has(r.id))
    : filterRows(data.model.rows, {
        q: sp.get("q") ?? undefined,
        domain: sp.get("domain") ?? undefined,
        status: sp.get("status") ?? undefined,
        type: sp.get("type") ?? undefined,
        eff: sp.get("eff") ?? undefined,
        entity: sp.get("entity") ?? undefined,
        due: sp.get("due") ?? undefined,
      });

  const columns: [string, (r: Row) => unknown][] = [
    ["ID", (r) => r.ref],
    ["Record ID", (r) => r.id],
    ["Kind", (r) => (r.kind === "policy" ? "Policy" : "Control")],
    ["Title", (r) => r.title],
    ["Domain", (r) => DOMAIN_LABEL[r.domain]],
    ["Policy type / Control ref", (r) => (r.policy ? policyTypeLabel(r.policy.policy_type) : r.control?.control_ref)],
    ["Status", (r) => STATUS_LABEL[r.status]],
    ["Effectiveness", (r) => (r.eff === "na" ? "" : EFF_LABEL[r.eff])],
    ["Latest result", (r) => r.executions?.[0]?.result],
    ["Owner", (r) => person(r.owner).name],
    ["Owner principal", (r) => r.owner],
    ["Next review", (r) => r.nextReview?.slice(0, 10)],
    ["Overdue", (r) => (r.overdue ? "yes" : "")],
    ["Entities", (r) => r.entities.map((e) => entityName(data.entities, e))],
    ["Versions", (r) => r.versions?.length],
    ["Test frequency", (r) => r.control?.test_frequency],
    ["Created", (r) => r.createdAt],
  ];
  const lines = [columns.map(([h]) => csvCell(h)).join(",")];
  for (const r of rows) lines.push(columns.map(([, get]) => csvCell(get(r))).join(","));
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  return new NextResponse("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="policies-controls-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
