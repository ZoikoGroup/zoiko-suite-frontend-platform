import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/shared";
import { PrivacyViewContainer } from "@/components/admin/privacy/PrivacyViewContainer";

export const metadata: Metadata = { title: "Privacy & Data Transfer Governance | Zoiko Suite" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        title="Privacy & Cross-Border Data Transfer Governance"
        description="PRV-05: International data transfers, DPA processor relationships, Schrems II DPIA/TIA assessments, and automated transfer decision gate."
      />

      <PrivacyViewContainer />
    </div>
  );
}
