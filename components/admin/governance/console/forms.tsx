// The Governance Log's commands. The console is read-only (decision D-DL-2,
// 25 Nov 2026): every governance engine records its own decisions in the
// ledger, people resolve escalations through Workflows & Approvals, sealing
// runs hourly and replay stays at the API for auditors. What remains here
// re-computes and writes nothing: Verify Chain and Verify Package.

import { FileCheck2, ShieldCheck } from "lucide-react";
import { verifyChainAction, verifyPackageAction } from "@/app/admin/governance/actions";
import { ActionDialog } from "@/components/admin/authorization/kit/ActionDialog";

const ICON = "h-4 w-4";

export function VerifyChainDialog() {
  return (
    <ActionDialog
      label="Verify Chain"
      icon={<ShieldCheck className={ICON} />}
      tone="secondary"
      size="md"
      title="Verify the evidence chain"
      description="Re-computes every decision's hash link and every sealed package from the records as stored now. Nothing is written."
      action={verifyChainAction}
      submitLabel="Verify"
    />
  );
}

export function VerifyPackageDialog({ packageId, seq }: { packageId: string; seq: number }) {
  return (
    <ActionDialog
      label="Verify Package"
      icon={<FileCheck2 className={ICON} />}
      tone="accent"
      title={`Verify package #${seq}`}
      description="Re-computes the package's Merkle root and chain hash from the decisions as stored now. Nothing is written."
      action={verifyPackageAction}
      hidden={{ package_id: packageId }}
      submitLabel="Verify"
    />
  );
}
