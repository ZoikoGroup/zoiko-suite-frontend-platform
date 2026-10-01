import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/shared";
import { PrivacyViewContainer } from "@/components/admin/privacy/PrivacyViewContainer";
import { ROPARegisterPanel } from "@/components/admin/privacy/ROPARegisterPanel";

export const metadata: Metadata = { title: "Privacy & Data Transfer Governance | Zoiko Suite" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        title="Privacy & Cross-Border Data Transfer Governance"
        description="PRV-05: International data transfers, DPA processor relationships, Schrems II DPIA/TIA assessments, and automated transfer decision gate."
      />

      <PrivacyViewContainer
        ropaRegister={
          <Suspense fallback={<p className="text-xs text-slate-400">Loading…</p>}>
            <ROPARegisterPanel />
          </Suspense>
        }
      />
    </div>
  );
}
