"use client";

import { CalendarClock, Gauge, Siren } from "lucide-react";
import { ServiceFlow, type ServiceFlowStage } from "@/components/admin/shared/ServiceFlow";

const STAGES: ServiceFlowStage[] = [
  {
    id: "filing",
    title: "Filing Requirements",
    svc: "filing-tracker-svc",
    icon: CalendarClock,
    description: "Statutory filing requirements per jurisdiction and period, with a due date; each is submitted, then confirmed by the authority, or marked overdue.",
  },
  {
    id: "status",
    title: "Compliance Status",
    svc: "compliance-status-svc",
    icon: Gauge,
    description: "A compliance evaluation for a jurisdiction and domain, computed from the obligation and exception counts it is given; gaps are recorded and resolved separately.",
  },
  {
    id: "exceptions",
    title: "Exceptions & Escalation",
    svc: "exception-escalation-svc",
    icon: Siren,
    description: "Compliance exceptions raised against a linked record, escalated by severity, and resolved by someone other than the person who raised them.",
  },
];

export function ComplianceProcessTimeline() {
  return (
    <ServiceFlow
      title="Compliance Lifecycle"
      subtitle="What each Block 7 compliance service does. The records themselves are in the panels below."
      stages={STAGES}
    />
  );
}
