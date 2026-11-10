"use client";

import { BookOpen, Calculator, Receipt, Building, Coins, FileCheck, Landmark } from "lucide-react";
import { ServiceFlow, type ServiceFlowStage } from "@/components/admin/shared/ServiceFlow";

const STAGES: ServiceFlowStage[] = [
  {
    id: "rules",
    title: "Tax Rules",
    svc: "tax-rules-svc",
    icon: BookOpen,
    description: "Effective-dated tax rate rules per jurisdiction and category.",
  },
  {
    id: "determination",
    title: "Tax Determination",
    svc: "tax-determination-svc",
    icon: Calculator,
    description: "Evaluates the tax on one supply from its parties, place and date of supply and product classification; a determination can be overridden with a reason.",
  },
  {
    id: "vat",
    title: "VAT / GST Returns",
    svc: "vat-gst-svc",
    icon: Receipt,
    description: "VAT/GST returns per period, filed only with the evidence the filing gate requires.",
  },
  {
    id: "corporate",
    title: "Corporate Tax",
    svc: "corporate-tax-svc",
    icon: Building,
    description: "Corporate tax returns per period, submitted and then assessed by someone other than the submitter.",
  },
  {
    id: "withholding",
    title: "Withholding Tax",
    svc: "withholding-tax-svc",
    icon: Coins,
    description: "Withholding obligations on payments, calculated, then remitted or cancelled.",
  },
  {
    id: "filing",
    title: "Filing Preparation",
    svc: "filing-preparation-svc",
    icon: FileCheck,
    description: "Filing drafts that must be validated before they can be finalized for submission.",
  },
  {
    id: "authority",
    title: "Tax Authority Interface",
    svc: "tax-authority-interface-svc",
    icon: Landmark,
    description: "Registered tax-authority interfaces. Submission adapters are off in this environment, so nothing is sent to an authority.",
  },
];

export function TaxProcessTimeline() {
  return (
    <ServiceFlow
      title="Tax Lifecycle"
      subtitle="What each tax service does. The records themselves are in the panels below."
      stages={STAGES}
    />
  );
}
