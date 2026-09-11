"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  createTransferMechanism,
  createProcessorRelationship,
  listProcessorRelationships,
  updateRelationshipStatus,
  attachSubprocessor,
  listSubprocessors,
  recordTransferAssessment,
  getLatestAssessment,
  evaluateTransfer,
  type MechanismType,
  type AssessmentOutcome,
  type RelationshipStatus,
  type TransferMechanism,
  type ProcessorRelationship,
  type Subprocessor,
  type TransferAssessment,
  type TransferDecision,
} from "@/lib/api/privacy-transfer";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const decoded = decodeSession(raw);
  if (!decoded) {
    throw new Error("unauthenticated");
  }
  return decoded;
}

export type TransferActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  data?: Record<string, unknown>;
};

// ── 1. Create Transfer Mechanism Action ──
export async function createMechanismAction(
  _previous: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const mechanismType = String(formData.get("mechanism_type") ?? "").trim() as MechanismType;
  const evidenceRef = String(formData.get("evidence_ref") ?? "").trim() || undefined;
  const conditions = String(formData.get("conditions") ?? "").trim() || undefined;
  const validUntil = String(formData.get("valid_until") ?? "").trim() || undefined;

  if (!mechanismType) {
    return { status: "error", message: "mechanism_type is required" };
  }

  const res = await createTransferMechanism(
    {
      mechanism_type: mechanismType,
      evidence_ref: evidenceRef,
      conditions: conditions,
      valid_until: validUntil,
    },
    identity
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to create transfer mechanism." };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Transfer Mechanism created! ID: ${res.data.mechanism_id} (${res.data.mechanism_type})`,
    data: { mechanism: res.data },
  };
}

// ── 2. Create Processor Relationship Action ──
export async function createRelationshipAction(
  _previous: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const controllerRef = String(formData.get("controller_ref") ?? "").trim();
  const processorRef = String(formData.get("processor_ref") ?? "").trim();
  const service = String(formData.get("service") ?? "").trim();
  const processingInstructions = String(formData.get("processing_instructions") ?? "").trim() || undefined;
  const contractEvidenceRef = String(formData.get("contract_evidence_ref") ?? "").trim() || undefined;
  const categoriesRaw = String(formData.get("data_categories") ?? "Customer_PII, Telemetry").trim();
  const subjectsRaw = String(formData.get("subject_classes") ?? "Enterprise_Users, Customers").trim();
  const jurisdictionsRaw = String(formData.get("jurisdictions") ?? "EU-GDPR, UK-GDPR").trim();

  if (!controllerRef || !processorRef || !service) {
    return { status: "error", message: "controller_ref, processor_ref and service are required" };
  }

  const dataCategories = categoriesRaw ? categoriesRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const subjectClasses = subjectsRaw ? subjectsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const jurisdictions = jurisdictionsRaw ? jurisdictionsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const res = await createProcessorRelationship(
    {
      controller_ref: controllerRef,
      processor_ref: processorRef,
      service,
      processing_instructions: processingInstructions,
      purpose_activity_refs: [],
      data_categories: dataCategories,
      subject_classes: subjectClasses,
      contract_evidence_ref: contractEvidenceRef,
      jurisdictions: jurisdictions,
    },
    identity
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to create processor relationship." };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Processor relationship registered! ID: ${res.data.relationship_id} (${res.data.controller_ref} → ${res.data.processor_ref})`,
    data: { relationship: res.data },
  };
}

// ── 3. Toggle Relationship Status Action ──
export async function toggleRelationshipStatusAction(
  relationshipId: string,
  newStatus: RelationshipStatus
): Promise<TransferActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const res = await updateRelationshipStatus(relationshipId, newStatus, identity);
  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to update relationship status." };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Relationship status updated to ${newStatus}`,
    data: { relationship: res.data },
  };
}

// ── 4. Attach Subprocessor Action ──
export async function attachSubprocessorAction(
  _previous: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const relationshipId = String(formData.get("relationship_id") ?? "").trim();
  const providerIdentity = String(formData.get("provider_identity") ?? "").trim();
  const service = String(formData.get("service") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim() || undefined;
  const dataScope = String(formData.get("data_scope") ?? "").trim() || undefined;
  const locationsRaw = String(formData.get("processing_locations") ?? "US-East-1, EU-West-1").trim();
  const onwardRaw = String(formData.get("onward_subprocessors") ?? "AWS S3, Azure Blob").trim();
  const notificationModel = String(formData.get("notification_approval_model") ?? "PRIOR_NOTICE_30_DAYS").trim() || undefined;
  const contractEvidenceRef = String(formData.get("contract_evidence_ref") ?? "").trim() || undefined;

  if (!relationshipId || !providerIdentity || !service) {
    return { status: "error", message: "relationship_id, provider_identity and service are required" };
  }

  const processingLocations = locationsRaw ? locationsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const onwardSubprocessors = onwardRaw ? onwardRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const res = await attachSubprocessor(
    relationshipId,
    {
      provider_identity: providerIdentity,
      service,
      purpose,
      data_scope: dataScope,
      processing_locations: processingLocations,
      onward_subprocessors: onwardSubprocessors,
      notification_approval_model: notificationModel,
      contract_evidence_ref: contractEvidenceRef,
    },
    identity
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to attach subprocessor." };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Subprocessor attached! ID: ${res.data.subprocessor_id} (${res.data.provider_identity})`,
    data: { subprocessor: res.data },
  };
}

// ── 5. Record Transfer Assessment Action ──
export async function recordAssessmentAction(
  _previous: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const relationshipId = String(formData.get("relationship_id") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "APPROVE").trim() as AssessmentOutcome;
  const residualRisk = String(formData.get("residual_risk") ?? "").trim() || undefined;
  const evidenceRef = String(formData.get("evidence_ref") ?? "").trim() || undefined;
  const reviewTriggerAt = String(formData.get("review_trigger_at") ?? "").trim() || undefined;

  if (!relationshipId) {
    return { status: "error", message: "relationship_id is required" };
  }

  const res = await recordTransferAssessment(
    {
      relationship_id: relationshipId,
      outcome,
      residual_risk: residualRisk,
      evidence_ref: evidenceRef,
      review_trigger_at: reviewTriggerAt,
    },
    identity
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to record transfer assessment." };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Transfer Assessment recorded! ID: ${res.data.assessment_id} (Outcome: ${res.data.outcome})`,
    data: { assessment: res.data },
  };
}

// ── 6. Evaluate Transfer Decision Action ──
export async function evaluateTransferAction(
  _previous: TransferActionState,
  formData: FormData
): Promise<TransferActionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { status: "error", message: "Session expired — please log in again." };
  }

  const relationshipId = String(formData.get("relationship_id") ?? "").trim();
  const transferMechanismId = String(formData.get("transfer_mechanism_id") ?? "").trim();
  const destinationJurisdiction = String(formData.get("destination_jurisdiction") ?? "US").trim();
  const assessmentRequired = formData.get("assessment_required") === "true";

  if (!relationshipId || !transferMechanismId) {
    return { status: "error", message: "relationship_id and transfer_mechanism_id are required" };
  }

  const res = await evaluateTransfer(
    {
      relationship_id: relationshipId,
      transfer_mechanism_id: transferMechanismId,
      destination_jurisdiction: destinationJurisdiction,
      assessment_required: assessmentRequired,
    },
    identity
  );

  if (!res.ok) {
    return { status: "error", message: res.error.message || "Failed to evaluate transfer decision." };
  }

  revalidatePath("/admin/privacy");
  return {
    status: "success",
    message: `Transfer Decision Evaluated: ${res.data.result} (Reason: ${res.data.reason_codes.join(", ") || "None"})`,
    data: { decision: res.data },
  };
}

// ── 7. Fetch Live Dashboard Data ──
export async function fetchTransferDashboardData(): Promise<{
  relationships: ProcessorRelationship[];
  subprocessors: Record<string, Subprocessor[]>;
  assessments: Record<string, TransferAssessment | null>;
  error?: string;
}> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { relationships: [], subprocessors: {}, assessments: {}, error: "unauthenticated" };
  }

  const relRes = await listProcessorRelationships(identity);
  if (!relRes.ok) {
    return { relationships: [], subprocessors: {}, assessments: {}, error: relRes.error.message };
  }

  const relationships = relRes.data.data || [];
  const subprocessors: Record<string, Subprocessor[]> = {};
  const assessments: Record<string, TransferAssessment | null> = {};

  for (const rel of relationships) {
    const subRes = await listSubprocessors(rel.relationship_id, identity);
    if (subRes.ok) {
      subprocessors[rel.relationship_id] = subRes.data.data || [];
    }
    const assRes = await getLatestAssessment(rel.relationship_id, identity);
    if (assRes.ok) {
      if ("assessment" in assRes.data && assRes.data.assessment === null) {
        assessments[rel.relationship_id] = null;
      } else {
        assessments[rel.relationship_id] = assRes.data as TransferAssessment;
      }
    }
  }

  return { relationships, subprocessors, assessments };
}

// ── 8. Automated QA Suite Runner ──
export type QAScenarioResult = {
  id: string;
  name: string;
  type: "positive" | "negative";
  description: string;
  expectedStatus: string;
  actualResult: string;
  passed: boolean;
  details: string;
};

export async function runAutomatedQASuiteAction(): Promise<QAScenarioResult[]> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return [
      {
        id: "AUTH-01",
        name: "Authentication Check",
        type: "positive",
        description: "Validates active admin session",
        expectedStatus: "Authenticated",
        actualResult: "Unauthenticated",
        passed: false,
        details: "Session expired or missing.",
      },
    ];
  }

  const results: QAScenarioResult[] = [];

  // Scenario 1: Create Transfer Mechanism (SCC)
  let mechanismId = "";
  try {
    const mechRes = await createTransferMechanism(
      {
        mechanism_type: "STANDARD_CONTRACTUAL_CLAUSES",
        evidence_ref: "EU-2021-914-SCC-V1",
        conditions: "Module 2: Controller-to-Processor with Customer-held HSM Keys",
      },
      identity
    );
    if (mechRes.ok) {
      mechanismId = mechRes.data.mechanism_id;
      results.push({
        id: "TC-PRV05-01",
        name: "Create Transfer Safeguard Mechanism (SCC)",
        type: "positive",
        description: "POST /privacy/transfer-mechanisms with valid SCC parameters",
        expectedStatus: "HTTP 201 Created",
        actualResult: `Created mechanism_id: ${mechanismId}`,
        passed: true,
        details: `Created with type: ${mechRes.data.mechanism_type}, evidence_ref: ${mechRes.data.evidence_ref}`,
      });
    } else {
      results.push({
        id: "TC-PRV05-01",
        name: "Create Transfer Safeguard Mechanism (SCC)",
        type: "positive",
        description: "POST /privacy/transfer-mechanisms with valid SCC parameters",
        expectedStatus: "HTTP 201 Created",
        actualResult: `Failed: ${mechRes.error.message}`,
        passed: false,
        details: JSON.stringify(mechRes.error),
      });
    }
  } catch (err: unknown) {
    results.push({
      id: "TC-PRV05-01",
      name: "Create Transfer Safeguard Mechanism (SCC)",
      type: "positive",
      description: "POST /privacy/transfer-mechanisms",
      expectedStatus: "HTTP 201 Created",
      actualResult: String(err),
      passed: false,
      details: "Exception caught during execution.",
    });
  }

  // Scenario 2: Register Processor Relationship
  let relationshipId = "";
  try {
    const relRes = await createProcessorRelationship(
      {
        controller_ref: "ZOIKO-HQ-EU",
        processor_ref: "AWS-EMEA-SOCIETE",
        service: "Cloud Infrastructure Hosting",
        processing_instructions: "Process personal data solely on documented instructions for multi-tenant cloud hosting",
        contract_evidence_ref: "DPA-2026-AWS-0091",
        data_categories: ["Customer_PII", "Billing_Telemetry"],
        subject_classes: ["Platform_Users", "Corporate_Admins"],
        jurisdictions: ["EU-GDPR", "UK-GDPR"],
      },
      identity
    );
    if (relRes.ok) {
      relationshipId = relRes.data.relationship_id;
      results.push({
        id: "TC-PRV05-02",
        name: "Register Processor Relationship (Controller → Processor)",
        type: "positive",
        description: "POST /privacy/processor-relationships with valid DPA and instructions",
        expectedStatus: "HTTP 201 Created",
        actualResult: `Created relationship_id: ${relationshipId}`,
        passed: true,
        details: `Controller: ${relRes.data.controller_ref}, Processor: ${relRes.data.processor_ref}, Status: ${relRes.data.status}`,
      });
    } else {
      results.push({
        id: "TC-PRV05-02",
        name: "Register Processor Relationship",
        type: "positive",
        description: "POST /privacy/processor-relationships",
        expectedStatus: "HTTP 201 Created",
        actualResult: `Failed: ${relRes.error.message}`,
        passed: false,
        details: JSON.stringify(relRes.error),
      });
    }
  } catch (err: unknown) {
    results.push({
      id: "TC-PRV05-02",
      name: "Register Processor Relationship",
      type: "positive",
      description: "POST /privacy/processor-relationships",
      expectedStatus: "HTTP 201 Created",
      actualResult: String(err),
      passed: false,
      details: "Exception thrown.",
    });
  }

  // Scenario 3: Attach Subprocessor
  let subprocessorId = "";
  if (relationshipId) {
    try {
      const subRes = await attachSubprocessor(
        relationshipId,
        {
          provider_identity: "Snowflake Inc.",
          service: "Analytics Data Warehouse",
          purpose: "Aggregated reporting & telemetry warehousing",
          data_scope: "Pseudonymized customer identifiers & billing metrics",
          processing_locations: ["US-East-1", "EU-West-1"],
          onward_subprocessors: ["AWS S3"],
          notification_approval_model: "PRIOR_WRITTEN_NOTICE_30_DAYS",
          contract_evidence_ref: "SUB-DPA-2026-SNOWFLAKE-04",
        },
        identity
      );
      if (subRes.ok) {
        subprocessorId = subRes.data.subprocessor_id;
        results.push({
          id: "TC-PRV05-03",
          name: "Attach Subprocessor to Processor Relationship",
          type: "positive",
          description: "POST /privacy/processor-relationships/{id}/subprocessors",
          expectedStatus: "HTTP 201 Created",
          actualResult: `Created subprocessor_id: ${subprocessorId}`,
          passed: true,
          details: `Provider: ${subRes.data.provider_identity}, Service: ${subRes.data.service}`,
        });
      } else {
        results.push({
          id: "TC-PRV05-03",
          name: "Attach Subprocessor",
          type: "positive",
          description: "POST /privacy/processor-relationships/{id}/subprocessors",
          expectedStatus: "HTTP 201 Created",
          actualResult: `Failed: ${subRes.error.message}`,
          passed: false,
          details: JSON.stringify(subRes.error),
        });
      }
    } catch (err: unknown) {
      results.push({
        id: "TC-PRV05-03",
        name: "Attach Subprocessor",
        type: "positive",
        description: "POST /privacy/processor-relationships/{id}/subprocessors",
        expectedStatus: "HTTP 201 Created",
        actualResult: String(err),
        passed: false,
        details: "Exception thrown.",
      });
    }
  }

  // Scenario 4: Record Transfer Assessment (APPROVE)
  if (relationshipId) {
    try {
      const assRes = await recordTransferAssessment(
        {
          relationship_id: relationshipId,
          outcome: "APPROVE",
          residual_risk: "LOW - FISA 702 risk mitigated by customer-held HSM envelope encryption",
          evidence_ref: "TIA-2026-AWS-EU-01",
        },
        identity
      );
      if (assRes.ok) {
        results.push({
          id: "TC-PRV05-04",
          name: "Record Transfer Impact Assessment (TIA - Outcome: APPROVE)",
          type: "positive",
          description: "POST /privacy/transfer-assessments with valid TIA risk analysis",
          expectedStatus: "HTTP 201 Created",
          actualResult: `Created assessment_id: ${assRes.data.assessment_id}, outcome: ${assRes.data.outcome}`,
          passed: true,
          details: `Outcome: ${assRes.data.outcome}, Residual Risk: ${assRes.data.residual_risk}`,
        });
      } else {
        results.push({
          id: "TC-PRV05-04",
          name: "Record Transfer Assessment",
          type: "positive",
          description: "POST /privacy/transfer-assessments",
          expectedStatus: "HTTP 201 Created",
          actualResult: `Failed: ${assRes.error.message}`,
          passed: false,
          details: JSON.stringify(assRes.error),
        });
      }
    } catch (err: unknown) {
      results.push({
        id: "TC-PRV05-04",
        name: "Record Transfer Assessment",
        type: "positive",
        description: "POST /privacy/transfer-assessments",
        expectedStatus: "HTTP 201 Created",
        actualResult: String(err),
        passed: false,
        details: "Exception thrown.",
      });
    }
  }

  // Scenario 5: Evaluate Transfer Decision (Expected: AUTHORIZED)
  if (relationshipId && mechanismId) {
    try {
      const decRes = await evaluateTransfer(
        {
          relationship_id: relationshipId,
          transfer_mechanism_id: mechanismId,
          destination_jurisdiction: "US",
          assessment_required: true,
        },
        identity
      );
      if (decRes.ok && decRes.data.result === "AUTHORIZED") {
        results.push({
          id: "TC-PRV05-05",
          name: "Runtime Transfer Gate Evaluation — Compliant Transfer",
          type: "positive",
          description: "POST /privacy/transfer-decisions with active relationship, valid SCC & approved TIA",
          expectedStatus: "AUTHORIZED",
          actualResult: `Result: ${decRes.data.result}`,
          passed: true,
          details: `Decision ID: ${decRes.data.decision_id}, Destination: ${decRes.data.destination_jurisdiction}`,
        });
      } else {
        results.push({
          id: "TC-PRV05-05",
          name: "Runtime Transfer Gate Evaluation — Compliant Transfer",
          type: "positive",
          description: "POST /privacy/transfer-decisions",
          expectedStatus: "AUTHORIZED",
          actualResult: decRes.ok
            ? `Result: ${decRes.data.result} (Reasons: ${decRes.data.reason_codes.join(", ")})`
            : decRes.error.message,
          passed: false,
          details: JSON.stringify(decRes),
        });
      }
    } catch (err: unknown) {
      results.push({
        id: "TC-PRV05-05",
        name: "Runtime Transfer Gate Evaluation",
        type: "positive",
        description: "POST /privacy/transfer-decisions",
        expectedStatus: "AUTHORIZED",
        actualResult: String(err),
        passed: false,
        details: "Exception thrown.",
      });
    }
  }

  // Scenario 6 (Negative): Suspended / Inactive Processor Relationship -> Expected: BLOCKED (PROCESSOR_RELATIONSHIP_NOT_ACTIVE)
  if (relationshipId && mechanismId) {
    try {
      await updateRelationshipStatus(relationshipId, "INACTIVE", identity);
      const decRes = await evaluateTransfer(
        {
          relationship_id: relationshipId,
          transfer_mechanism_id: mechanismId,
          destination_jurisdiction: "US",
          assessment_required: false,
        },
        identity
      );
      await updateRelationshipStatus(relationshipId, "ACTIVE", identity);

      const isBlocked =
        decRes.ok &&
        decRes.data.result === "BLOCKED" &&
        decRes.data.reason_codes.includes("PROCESSOR_RELATIONSHIP_NOT_ACTIVE");

      results.push({
        id: "TC-PRV05-06",
        name: "Negative: Suspended/Inactive Relationship Blocks Egress",
        type: "negative",
        description: "Evaluate transfer against relationship set to INACTIVE status",
        expectedStatus: "BLOCKED (PROCESSOR_RELATIONSHIP_NOT_ACTIVE)",
        actualResult: decRes.ok
          ? `Result: ${decRes.data.result} [${decRes.data.reason_codes.join(", ")}]`
          : decRes.error.message,
        passed: isBlocked,
        details: "PRV-05 halts all pipeline transfers when processor relationship status is INACTIVE.",
      });
    } catch (err: unknown) {
      results.push({
        id: "TC-PRV05-06",
        name: "Negative: Suspended/Inactive Relationship Blocks Egress",
        type: "negative",
        description: "Evaluate transfer against relationship set to INACTIVE status",
        expectedStatus: "BLOCKED (PROCESSOR_RELATIONSHIP_NOT_ACTIVE)",
        actualResult: String(err),
        passed: false,
        details: "Exception thrown.",
      });
    }
  }

  // Scenario 7 (Negative): Assessment Required But Missing -> Expected: REVIEW_REQUIRED (ASSESSMENT_REQUIRED_NOT_FOUND)
  if (mechanismId) {
    try {
      const freshRel = await createProcessorRelationship(
        {
          controller_ref: "ZOIKO-FINANCE-CORP",
          processor_ref: "UNASSESSED-HOSTING-LTD",
          service: "Ad-hoc Analytics Export",
          processing_instructions: "Export financial analytics to third-party",
          contract_evidence_ref: "DPA-2026-UNASSESSED-01",
          jurisdictions: ["EU-GDPR"],
        },
        identity
      );

      if (freshRel.ok) {
        const decRes = await evaluateTransfer(
          {
            relationship_id: freshRel.data.relationship_id,
            transfer_mechanism_id: mechanismId,
            destination_jurisdiction: "US",
            assessment_required: true,
          },
          identity
        );

        const isReviewRequired =
          decRes.ok &&
          decRes.data.result === "REVIEW_REQUIRED" &&
          decRes.data.reason_codes.includes("ASSESSMENT_REQUIRED_NOT_FOUND");

        results.push({
          id: "TC-PRV05-07",
          name: "Negative: Missing Required Assessment Triggers Review",
          type: "negative",
          description: "Evaluate transfer with assessment_required: true when no assessment was recorded",
          expectedStatus: "REVIEW_REQUIRED (ASSESSMENT_REQUIRED_NOT_FOUND)",
          actualResult: decRes.ok
            ? `Result: ${decRes.data.result} [${decRes.data.reason_codes.join(", ")}]`
            : decRes.error.message,
          passed: isReviewRequired,
          details: "Absence of a required DPIA/TIA automatically fails closed to human review.",
        });
      }
    } catch (err: unknown) {
      results.push({
        id: "TC-PRV05-07",
        name: "Negative: Missing Required Assessment Triggers Review",
        type: "negative",
        description: "Evaluate transfer with missing required assessment",
        expectedStatus: "REVIEW_REQUIRED (ASSESSMENT_REQUIRED_NOT_FOUND)",
        actualResult: String(err),
        passed: false,
        details: "Exception thrown.",
      });
    }
  }

  // Scenario 8 (Negative): Rejected Transfer Assessment -> Expected: BLOCKED (ASSESSMENT_REJECTED)
  if (relationshipId && mechanismId) {
    try {
      await recordTransferAssessment(
        {
          relationship_id: relationshipId,
          outcome: "REJECT",
          residual_risk: "CRITICAL - Destination surveillance laws permit warrantless mass interception",
          evidence_ref: "TIA-REJECT-DOC-2026-09",
        },
        identity
      );

      const decRes = await evaluateTransfer(
        {
          relationship_id: relationshipId,
          transfer_mechanism_id: mechanismId,
          destination_jurisdiction: "US",
          assessment_required: true,
        },
        identity
      );

      // Re-record APPROVE to restore clean state for the relationship
      await recordTransferAssessment(
        {
          relationship_id: relationshipId,
          outcome: "APPROVE",
          residual_risk: "LOW - Mitigated by customer-held HSM encryption keys",
          evidence_ref: "TIA-2026-AWS-EU-01",
        },
        identity
      );

      const isBlocked =
        decRes.ok &&
        decRes.data.result === "BLOCKED" &&
        decRes.data.reason_codes.includes("ASSESSMENT_REJECTED");

      results.push({
        id: "TC-PRV05-08",
        name: "Negative: Rejected Assessment Outcome Blocks Egress",
        type: "negative",
        description: "Evaluate transfer when latest assessment outcome is REJECT",
        expectedStatus: "BLOCKED (ASSESSMENT_REJECTED)",
        actualResult: decRes.ok
          ? `Result: ${decRes.data.result} [${decRes.data.reason_codes.join(", ")}]`
          : decRes.error.message,
        passed: isBlocked,
        details: "A rejected Schrems II TIA assessment immediately halts transfer gate authorization.",
      });
    } catch (err: unknown) {
      results.push({
        id: "TC-PRV05-08",
        name: "Negative: Rejected Assessment Outcome Blocks Egress",
        type: "negative",
        description: "Evaluate transfer with REJECT assessment",
        expectedStatus: "BLOCKED (ASSESSMENT_REJECTED)",
        actualResult: String(err),
        passed: false,
        details: "Exception thrown.",
      });
    }
  }

  // Scenario 9 (Negative): Assessment with REMEDIATE Outcome -> Expected: REVIEW_REQUIRED (ASSESSMENT_REQUIRES_REMEDIATION)
  if (relationshipId && mechanismId) {
    try {
      await recordTransferAssessment(
        {
          relationship_id: relationshipId,
          outcome: "REMEDIATE",
          residual_risk: "MEDIUM - Additional supplementary cryptographic measures required prior to production",
          evidence_ref: "TIA-REMEDIATE-DOC-2026-09",
        },
        identity
      );

      const decRes = await evaluateTransfer(
        {
          relationship_id: relationshipId,
          transfer_mechanism_id: mechanismId,
          destination_jurisdiction: "US",
          assessment_required: true,
        },
        identity
      );

      // Restore to APPROVE
      await recordTransferAssessment(
        {
          relationship_id: relationshipId,
          outcome: "APPROVE",
          residual_risk: "LOW - Mitigated by customer-held HSM encryption keys",
          evidence_ref: "TIA-2026-AWS-EU-01",
        },
        identity
      );

      const isReviewRequired =
        decRes.ok &&
        decRes.data.result === "REVIEW_REQUIRED" &&
        decRes.data.reason_codes.includes("ASSESSMENT_REQUIRES_REMEDIATION");

      results.push({
        id: "TC-PRV05-09",
        name: "Negative: Remediate Outcome Requires Compliance Review",
        type: "negative",
        description: "Evaluate transfer when latest assessment outcome is REMEDIATE",
        expectedStatus: "REVIEW_REQUIRED (ASSESSMENT_REQUIRES_REMEDIATION)",
        actualResult: decRes.ok
          ? `Result: ${decRes.data.result} [${decRes.data.reason_codes.join(", ")}]`
          : decRes.error.message,
        passed: isReviewRequired,
        details: "Assessment requiring remediation pauses automated egress pending sign-off.",
      });
    } catch (err: unknown) {
      results.push({
        id: "TC-PRV05-09",
        name: "Negative: Remediate Outcome Requires Compliance Review",
        type: "negative",
        description: "Evaluate transfer with REMEDIATE assessment",
        expectedStatus: "REVIEW_REQUIRED (ASSESSMENT_REQUIRES_REMEDIATION)",
        actualResult: String(err),
        passed: false,
        details: "Exception thrown.",
      });
    }
  }

  // Scenario 10 (Negative): Missing Mandatory Fields on Relationship Creation -> Expected: HTTP 400 Bad Request
  try {
    const badRes = await createProcessorRelationship(
      {
        controller_ref: "",
        processor_ref: "",
        service: "",
      },
      identity
    );
    const isRejected = !badRes.ok && badRes.error.status === 400;
    results.push({
      id: "TC-PRV05-10",
      name: "Negative: Schema Validation on Missing Required Fields",
      type: "negative",
      description: "POST /privacy/processor-relationships with blank controller_ref, processor_ref and service",
      expectedStatus: "HTTP 400 Bad Request",
      actualResult: !badRes.ok ? `Status ${badRes.error.status}: ${badRes.error.message}` : "Unexpectedly Allowed",
      passed: isRejected,
      details: "Contract enforces mandatory controller_ref, processor_ref, and service.",
    });
  } catch (err: unknown) {
    results.push({
      id: "TC-PRV05-10",
      name: "Negative: Schema Validation on Missing Required Fields",
      type: "negative",
      description: "POST with empty required fields",
      expectedStatus: "HTTP 400 Bad Request",
      actualResult: String(err),
      passed: false,
      details: "Exception thrown.",
    });
  }

  return results;
}
