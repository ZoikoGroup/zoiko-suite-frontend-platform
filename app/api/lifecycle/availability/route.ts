// GET /api/lifecycle/availability: the backend releases this deployment is
// configured with (ZOIKO_BACKEND_RELEASES), so the row buttons offer only the
// lifecycle actions whose routes the backend serves. Signed-in sessions only.

import { NextResponse } from "next/server";
import { sessionIdentity } from "@/app/admin/intelligence/create-support";
import { enabledBackendReleases } from "@/lib/lifecycle/availability";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await sessionIdentity())) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json({ releases: enabledBackendReleases() }, { headers: { "Cache-Control": "no-store" } });
}
