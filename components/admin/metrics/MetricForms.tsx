"use client";

import { useActionState, useState } from "react";
import { BarChart3, GitBranch, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import {
  createMetricAction,
  publishVersionAction,
} from "@/app/admin/metrics/actions";
import {
  IDLE_CREATE_METRIC,
  IDLE_PUBLISH_VERSION,
  type CreateMetricState,
  type PublishVersionState,
} from "@/app/admin/metrics/state";
import type { ReportMetricDefinition } from "@/lib/api/metric-registry";

const CREATE_TONE = {
  created: "success",
  conflict: "warning",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

const PUBLISH_TONE = {
  published: "success",
  notFound: "warning",
  refused: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
} as const;

// ─── Create Metric Form (Version 1) ──────────────────────────────────────────

export function CreateMetricForm({
  principalId,
  correlationId,
}: {
  principalId: string;
  correlationId: string;
}) {
  const [state, action, pending] = useActionState<CreateMetricState, FormData>(
    createMetricAction,
    IDLE_CREATE_METRIC,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="correlation_id" value={correlationId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="create_metric_code">
            Metric code
          </label>
          <input
            className={FIELD}
            id="create_metric_code"
            name="metric_code"
            placeholder="NRR_ANNUAL"
            required
          />
          <p className={HINT}>
            Permanent alphanumeric code (e.g. NRR_ANNUAL, GROSS_MARGIN_PCT). Shared across every version.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="create_metric_name">
            Metric name
          </label>
          <input
            className={FIELD}
            id="create_metric_name"
            name="metric_name"
            placeholder="Net Revenue Retention Rate (Annual)"
            required
          />
          <p className={HINT}>Human-readable executive title for reports and dashboards.</p>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="create_formula_description">
            Formula description
          </label>
          <textarea
            className={FIELD}
            id="create_formula_description"
            name="formula_description"
            rows={2}
            placeholder="(Beginning ARR + Expansion ARR - Contraction ARR - Churn ARR) / Beginning ARR * 100"
            required
          />
          <p className={HINT}>
            Doc7 §27 REP-01 requirement: Human-readable definition of the calculation so operational
            intelligence is not misrepresented as financial or legal assurance.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="create_data_sources">
            Data sources <span className={OPTIONAL}>(optional)</span>
          </label>
          <input
            className={FIELD}
            id="create_data_sources"
            name="data_sources"
            placeholder="general-ledger-svc, commercial-account-svc, stripe-connector"
          />
          <p className={HINT}>Comma-separated upstream services or systems computed from.</p>
        </div>

        <div>
          <label className={LABEL} htmlFor="create_owner_principal_id">
            Accountable owner principal ID
          </label>
          <input
            className={FIELD}
            id="create_owner_principal_id"
            name="owner_principal_id"
            defaultValue={principalId}
            required
          />
          <p className={HINT}>Segregation-of-duties doctrine requires an explicit owner for executive metrics.</p>
        </div>

        <div>
          <label className={LABEL} htmlFor="create_effective_from">
            Effective from
          </label>
          <input
            type="date"
            className={FIELD}
            id="create_effective_from"
            name="effective_from"
            defaultValue={new Date().toISOString().split("T")[0]}
            required
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Register metric"}
        </Button>
        <p className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
          Always creates Version 1 as ACTIVE with required intelligence disclaimer.
        </p>
      </div>

      {state.status !== "idle" && (
        <ResultBanner tone={CREATE_TONE[state.status]} message={state.message}>
          {state.status === "created" && <CopyableId value={state.metric.metric_definition_id} />}
        </ResultBanner>
      )}
    </form>
  );
}

// ─── Publish New Version Form ────────────────────────────────────────────────

export function PublishVersionForm({
  activeMetrics,
  principalId,
  correlationId,
}: {
  activeMetrics: ReportMetricDefinition[];
  principalId: string;
  correlationId: string;
}) {
  const [selectedCode, setSelectedCode] = useState<string>("");
  const selectedMetric = activeMetrics.find((m) => m.metric_code === selectedCode);

  const [state, action, pending] = useActionState<PublishVersionState, FormData>(
    publishVersionAction,
    IDLE_PUBLISH_VERSION,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="correlation_id" value={correlationId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="publish_metric_code">
            Select metric to evolve
          </label>
          {activeMetrics.length > 0 ? (
            <select
              className={FIELD}
              id="publish_metric_code"
              name="metric_code"
              value={selectedCode}
              onChange={(e) => setSelectedCode(e.target.value)}
              required
            >
              <option value="">Choose an active metric…</option>
              {activeMetrics.map((m) => (
                <option key={m.metric_code} value={m.metric_code}>
                  {m.metric_code} — {m.metric_name} (currently v{m.version})
                </option>
              ))}
            </select>
          ) : (
            <input
              className={FIELD}
              id="publish_metric_code"
              name="metric_code"
              placeholder="NRR_ANNUAL"
              required
            />
          )}
          <p className={HINT}>
            Publishing creates Version N+1 and atomically transitions previous active version to SUPERSEDED.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="publish_metric_name">
            Revised metric name
          </label>
          <input
            className={FIELD}
            id="publish_metric_name"
            name="metric_name"
            defaultValue={selectedMetric?.metric_name ?? ""}
            key={selectedMetric?.metric_name}
            placeholder="Net Revenue Retention Rate (Annual)"
            required
          />
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="publish_formula_description">
            Updated formula description
          </label>
          <textarea
            className={FIELD}
            id="publish_formula_description"
            name="formula_description"
            rows={2}
            defaultValue={selectedMetric?.formula_description ?? ""}
            key={selectedMetric?.formula_description}
            placeholder="Revised formula with foreign-exchange multi-currency adjustments..."
            required
          />
          <p className={HINT}>
            Specify the revised calculation. The old version remains permanently intact in version lineage.
          </p>
        </div>

        <div>
          <label className={LABEL} htmlFor="publish_data_sources">
            Data sources <span className={OPTIONAL}>(optional)</span>
          </label>
          <input
            className={FIELD}
            id="publish_data_sources"
            name="data_sources"
            defaultValue={selectedMetric?.data_sources?.join(", ") ?? ""}
            key={selectedMetric?.data_sources?.join(", ")}
            placeholder="general-ledger-svc, commercial-account-svc, tax-rules-svc"
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="publish_owner_principal_id">
            Accountable owner principal ID
          </label>
          <input
            className={FIELD}
            id="publish_owner_principal_id"
            name="owner_principal_id"
            defaultValue={selectedMetric?.owner_principal_id || principalId}
            key={selectedMetric?.owner_principal_id}
            required
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="publish_effective_from">
            Effective from
          </label>
          <input
            type="date"
            className={FIELD}
            id="publish_effective_from"
            name="effective_from"
            defaultValue={new Date().toISOString().split("T")[0]}
            required
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} variant="secondary">
          {pending ? "Publishing…" : "Publish new version"}
        </Button>
        <p className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <GitBranch className="h-3.5 w-3.5" />
          Atomically supersedes current version; history is preserved immutably.
        </p>
      </div>

      {state.status !== "idle" && (
        <ResultBanner tone={PUBLISH_TONE[state.status]} message={state.message}>
          {state.status === "published" && <CopyableId value={state.metric.metric_definition_id} />}
        </ResultBanner>
      )}
    </form>
  );
}
