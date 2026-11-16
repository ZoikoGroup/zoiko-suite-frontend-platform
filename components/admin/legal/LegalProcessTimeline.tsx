"use client";

import { FileCode, FileText, Vote, UserCheck, CheckSquare, Landmark } from "lucide-react";
import { ServiceFlow, type ServiceFlowStage } from "@/components/admin/shared/ServiceFlow";

const STAGES: ServiceFlowStage[] = [
  {
    id: "clauses",
    title: "Clause Library",
    svc: "clause-template-svc",
    icon: FileCode,
    description: "Clauses and templates, each drafted then put through legal review, approval and activation before use; approved versions are superseded, not edited.",
  },
  {
    id: "contracts",
    title: "Contract Lifecycle",
    svc: "contract-lifecycle-svc",
    icon: FileText,
    description: "Contracts drafted at version 1, submitted for review, approved by someone other than the submitter, sent for signature, executed, then amended, renewed or terminated.",
  },
  {
    id: "counterparties",
    title: "Counterparties",
    svc: "counterparty-management-svc",
    icon: UserCheck,
    description: "The register of counterparties a contract can name, with their compliance status.",
  },
  {
    id: "obligations",
    title: "Obligations",
    svc: "obligation-tracking-svc",
    icon: CheckSquare,
    description: "Obligations arising from contracts, moved through planned, due, in progress, satisfied, waived, breached or disputed.",
  },
  {
    id: "resolutions",
    title: "Board Resolutions",
    svc: "board-resolutions-svc",
    icon: Vote,
    description: "Board meetings and resolutions: a resolution is proposed, voting is opened, members vote and someone other than the proposer closes it.",
  },
  {
    id: "actions",
    title: "Corporate Actions",
    svc: "corporate-actions-svc",
    icon: Landmark,
    description: "Corporate actions recorded against a resolution and executed by someone other than the person who recorded them.",
  },
];

export function LegalProcessTimeline() {
  return (
    <ServiceFlow
      title="Legal Lifecycle & Contract Governance"
      subtitle="What each Block 6 legal service does. The records themselves are in the panels below."
      stages={STAGES}
    />
  );
}
