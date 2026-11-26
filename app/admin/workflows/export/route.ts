// GET /admin/workflows/export — the register's current tab and filters as CSV.
//
// Reads exactly what the console reads (loadConsole, with the caller's own
// identity and authorization), so the file is the register as shown — the
// tenant's latest page of workflows, plus every pending one.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decodeSession, toIdentity } from "@/lib/auth";
import { explainWorkflowError } from "@/lib/api/workflow";
import { loadConsole, rowsFor, tabOf, type Row } from "@/components/admin/workflow/console/data";
import { statusChip } from "@/components/admin/workflow/console/register";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
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
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const data = await loadConsole(identity);
  if (data.all.error && data.pending.error) {
    return NextResponse.json({ error: explainWorkflowError(data.all.error.message) }, { status: data.all.error.status ?? 502 });
  }

  const columns: [string, (r: Row) => unknown][] = [
    ["Reference", (r) => r.ref],
    ["Workflow ID", (r) => r.wf.workflow_instance_id],
    ["Title", (r) => r.title],
    ["Description", (r) => r.description],
    ["Workflow type", (r) => r.wf.workflow_type],
    ["Status", (r) => statusChip(r).label],
    ["Workflow status", (r) => r.wf.workflow_status],
    ["Current stage", (r) => (r.open ? r.wf.current_stage : "")],
    ["Stages", (r) => r.stages?.length ?? ""],
    ["Deadline", (r) => r.deadline],
    ["Due at", (r) => r.due ?? ""],
    ["Requester", (r) => r.requester],
    ["Requester ID", (r) => r.wf.initiated_by],
    ["Legal entity", (r) => data.dir.entity(r.wf.legal_entity_id)],
    ["Legal entity ID", (r) => r.wf.legal_entity_id],
    ["Subject type", (r) => r.wf.subject_type ?? ""],
    ["Subject ID", (r) => r.wf.subject_id ?? ""],
    ["Started at", (r) => r.wf.started_at ?? ""],
    ["Completed at", (r) => r.wf.completed_at ?? ""],
    ["Escalation owner", (r) => r.wf.escalation_target ?? ""],
    ["Definition", (r) => r.wf.workflow_definition_id ?? ""],
    ["Definition version", (r) => r.wf.workflow_definition_version ?? ""],
  ];

  const rows = rowsFor(tabOf(query), data.rows, query, identity.principalId);
  const lines = [columns.map(([h]) => csvCell(h)).join(","), ...rows.map((r) => columns.map(([, f]) => csvCell(f(r))).join(","))];
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="workflows-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
