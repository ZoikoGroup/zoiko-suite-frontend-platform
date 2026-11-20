"use client";

// The AI Governance page's input forms: record an AI run, register a model
// provider, classify an action's risk. Each field and option is
// ai-governance-svc's own (internal/domain/types.go). The answer shown is the
// service's: the record it wrote, or its refusal with the HTTP status.

import { CreateRecordForm } from "@/components/admin/intelligence/CreateRecordForm";
import { opts, type FieldSpec } from "@/components/admin/intelligence/create-state";
import { recordAiRunAction, registerModelProviderAction, setActionRiskAction } from "@/app/admin/ai-governance/actions";

const RUN_FIELDS: FieldSpec[] = [
  { name: "run_type", label: "Run type", kind: "select", required: true, options: opts("CLASSIFY", "SUMMARIZE", "EXTRACT", "COMPARE", "DRAFT", "PRIORITIZE", "RECOMMEND", "EXPLAIN") },
  { name: "model_id", label: "Model", kind: "text", required: true, hint: "The registered model's id, e.g. provider/model." },
  { name: "prompt_version", label: "Prompt version", kind: "text", required: true },
  { name: "tool_version", label: "Tool version", kind: "text" },
  { name: "audit_id", label: "Audit id", kind: "text", required: true, hint: "The audit event that records this run." },
  { name: "confidence", label: "Confidence (0 to 1)", kind: "number", step: "0.01", min: "0", max: "1" },
  { name: "uncertainty_state", label: "Uncertainty state", kind: "select", options: opts("NONE", "UNCERTAIN", "CONFLICT", "NO_SOURCE") },
  { name: "recommended_action", label: "Recommended action", kind: "text" },
  { name: "source_refs", label: "Source references", kind: "text", hint: "Comma-separated." },
  { name: "evidence_refs", label: "Evidence references", kind: "text", hint: "Comma-separated." },
  { name: "limitation", label: "Limitation", kind: "textarea" },
];

const PROVIDER_FIELDS: FieldSpec[] = [
  { name: "provider_name", label: "Provider", kind: "text", required: true },
  { name: "model_name", label: "Model", kind: "text", required: true },
  { name: "data_region", label: "Data region", kind: "text", required: true, hint: "Where the provider processes data, e.g. eu-west-2." },
  { name: "training_use_posture", label: "Training use", kind: "select", options: opts("NO_TRAINING", "OPT_OUT_AVAILABLE", "ALLOWED"), hint: "Blank: the service records NO_TRAINING." },
  { name: "retention_policy_ref", label: "Retention policy reference", kind: "text" },
  { name: "approved_data_classes", label: "Approved data classes", kind: "text", hint: "Comma-separated; a call with any other class is blocked." },
  { name: "dpa_verified", label: "Data processing agreement verified", kind: "checkbox" },
];

const RISK_FIELDS: FieldSpec[] = [
  { name: "action_type", label: "Action type", kind: "text", required: true, hint: "The business action, e.g. PAYMENT_RELEASE." },
  {
    name: "risk_category",
    label: "Risk category",
    kind: "select",
    required: true,
    options: opts(
      "NONE", "MONEY", "EMPLOYMENT", "TAX_FILING", "LEGAL_POSITION", "EXTERNAL_CERTIFICATION",
      "ACCESS_SECURITY", "CONTRACTUAL_COMMITMENT", "RECORD_DELETION", "RETENTION_LEGAL_HOLD", "REGULATED_REPORTING",
    ),
  },
  { name: "human_review_trigger", label: "Requires human review", kind: "checkbox" },
  { name: "requires_maker_checker", label: "Requires maker-checker", kind: "checkbox" },
];

export function AiGovernanceInteractivePanel() {
  return (
    <div className="flex flex-wrap gap-2" data-ai-governance-forms>
      <CreateRecordForm
        title="Record an AI run"
        description="ai-governance-svc records the run with its model, prompt and evidence references. It does not call any model."
        fields={RUN_FIELDS}
        action={recordAiRunAction}
        submitLabel="Record run"
      />
      <CreateRecordForm
        title="Register a model provider"
        description="Registers the provider and model with their data posture; calls with unapproved data classes are blocked."
        fields={PROVIDER_FIELDS}
        action={registerModelProviderAction}
        submitLabel="Register"
      />
      <CreateRecordForm
        title="Classify an action's risk"
        description="Sets the risk category and the controls an action needs before automation may perform it."
        fields={RISK_FIELDS}
        action={setActionRiskAction}
        submitLabel="Save classification"
      />
    </div>
  );
}
