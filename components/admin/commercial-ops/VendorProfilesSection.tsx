// Vendor profiles in vendor-due-diligence-svc: register one for a
// counterparty, then approve it once its screening has completed CLEAR.
// Read and written as the signed-in session.

import { CloudOff } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { apiGet } from "@/lib/api/client";
import { sessionIdentity } from "@/app/admin/intelligence/create-support";
import { counterpartyOptions, hintOf, itemsOf } from "@/lib/form-options";
import { CreateRecordForm } from "@/components/admin/intelligence/CreateRecordForm";
import type { FieldSpec } from "@/components/admin/intelligence/create-state";
import { RowActions } from "@/components/admin/shared/RowActions";
import { createVendorProfileAction } from "@/app/admin/commercial-ops/vendor-profile-actions";

type VendorProfile = {
  vendor_profile_id: string;
  counterparty_id: string;
  vendor_name: string;
  vendor_status: string;
  due_diligence_status: string;
  risk_rating: string;
  approved_at?: string | null;
  approved_by?: string | null;
};

export async function VendorProfilesSection() {
  const identity = await sessionIdentity();
  if (!identity) return null;
  const [res, counterparties] = await Promise.all([
    apiGet<VendorProfile[] | null>("vendorDueDiligence", "/v1/vendor-profiles", {
      identity,
      query: { legal_entity_id: identity.legalEntityId },
    }),
    counterpartyOptions(identity),
  ]);
  const fields: FieldSpec[] = [
    {
      name: "counterparty_id",
      label: "Counterparty",
      kind: "select",
      required: true,
      options: itemsOf(counterparties),
      hint: hintOf(counterparties, "counterparty-management-svc", "No counterparty yet: add one on the Legal page."),
    },
    { name: "vendor_name", label: "Vendor name", kind: "text", required: true },
  ];
  const profiles = res.ok ? res.data ?? [] : [];
  const nameOf = new Map(itemsOf(counterparties).map((o) => [o.value, o.label]));

  return (
    <div className="space-y-3" id="vendor-profiles">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        Vendor profiles ({profiles.length})
      </h3>
      <CreateRecordForm
        title="Register vendor profile"
        description="vendor-due-diligence-svc records the vendor for a counterparty of your entity. Approval comes after a CLEAR screening."
        fields={fields}
        action={createVendorProfileAction}
        submitLabel="Register vendor"
      />
      {!res.ok ? (
        <PanelEmptyState icon={CloudOff} tone="warning" label="vendor-due-diligence-svc profiles could not be read" hint={res.error.message} />
      ) : profiles.length === 0 ? (
        <p className="text-xs text-slate-400">No vendor profile yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {["Vendor", "Counterparty", "Due diligence", "Approved", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {profiles.map((p) => (
                <tr key={p.vendor_profile_id}>
                  <td className="px-4 py-3 text-xs font-medium text-slate-800 dark:text-slate-200">
                    {p.vendor_name}
                    <span className="block font-mono text-[10px] font-normal text-slate-400">{p.vendor_profile_id}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{nameOf.get(p.counterparty_id) ?? p.counterparty_id}</td>
                  <td className="px-4 py-3 text-xs font-medium">{p.due_diligence_status}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{p.approved_at ? new Date(p.approved_at).toLocaleString() : "—"}</td>
                  <td className="px-4 py-3 min-w-[160px]">
                    <RowActions actions={["vendor-profile.approve"]} recordId={p.vendor_profile_id} status={p.approved_at ? "APPROVED" : p.due_diligence_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
