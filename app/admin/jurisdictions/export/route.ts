// GET /admin/jurisdictions/export — the jurisdiction register as CSV, read with
// the caller's own identity, with the packs that name each jurisdiction.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, decodeSession, toIdentity } from "@/lib/auth";
import { listAllJurisdictions } from "@/lib/api/jurisdictions";
import { loadPacks, packsNaming } from "@/components/admin/jurisdictions/console/data";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection (=, +, -, @ at the start of a cell).
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId || !session.tenantId) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const identity = toIdentity(session);
  const [list, packs] = await Promise.all([listAllJurisdictions(identity), loadPacks(identity)]);
  if (!list.ok) return NextResponse.json({ error: list.error.message }, { status: 502 });
  const byId = new Map(list.data.map((j) => [j.jurisdiction_id, j]));
  const header = ["Code", "Name", "Type", "Authority", "Parent", "Active", "Effective from", "Effective to", "Packs naming it", "Jurisdiction id"];
  const lines = [header.join(",")];
  for (const j of list.data) {
    const naming = packsNaming(packs.data, j.jurisdiction_code).map((n) => `${n.pack.pack_ref}@${n.version.version} (${n.version.status})`);
    lines.push(
      [
        j.jurisdiction_code,
        j.jurisdiction_name,
        j.jurisdiction_type,
        j.authority_type,
        j.parent_jurisdiction_id ? (byId.get(j.parent_jurisdiction_id)?.jurisdiction_code ?? j.parent_jurisdiction_id) : "",
        j.active_flag ? "yes" : "no",
        j.effective_from.slice(0, 10),
        j.effective_to?.slice(0, 10) ?? "",
        naming.join("; "),
        j.jurisdiction_id,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jurisdiction-registry-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
