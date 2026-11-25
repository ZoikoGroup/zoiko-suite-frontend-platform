// The top of the Authorization console: five headline figures and three
// panels, all computed from the same reads as the registers below them, so a
// number and the rows it counts can never disagree. A register that could not
// be read shows "—" and says so; it is never counted as zero.

import { Inbox, KeyRound, Scale, ShieldAlert, Siren } from "lucide-react";
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
import { explainAuthzError } from "@/lib/api/authorization";
import { humanizeKey } from "@/lib/humanize";
import { firstProblem, type AuthzData } from "./data";
import { area } from "./decisions";
import { delegationState } from "./delegations";
import { grantState } from "./grants";
import { limitPending } from "./limits";
import { href, type Ctx } from "./register";
import { exceptionsInForce } from "./rules";
import { allSessions } from "./sessions";

const UNREAD = { value: "—", tone: "neutral" as const, status: "Unavailable", helper: "could not be read" };

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function AuthorizationKpis({ data, ctx }: { data: AuthzData; ctx: Ctx }) {
  const live = data.assignments.rows.filter((a) => grantState(a, ctx.now) === "live").length;
  const activeRoles = data.roles.rows.filter((r) => r.active_flag).length;
  const yours = data.approvals.filter((i) => !i.notYours).length;
  const approvalsProblem = firstProblem(data.assignments, data.jit, data.breakGlass, data.sodRules, data.abac, data.limits, data.exceptions);
  const rules = data.sodRules.rows.filter((r) => r.active_flag).length;
  const exceptions = exceptionsInForce(data.exceptions.rows, ctx.now).length;
  const sessions = allSessions(data);
  const active = sessions.filter((x) => x.s.status === "ACTIVE");
  const breakGlassLive = active.some((x) => x.kind === "break_glass");
  const reviewsDue = sessions.filter((x) => x.kind !== "support" && x.s.review_status === "PENDING").length;
  const decisions = data.decisions.rows;
  const refused = decisions.filter((d) => d.decision_outcome === "DENIED").length;

  const grants = data.assignments.error
    ? UNREAD
    : { value: live, tone: "navy" as const, status: plural(activeRoles, "role"), helper: "held in force now" };
  const sod = data.sodRules.error
    ? UNREAD
    : rules === 0
      ? { value: 0, tone: "amber" as const, status: "None in force", helper: "no pair of duties is blocked" }
      : { value: rules, tone: "green" as const, status: "Enforced", helper: `${plural(exceptions, "exception")} in force` };
  const elevated =
    data.jit.error && data.breakGlass.error && data.support.error
      ? UNREAD
      : {
          value: active.length,
          tone: breakGlassLive ? ("red" as const) : active.length > 0 ? ("amber" as const) : ("green" as const),
          status: breakGlassLive ? "Break-glass live" : active.length > 0 ? "Active now" : "None active",
          helper: reviewsDue > 0 ? `${plural(reviewsDue, "review")} due` : "JIT, emergency and support",
        };
  const refusals = data.decisions.error
    ? UNREAD
    : decisions.length === 0
      ? { value: 0, tone: "neutral" as const, status: "No checks yet", helper: "nothing recorded" }
      : {
          value: refused,
          tone: refused > 0 ? ("amber" as const) : ("green" as const),
          status: `${Math.round((refused / decisions.length) * 100)}% refused`,
          helper: `of the latest ${decisions.length} checks`,
        };

  return (
    <KpiGrid>
      <KpiCard label="Live role grants" icon={KeyRound} href={href({ tab: "grants", state: "live" })} {...grants} />
      <KpiCard
        label="Awaiting approval"
        icon={Inbox}
        href={href({ tab: "approvals" })}
        value={data.approvals.length}
        tone={data.approvals.length > 0 ? "amber" : "green"}
        status={data.approvals.length > 0 ? "Pending sign-off" : "Clear"}
        helper={approvalsProblem ? "some registers unreadable" : yours > 0 ? `${yours} yours to decide` : "maker-checker queue"}
      />
      <KpiCard label="Duty-conflict rules" icon={Scale} href={href({ tab: "sod", state: "active" })} {...sod} />
      <KpiCard label="Elevated sessions" icon={Siren} href={href({ tab: "elevated", state: "ACTIVE" })} {...elevated} />
      <KpiCard label="Refused checks" icon={ShieldAlert} href={href({ tab: "decisions", outcome: "DENIED" })} {...refusals} />
    </KpiGrid>
  );
}

export function AuthorizationPanels({ data, ctx }: { data: AuthzData; ctx: Ctx }) {
  return (
    <PanelGrid>
      <LifecyclePanel data={data} />
      <EvaluationPanel data={data} ctx={ctx} />
      <OutcomesPanel data={data} />
    </PanelGrid>
  );
}

function LifecyclePanel({ data }: { data: AuthzData }) {
  const sessions = allSessions(data);
  const reviewed = sessions.filter((x) => x.kind !== "support");
  const unreadable = data.jit.error && data.breakGlass.error && data.support.error;
  return (
    <ConsolePanel
      title="Elevated access lifecycle"
      description="Just-in-time, emergency and support sessions, from request to signed-off review"
      link={{ label: "Review queue", href: href({ tab: "elevated", review: "PENDING" }) }}
    >
      {unreadable ? (
        <PanelNote>{explainAuthzError(data.jit.error!)}</PanelNote>
      ) : (
        <Pipeline
          stages={[
            {
              label: "Requested",
              value: sessions.filter((x) => x.s.status === "PENDING_APPROVAL").length,
              caption: "Awaiting approver",
              href: href({ tab: "elevated", state: "PENDING_APPROVAL" }),
            },
            {
              label: "Active",
              value: sessions.filter((x) => x.s.status === "ACTIVE").length,
              caption: "In force now",
              href: href({ tab: "elevated", state: "ACTIVE" }),
            },
            {
              label: "Review due",
              value: reviewed.filter((x) => x.s.review_status === "PENDING").length,
              caption: "Ended, not yet reviewed",
              href: href({ tab: "elevated", review: "PENDING" }),
            },
            {
              label: "Attested",
              value: reviewed.filter((x) => x.s.review_status === "ATTESTED").length,
              caption: "Reviewed and signed off",
              href: href({ tab: "elevated", review: "ATTESTED" }),
            },
          ]}
          note="Every session names exact actions and ends on its own; emergency access is reviewed once it ends."
        />
      )}
    </ConsolePanel>
  );
}

function EvaluationPanel({ data, ctx }: { data: AuthzData; ctx: Ctx }) {
  const n = (read: { error: unknown }, count: number, one: string, many: string) =>
    read.error ? "could not be read" : `${count} ${count === 1 ? one : many}`;
  const live = data.assignments.rows.filter((a) => grantState(a, ctx.now) === "live").length;
  const delegations = data.delegations.rows.filter((d) => delegationState(d, ctx.now) === "ACTIVE").length;
  const sessions = allSessions(data).filter((x) => x.s.status === "ACTIVE").length;
  const limits = data.limits.rows.filter((l) => l.status === "ACTIVE" && !limitPending(l)).length;
  return (
    <ConsolePanel
      title="How a permission check is decided"
      description="Layers in the order the service applies them, after the person's own standing"
      link={{ label: "Check access", href: href({ tab: "check" }) }}
    >
      <OrderedModel
        steps={[
          { title: "Role grants", caption: n(data.assignments, live, "live grant", "live grants"), chip: "Grants", tone: "navy" },
          {
            title: "Delegated & elevated authority",
            caption: `${n(data.delegations, delegations, "delegation", "delegations")} · ${plural(sessions, "elevated session")}`,
            chip: "Extends",
            tone: "green",
          },
          {
            title: "Separation of duties",
            caption: n(data.sodRules, data.sodRules.rows.filter((r) => r.active_flag).length, "rule in force", "rules in force"),
            chip: "Refuses",
            tone: "red",
          },
          {
            title: "Access conditions",
            caption: n(data.abac, data.abac.rows.filter((r) => r.active_flag).length, "condition on the request", "conditions on the request"),
            chip: "Refuses",
            tone: "red",
          },
          {
            title: "Authority limits & two-step",
            caption: n(data.limits, limits, "monetary limit in force", "monetary limits in force"),
            chip: "Caps",
            tone: "amber",
          },
        ]}
      />
    </ConsolePanel>
  );
}

function OutcomesPanel({ data }: { data: AuthzData }) {
  const decisions = data.decisions.rows;
  const byArea = new Map<string, { total: number; allowed: number }>();
  for (const d of decisions) {
    const a = byArea.get(area(d.action_type)) ?? { total: 0, allowed: 0 };
    a.total += 1;
    if (d.decision_outcome === "GRANTED") a.allowed += 1;
    byArea.set(area(d.action_type), a);
  }
  const top = [...byArea.entries()].sort((x, y) => y[1].total - x[1].total).slice(0, 5);
  const refused = decisions.filter((d) => d.decision_outcome === "DENIED").length;

  return (
    <ConsolePanel
      title="Decision outcomes"
      description={decisions.length ? `Share allowed in the latest ${decisions.length} recorded checks, by area` : "Share of recorded checks allowed, by area"}
      link={{ label: "Decision log", href: href({ tab: "decisions" }) }}
      className="lg:col-span-2 2xl:col-span-1"
    >
      {data.decisions.error ? (
        <PanelNote>{explainAuthzError(data.decisions.error)}</PanelNote>
      ) : decisions.length === 0 ? (
        <PanelNote>No permission checks have been recorded yet.</PanelNote>
      ) : (
        <>
          <BarList
            bars={top.map(([name, a]) => ({
              label: humanizeKey(name),
              percent: (a.allowed / a.total) * 100,
              warnBelow: 80,
              title: `${a.allowed} of ${a.total} allowed`,
            }))}
          />
          <div className="mt-5 flex flex-1 flex-col">
            {refused > 0 ? (
              <PanelCallout>
                {refused} of {decisions.length} recent checks were refused. Each one names the layer that refused it.
              </PanelCallout>
            ) : (
              <PanelCallout tone="info">No refusals among the latest {decisions.length} checks.</PanelCallout>
            )}
          </div>
        </>
      )}
    </ConsolePanel>
  );
}
