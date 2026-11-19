import type { ReactNode } from "react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import type { Clock, ClockState, ClockClass } from "@/lib/api/obligations";
import { formatDate, formatDateTime, formatDuration } from "@/lib/format";
import type { ObligationsData, ObligationsCtx } from "./data";
import { ObligationsReadProblem } from "./problem";
import { SatisfyClockDialog, WaiveClockDialog, NotApplicableClockDialog } from "./forms";
import { BASE } from "./shared";
import { CLOCK_STATE_LABEL, CLOCK_CLASS_LABEL, CLOCK_PIPELINE_ORDER } from "./data";
import { Clock as ClockIcon } from "lucide-react";

function chipOf(c: Clock) {
  return CLOCK_STATE_LABEL[c.clock_state] ?? { label: c.clock_state, tone: "neutral" as const };
}

function classChipOf(c: Clock) {
  return CLOCK_CLASS_LABEL[c.clock_class] ?? { label: c.clock_class, tone: "neutral" as const };
}

const OPEN = (c: Clock) => ["PLANNED", "ACTIVE", "DUE_SOON", "DUE", "OVERDUE"].includes(c.clock_state);

export function clocksRegister(data: ObligationsData, ctx: ObligationsCtx): RegisterSpec {
  const rows = data.clocks.rows;
  const byId = new Map(rows.map((c) => [c.clock_id, c]));
  return {
    base: BASE,
    problem: (error) => <ObligationsReadProblem error={error} what="deadline clocks" />,
    noun: "deadline clocks",
    what: "computed deadline clocks with calendar provenance",
    idColumn: "Clock",
    columns: [{ label: "Obligation" }, { label: "Class" }, { label: "Deadline" }, { label: "State" }],
    searchPlaceholder: "Search obligation, class, calendar or state",
    empty: "No deadline clocks recorded. Create one on an obligation’s drawer.",
    error: data.clocks.error,
    note: data.clocks.more ? "The register is longer than this console reads at once." : undefined,
    filters: [
      { name: "state", allLabel: "Any state", options: CLOCK_PIPELINE_ORDER.map((s) => [s, CLOCK_STATE_LABEL[s].label]) },
      { name: "class", allLabel: "Any class", options: Object.entries(CLOCK_CLASS_LABEL).map(([k, v]) => [k, v.label] as const) },
    ],
    rows: rows.map((c) => ({
      id: c.clock_id,
      idLabel: short(c.clock_id),
      search: [c.clock_id, c.obligation_id, c.clock_class, c.clock_state, c.calendar_code].join(" "),
      facets: { state: OPEN(c) ? "open" : "done", class: c.clock_class, clock_state: c.clock_state },
      cells: [
        <span key="o" className="whitespace-nowrap tabular-nums">{short(c.obligation_id)}</span>,
        <Chip key="cl" {...classChipOf(c)} />,
        <span key="d" className="whitespace-nowrap tabular-nums">{formatDate(c.computed_deadline)}</span>,
        <Chip key="s" {...chipOf(c)} />,
      ],
    })),
    drawer: (id, links) => {
      const c = byId.get(id);
      if (!c) return null;
      const isActive = OPEN(c);
      let actions: ReactNode = null;
      if (isActive) {
        actions = (
          <>
            {c.clock_state !== "FULFILLED" && <SatisfyClockDialog obligationId={c.obligation_id} clockId={c.clock_id} currentVersion={c.version} />}
            {c.clock_state !== "WAIVED" && <WaiveClockDialog obligationId={c.obligation_id} clockId={c.clock_id} currentVersion={c.version} />}
            {c.clock_state !== "NOT_APPLICABLE" && <NotApplicableClockDialog obligationId={c.obligation_id} clockId={c.clock_id} currentVersion={c.version} />}
          </>
        );
      }
      return (
        <DetailDrawer
          closeHref={links.close}
          icon={ClockIcon}
          title={`${c.clock_class} · ${c.calendar_code}`}
          subtitle={`Obligation ${short(c.obligation_id)} · Deadline ${formatDate(c.computed_deadline)}`}
          status={chipOf(c)}
          actions={actions}
        >
          <DrawerFacts
            items={[
              { label: "State", value: <Mono>{c.clock_state}</Mono> },
              { label: "Class", value: <Chip {...classChipOf(c)} /> },
              { label: "Calendar", value: <Mono>{`${c.calendar_code} (rule ${c.calendar_rule_id} v${c.calendar_rule_version})`}</Mono> },
              { label: "Computed Deadline", value: formatDateTime(c.computed_deadline) },
              { label: "Due Soon Threshold", value: <Mono>{c.due_soon_threshold}</Mono> },
              { label: "Obligation", value: <Mono>{c.obligation_id}</Mono> },
              { label: "Legal Entity", value: <Mono>{c.legal_entity_id}</Mono> },
              { label: "Created", value: formatDateTime(c.created_at) },
              { label: "Updated", value: formatDateTime(c.updated_at) },
              { label: "Version", value: `v${c.version}` },
              { label: "Reference", value: <Mono>{c.clock_id}</Mono> },
            ]}
          />
          {c.escalation_ladder.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Escalation Ladder</p>
              {c.escalation_ladder.map((step) => (
                <div key={step.step_order} className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <Chip label={`Step ${step.step_order}`} tone="neutral" />
                  <span>{step.after_overdue_by} → {step.escalated_to_role} ({step.action_type})</span>
                </div>
              ))}
            </div>
          )}
          {c.satisfied_at && (
            <DrawerNote>Satisfied by {who(c.satisfied_by_principal_id || "")} at {formatDateTime(c.satisfied_at!)} with evidence {c.satisfied_evidence_ids.join(", ")}</DrawerNote>
          )}
          {c.waived_at && (
            <DrawerNote>Waived by {who(c.waived_by_principal_id || "")} at {formatDateTime(c.waived_at!)} — {c.waived_reason}</DrawerNote>
          )}
          {c.not_applicable_at && (
            <DrawerNote>Marked N/A by {who(c.not_applicable_by_principal_id || "")} at {formatDateTime(c.not_applicable_at!)} — {c.not_applicable_reason}</DrawerNote>
          )}
          {c.superseded_at && (
            <DrawerNote>Superseded at {formatDateTime(c.superseded_at!)} by clock {c.superseded_by_clock_id}</DrawerNote>
          )}
          <DrawerNote>
            Clocks are computed from jurisdiction-rules business calendars. Only ACTIVE clocks are swept.
            FULFILLED requires evidence; WAIVED and NOT_APPLICABLE require authority principal and reason.
            Superseded clocks are replaced when the calendar rule changes.
          </DrawerNote>
        </DetailDrawer>
      );
    },
  };
}