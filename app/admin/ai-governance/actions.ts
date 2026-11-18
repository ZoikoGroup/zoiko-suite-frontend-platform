"use server";

// Writes to ai-governance-svc from the AI Governance page.
//
// Each form sends the fields the service's request types declare
// (internal/domain/types.go: CreateAIRunRequest, RegisterModelProviderRequest,
// SetActionRiskClassificationRequest). Identity is the session's. A refusal is
// returned as the service gave it, with its HTTP status: nothing is reported
// as recorded unless the service recorded it.

import { refresh } from "next/cache";
import { apiPost } from "@/lib/api/client";
import type { CreateState } from "@/components/admin/intelligence/create-state";
import {
  sessionIdentity,
  expired,
  missing,
  invalid,
  text,
  checked,
  listOf,
  numberOf,
  toState,
  show,
} from "@/app/admin/intelligence/create-support";

const RUN_TYPES = ["CLASSIFY", "SUMMARIZE", "EXTRACT", "COMPARE", "DRAFT", "PRIORITIZE", "RECOMMEND", "EXPLAIN"];
const UNCERTAINTY = ["NONE", "UNCERTAIN", "CONFLICT", "NO_SOURCE"];
const TRAINING = ["NO_TRAINING", "OPT_OUT_AVAILABLE", "ALLOWED"];
const RISK_CATEGORIES = [
  "NONE", "MONEY", "EMPLOYMENT", "TAX_FILING", "LEGAL_POSITION", "EXTERNAL_CERTIFICATION",
  "ACCESS_SECURITY", "CONTRACTUAL_COMMITMENT", "RECORD_DELETION", "RETENTION_LEGAL_HOLD", "REGULATED_REPORTING",
];

type Raw = Record<string, unknown>;
/** The record under a wrapper key, or the body itself. */
const unwrap = (d: unknown, key: string): Raw => {
  const r = (d ?? {}) as Raw;
  return (r[key] && typeof r[key] === "object" ? r[key] : r) as Raw;
};

/** Record one AI run with its model, prompt and evidence references (POST /v1/ai-runs). */
export async function recordAiRunAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const absent = missing(previous, fd, [
    ["run_type", "Run type"],
    ["model_id", "Model"],
    ["prompt_version", "Prompt version"],
    ["audit_id", "Audit id"],
  ], [["confidence", "Confidence"]]);
  if (absent) return absent;
  if (!RUN_TYPES.includes(text(fd, "run_type"))) return invalid(previous, fd, "Choose a run type.");
  const uncertainty = text(fd, "uncertainty_state");
  if (uncertainty && !UNCERTAINTY.includes(uncertainty)) return invalid(previous, fd, "Choose an uncertainty state.");
  const confidence = numberOf(fd, "confidence");
  if (confidence !== undefined && (confidence < 0 || confidence > 1)) return invalid(previous, fd, "Confidence is between 0 and 1.");

  const body: Raw = {
    run_type: text(fd, "run_type"),
    model_id: text(fd, "model_id"),
    prompt_version: text(fd, "prompt_version"),
    audit_id: text(fd, "audit_id"),
    correlation_id: crypto.randomUUID(),
  };
  if (text(fd, "tool_version")) body.tool_version = text(fd, "tool_version");
  if (listOf(fd, "source_refs").length) body.source_refs = listOf(fd, "source_refs");
  if (listOf(fd, "evidence_refs").length) body.evidence_refs = listOf(fd, "evidence_refs");
  if (confidence !== undefined) body.confidence = confidence;
  if (text(fd, "limitation")) body.limitation = text(fd, "limitation");
  if (uncertainty) body.uncertainty_state = uncertainty;
  if (text(fd, "recommended_action")) body.recommended_action = text(fd, "recommended_action");

  const res = await apiPost<unknown>("aiGovernance", "/v1/ai-runs", body, { identity });
  if (res.ok) refresh();
  return toState(previous, fd, res, "ai-governance-svc", (d) => {
    const r = unwrap(d, "run");
    return [
      ["Run", show(r.ai_run_id ?? r.run_id)],
      ["Type", show(r.run_type)],
      ["Model", show(r.model_id)],
      ["Uncertainty", show(r.uncertainty_state)],
    ];
  });
}

/** Register a model provider and its data posture (POST /v1/model-providers). */
export async function registerModelProviderAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const absent = missing(previous, fd, [
    ["provider_name", "Provider"],
    ["model_name", "Model"],
    ["data_region", "Data region"],
  ]);
  if (absent) return absent;
  const training = text(fd, "training_use_posture");
  if (training && !TRAINING.includes(training)) return invalid(previous, fd, "Choose a training-use posture.");

  const body: Raw = {
    provider_name: text(fd, "provider_name"),
    model_name: text(fd, "model_name"),
    data_region: text(fd, "data_region"),
    dpa_verified: checked(fd, "dpa_verified"),
    correlation_id: crypto.randomUUID(),
  };
  if (training) body.training_use_posture = training;
  if (text(fd, "retention_policy_ref")) body.retention_policy_ref = text(fd, "retention_policy_ref");
  if (listOf(fd, "approved_data_classes").length) body.approved_data_classes = listOf(fd, "approved_data_classes");

  const res = await apiPost<unknown>("aiGovernance", "/v1/model-providers", body, { identity });
  if (res.ok) refresh();
  return toState(previous, fd, res, "ai-governance-svc", (d) => {
    const r = unwrap(d, "provider");
    return [
      ["Registration", show(r.provider_registration_id)],
      ["Model", `${show(r.provider_name)} / ${show(r.model_name)}`],
      ["Training use", show(r.training_use_posture)],
      ["Region", show(r.data_region)],
    ];
  });
}

/** Classify a business action's risk (POST /v1/action-risk-classifications). */
export async function setActionRiskAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const absent = missing(previous, fd, [["action_type", "Action type"], ["risk_category", "Risk category"]]);
  if (absent) return absent;
  if (!RISK_CATEGORIES.includes(text(fd, "risk_category"))) return invalid(previous, fd, "Choose a risk category.");

  const res = await apiPost<unknown>(
    "aiGovernance",
    "/v1/action-risk-classifications",
    {
      action_type: text(fd, "action_type"),
      risk_category: text(fd, "risk_category"),
      human_review_trigger: checked(fd, "human_review_trigger"),
      requires_maker_checker: checked(fd, "requires_maker_checker"),
      correlation_id: crypto.randomUUID(),
    },
    { identity },
  );
  if (res.ok) refresh();
  return toState(previous, fd, res, "ai-governance-svc", (d) => {
    const r = unwrap(d, "classification");
    return [
      ["Action", show(r.action_type)],
      ["Risk category", show(r.risk_category)],
      ["Human review", show(r.human_review_trigger)],
      ["Maker-checker", show(r.requires_maker_checker)],
    ];
  });
}
