import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/shared";
import { MigrationIntegrityWorkbench } from "@/components/admin/migrations/MigrationIntegrityWorkbench";

export const metadata: Metadata = {
  title: "Migration Integrity & Cutover Engine",
  description: "Governed opening balance & data cutover integrity checks (ZS-MIG-001) backed by migration-integrity-svc (:8139)",
};

export default function MigrationsAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Migration Integrity & Cutover"
        description="The Tier 0 data cutover and opening balance integrity engine (ZS-MIG-001). Validates schema requirements, duplicate references, and numeric formats before commits to core ledgers or payroll, with complete audit remediation trails."
      />

      <MigrationIntegrityWorkbench />
    </div>
  );
}
