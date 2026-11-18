// The top of the Evidence Requirements console: five headline figures from the
// service's own summary and three panels. A figure the service could not read
// shows "—" and says so; it is never shown as zero.

import { ClipboardList, FileCheck2, FileWarning, Inbox, ShieldQuestion } from "lucide-react";
import {
  BarList,
  ConsolePanel,
  KpiCard,
  KpiGrid,
  OrderedModel,
  PanelCallout,
  PanelGrid,
  PanelNote,
  Pipeline,
} from "@/components/admin/console";
import { VERIFIED_BY, actionLabel, domainLabel, evidenceTypeLabel, readPresentArtifacts } from "@/lib/api/evidence";
import { explainEvidenceError } from "@/lib/api/evidence";
import type { EvidenceData } from "./data";
import { href } from "./shared";

const UNREAD = { value: "—", tone: "neutral" as const, status: "Unavailable", helper: "could not be read" };
const DAY = 24 * 60 * 60 * 1000;

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function EvidenceKpis({ data }: { data: EvidenceData }) {
  const s = data.summary.value;
  if (!s) {
    return (
      <KpiGrid>
        <KpiCard label="Active requirements" icon={ClipboardList} {...UNREAD} />
        <KpiCard label="Satisfied (30 d)" icon={FileCheck2} {...UNREAD} />
        <KpiCard label="Missing (30 d)" icon={FileWarning} {...UNREAD} />
        <KpiCard label="Actions with no requirements (30 d)" icon={ShieldQuestion} {...UNREAD} />
        <KpiCard label="Open evidence requests" icon={Inbox} {...UNREAD} />
      </KpiGrid>
    );
  }
  const checked = s.evaluations_satisfied_30d + s.evaluations_missing_30d;
  return (
    <KpiGrid>
      <KpiCard
        label="Active requirements"
        icon={ClipboardList}
        href={href({ tab: "requirements", state: "in_force" })}
        value={s.active_requirements}
        tone={s.active_requirements > 0 ? "navy" : "amber"}
        status={s.active_requirements > 0 ? "In force" : "None in force"}
        helper={s.active_requirements > 0 ? "gating actions now" : "no action is gated"}
      />
      <KpiCard
        label="Satisfied (30 d)"
        icon={FileCheck2}
        href={href({ tab: "evaluations", outcome: "SATISFIED" })}
        value={s.evaluations_satisfied_30d}
        tone="green"
        status={checked ? `${Math.round((s.evaluations_satisfied_30d / checked) * 100)}%` : "No checks"}
        helper={checked ? `of ${checked} gated checks` : "in the last 30 days"}
      />
      <KpiCard
        label="Missing (30 d)"
        icon={FileWarning}
        href={href({ tab: "missing" })}
        value={s.evaluations_missing_30d}
        tone={s.evaluations_missing_30d > 0 ? "red" : "green"}
        status={s.evaluations_missing_30d > 0 ? "Blocked" : "None blocked"}
        helper="actions held for evidence"
      />
      <KpiCard
        label="Actions with no requirements (30 d)"
        icon={ShieldQuestion}
        href={href({ tab: "evaluations", outcome: "NO_REQUIREMENTS_DEFINED" })}
        value={s.actions_with_no_requirements_30d}
        tone={s.actions_with_no_requirements_30d > 0 ? "amber" : "green"}
        status={s.actions_with_no_requirements_30d > 0 ? "Ungated" : "All gated"}
        helper={plural(s.evaluations_no_requirements_30d, "check")}
      />
      <KpiCard
        label="Open evidence requests"
        icon={Inbox}
        href={href({ tab: "requests", state: "open" })}
        value={s.open_pbc_requests}
        tone={s.overdue_pbc_requests > 0 ? "red" : "navy"}
        status={s.overdue_pbc_requests > 0 ? `${s.overdue_pbc_requests} overdue` : "On time"}
        helper="requested from contributors"
      />
    </KpiGrid>
  );
}

export function EvidencePanels({ data, now }: { data: EvidenceData; now: number }) {
  return (
    <PanelGrid>
      <GatePanel data={data} now={now} />
      <TypesPanel data={data} />
      <CoveragePanel data={data} now={now} />
    </PanelGrid>
  );
}

function GatePanel({ data, now }: { data: EvidenceData; now: number }) {
  const s = data.summary.value;
  if (!s) {
    return (
      <ConsolePanel title="Gate pipeline" description="How a check becomes a recorded decision and an event">
        <PanelNote>{explainEvidenceError(data.summary.error?.message ?? "")}</PanelNote>
      </ConsolePanel>
    );
  }
  const recent = data.evaluations.rows.filter((e) => now - new Date(e.evaluated_at).getTime() <= 30 * DAY);
  const verified = recent.filter((e) => readPresentArtifacts(e.present_artifacts_payload).some((a) => a.evidence_type in VERIFIED_BY)).length;
  const requested = s.evaluations_satisfied_30d + s.evaluations_missing_30d + s.evaluations_no_requirements_30d;
  const gated = s.evaluations_satisfied_30d + s.evaluations_missing_30d;
  return (
    <ConsolePanel
      title="Gate pipeline"
      description="Last 30 days: from the request to the decision and its event"
      link={{ label: "Evaluations", href: href({ tab: "evaluations" }) }}
    >
      <Pipeline
        stages={[
          { label: "Requested", value: requested, caption: "checks asked for", href: href({ tab: "evaluations" }) },
          { label: "Catalogue resolved", value: gated, caption: "had requirements in force" },
          {
            label: "Artifacts verified",
            value: data.evaluations.error ? "—" : verified,
            caption: data.evaluations.more ? "in the latest 1,000" : "checked with their owner",
          },
          { label: "Decision recorded", value: requested, caption: "append-only ledger" },
          {
            label: "Event published",
            value: gated,
            caption: s.unpublished_outbox_older_than_5_minutes > 0 ? `${s.unpublished_outbox_older_than_5_minutes} waiting > 5 min` : "satisfied / missing",
          },
        ]}
        note="An owner that cannot answer stops the check with no decision written; a replay returns the original answer and publishes nothing."
      />
    </ConsolePanel>
  );
}

function TypesPanel({ data }: { data: EvidenceData }) {
  const s = data.summary.value;
  const counts = s?.requirements_by_evidence_type ?? {};
  const types = [...new Set([...Object.keys(VERIFIED_BY), ...Object.keys(counts)])].sort(
    (a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || a.localeCompare(b),
  );
  return (
    <ConsolePanel
      title="Evidence types"
      description="Active requirements by kind, and who confirms each"
      link={{ label: "Requirements", href: href({ tab: "requirements" }) }}
    >
      {!s ? (
        <PanelNote>The catalogue summary could not be read.</PanelNote>
      ) : (
        <OrderedModel
          steps={types.slice(0, 5).map((t) => ({
            title: evidenceTypeLabel(t),
            caption: `${plural(counts[t] ?? 0, "active requirement")}`,
            chip: VERIFIED_BY[t] ?? "Caller's word",
            tone: VERIFIED_BY[t] ? "green" : "amber",
          }))}
        />
      )}
    </ConsolePanel>
  );
}

function CoveragePanel({ data, now }: { data: EvidenceData; now: number }) {
  const s = data.summary.value;
  const recent = data.evaluations.rows.filter((e) => now - new Date(e.evaluated_at).getTime() <= 30 * DAY);
  const byDomain = new Map<string, { total: number; gated: number }>();
  for (const e of recent) {
    const d = byDomain.get(e.domain_code) ?? { total: 0, gated: 0 };
    d.total += 1;
    if (e.outcome !== "NO_REQUIREMENTS_DEFINED") d.gated += 1;
    byDomain.set(e.domain_code, d);
  }
  const top = [...byDomain.entries()].sort((x, y) => y[1].total - x[1].total).slice(0, 5);
  const uncovered = s?.uncovered_actions ?? [];
  return (
    <ConsolePanel
      title="Catalogue coverage"
      description="Share of last-30-day checks that met a requirement, by area"
      link={{ label: "Ungated checks", href: href({ tab: "evaluations", outcome: "NO_REQUIREMENTS_DEFINED" }) }}
      className="lg:col-span-2 2xl:col-span-1"
    >
      {data.evaluations.error ? (
        <PanelNote>{explainEvidenceError(data.evaluations.error.message)}</PanelNote>
      ) : top.length === 0 ? (
        <PanelNote>No evidence checks in the last 30 days.</PanelNote>
      ) : (
        <>
          <BarList
            bars={top.map(([domain, d]) => ({
              label: domainLabel(domain),
              percent: (d.gated / d.total) * 100,
              warnBelow: 100,
              title: `${d.gated} of ${d.total} checks had a requirement in force`,
            }))}
          />
          <div className="mt-5 flex flex-1 flex-col">
            {uncovered.length > 0 ? (
              <PanelCallout>
                Checked with no requirement in force:{" "}
                {uncovered
                  .slice(0, 3)
                  .map((u) => `${domainLabel(u.domain_code)} · ${actionLabel(u.action_type)}`)
                  .join("; ")}
                {uncovered.length > 3 ? ` and ${uncovered.length - 3} more` : ""}. These actions are not being gated.
              </PanelCallout>
            ) : (
              <PanelCallout tone="info">Every action checked in the last 30 days had a requirement in force.</PanelCallout>
            )}
          </div>
        </>
      )}
    </ConsolePanel>
  );
}
