"use client";

import { ClipboardList, ShieldCheck, Gauge, FileText, Workflow } from "lucide-react";
import { ServiceFlow, type ServiceFlowStage } from "@/components/admin/shared/ServiceFlow";

const STAGES: ServiceFlowStage[] = [
  {
    id: "request",
    title: "Purchase Request",
    svc: "purchase-request-svc",
    icon: ClipboardList,
    description: "A requisition drafted, submitted for approval, then approved by someone other than the requester, rejected or cancelled.",
  },
  {
    id: "vendor",
    title: "Vendor Due Diligence",
    svc: "vendor-due-diligence-svc",
    icon: ShieldCheck,
    description: "A screening check recorded against a counterparty before it can be used as a supplier.",
  },
  {
    id: "spend",
    title: "Spend Controls",
    svc: "spend-controls-svc",
    icon: Gauge,
    description: "Spend limits per category and period; a spend check is allowed or blocked against the limit in force.",
  },
  {
    id: "case",
    title: "Procurement Case",
    svc: "procurement-workflow-svc",
    icon: Workflow,
    description: "A procurement case approved or rejected by someone other than its requester; an approved case can issue an order.",
  },
  {
    id: "order",
    title: "Purchase Order",
    svc: "purchase-order-svc",
    icon: FileText,
    description: "A purchase order issued from an approved request or case, then amended (with a reason) or closed.",
  },
];

export function CommercialOpsProcessTimeline() {
  return (
    <ServiceFlow
      title="Procure-to-Order Flow"
      subtitle="What each Block 6 procurement service does. The records themselves are in the panels below."
      stages={STAGES}
    />
  );
}
