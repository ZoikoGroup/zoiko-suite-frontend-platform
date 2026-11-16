// The jurisdiction register, read once on the server and handed to client
// forms as plain data.
//
// tax-determination-svc validates jurisdiction_id and supply_jurisdiction_id
// against jurisdiction-rules-svc and refuses a code ("GB" → 400 "not
// recognised"); tax-rules-svc stores whatever it is given, so a rule filed
// under a code is one no determination will ever find. Every form that sends
// a jurisdiction_id therefore picks it from this register, by UUID.
//
// There is no fallback list. When the read fails the forms show the service's
// error and refuse to submit: a hardcoded alias table is exactly what produced
// rules under ids no other service recognised.

import { listJurisdictions } from "@/lib/api/jurisdictions";

export type JurisdictionOption = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type JurisdictionOptions =
  | { ok: true; items: JurisdictionOption[] }
  | { ok: false; error: string };

export async function loadJurisdictionOptions(): Promise<JurisdictionOptions> {
  const res = await listJurisdictions();
  if (!res.ok) return { ok: false, error: res.error.message };
  return {
    ok: true,
    items: res.data.map((j) => ({
      id: j.jurisdiction_id,
      code: j.jurisdiction_code,
      name: j.jurisdiction_name,
      active: j.active_flag,
    })),
  };
}
