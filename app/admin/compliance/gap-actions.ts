"use server";

// Record a compliance gap in compliance-status-svc.
//
// The legal entity is the session's; the jurisdiction is picked from the
// register by id. A refusal is returned as the service gave it.

import { refresh } from "next/cache";
import { createComplianceGap } from "@/lib/api/compliance";
import type { CreateState } from "@/components/admin/intelligence/create-state";
import { sessionIdentity, expired, missing, invalid, text, toState, show } from "@/app/admin/intelligence/create-support";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export async function createComplianceGapAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);

  const absent = missing(previous, fd, [
    ["jurisdiction_id", "Jurisdiction"],
    ["domain_name", "Compliance domain"],
    ["gap_type", "Gap type"],
  ]);
  if (absent) return absent;
  if (!UUID_RE.test(text(fd, "jurisdiction_id"))) return invalid(previous, fd, "Choose a jurisdiction from the register.");
  const severity = text(fd, "severity");
  if (severity && !SEVERITIES.includes(severity)) return invalid(previous, fd, "Choose a severity.");

  const res = await createComplianceGap({
    identity: { ...identity, legalEntityId: identity.legalEntityId! },
    jurisdictionId: text(fd, "jurisdiction_id"),
    domainName: text(fd, "domain_name"),
    gapType: text(fd, "gap_type"),
    ...(severity ? { severity } : {}),
    ...(text(fd, "description") ? { description: text(fd, "description") } : {}),
    ...(text(fd, "remediation_plan") ? { remediationPlan: text(fd, "remediation_plan") } : {}),
    ...(text(fd, "source_reference") ? { sourceReference: text(fd, "source_reference") } : {}),
  });
  if (res.ok) refresh();
  return toState(previous, fd, res, "compliance-status-svc", (g) => [
    ["Gap", show(g.gap_id)],
    ["Status", show(g.status)],
    ["Severity", show(g.severity)],
  ]);
}
