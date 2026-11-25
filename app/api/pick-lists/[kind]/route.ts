// GET /api/pick-lists/<kind>: the options of one register for the signed-in
// session (lib/pick-lists.ts). 401 without a complete session, 404 for an
// unknown kind; a register that could not be read answers 200 with
// {ok: false, error} so the form can show the service's reason.

import { NextResponse, type NextRequest } from "next/server";
import { isPickListKind, loadPickList } from "@/lib/pick-lists";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isPickListKind(kind)) return NextResponse.json({ ok: false, error: "Unknown list." }, { status: 404 });
  const options = await loadPickList(kind);
  if (!options) return NextResponse.json({ ok: false, error: "Your session has expired — sign in again." }, { status: 401 });
  return NextResponse.json(options, { headers: { "Cache-Control": "no-store" } });
}
