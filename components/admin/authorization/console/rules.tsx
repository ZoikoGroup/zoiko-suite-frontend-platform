// The two rule registers: separation-of-duties pairs and access conditions.
// Both are governed the same way — a change is a request that takes effect
// when somebody other than its requester publishes it — so they share the
// state words and the command footer.

import { ListFilter, Scale } from "lucide-react";
import type { ReactNode } from "react";
import { DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { ABAC_OPERATORS, type ABACRule, type SoDException, type SoDRule } from "@/lib/api/authorization";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AuthzData } from "./data";
import { RequestExceptionDialog } from "./forms";
import { Chip, Command, Mono, StatusChip, short, who, type Ctx, type RegisterSpec } from "./register";

type Governed = Pick<SoDRule, "active_flag" | "publication_status" | "pending_change" | "change_requested_by">;

type RuleState = "active" | "pending" | "retired" | "rejected";

const STATE_FILTER = [
  ["active", "Active"],
  ["pending", "Change pending"],
  ["retired", "Retired"],
  ["rejected", "Rejected"],
] as const;

const PENDING_WORD: Record<string, string> = {
  PUBLISH: "Awaiting publication",
  RETIRE: "Retirement pending",
  REACTIVATE: "Reactivation pending",
};

function ruleState(r: Governed): RuleState {
  if (r.pending_change) return "pending";
  if (r.publication_status === "REJECTED") return "rejected";
  return r.active_flag ? "active" : "retired";
}

function ruleChip(r: Governed): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (r.pending_change) return { label: PENDING_WORD[r.pending_change] ?? "Change pending", tone: "warning" };
  if (r.publication_status === "REJECTED") return { label: "Rejected", tone: "danger" };
  return r.active_flag ? { label: "Active", tone: "success" } : { label: "Retired", tone: "neutral" };
}

const SCOPE_FILTER = [
  ["tenant", "This organisation"],
  ["platform", "Every organisation"],
] as const;

/**
 * The footer every governed rule shares: publish or reject a pending change
 * (never your own), otherwise retire or reactivate. Platform rules bind every
 * organisation and cannot be changed from inside one.
 */
function ruleCommands({
  rule,
  kind,
  id,
  me,
  version,
  tenantOwned,
}: {
  rule: Governed;
  kind: "sod_rule" | "abac";
  id: string;
  me: string;
  version?: number;
  tenantOwned: boolean;
}): ReactNode {
  if (!tenantOwned) return null;
  if (rule.pending_change) {
    if (rule.change_requested_by === me) return null;
    return (
      <>
        <Command command={`${kind}.reject`} id={id} label="Reject" title="Reject this change" reasons="reject" version={version} tone="danger" />
        <Command
          command={`${kind}.approve`}
          id={id}
          label="Publish"
          title="Publish this change"
          description="The change is in force from the moment you publish it."
          reasons="approve"
          version={version}
          tone="accent"
        />
      </>
    );
  }
  if (rule.publication_status === "REJECTED") return null;
  return rule.active_flag ? (
    <Command
      command={`${kind}.retire`}
      id={id}
      label="Retire"
      title="Retire this rule"
      description="Requested now; the rule keeps applying until someone else approves the change."
      reasons="change"
      version={version}
      tone="danger"
    />
  ) : (
    <Command
      command={`${kind}.reactivate`}
      id={id}
      label="Reactivate"
      title="Reactivate this rule"
      description="Requested now; it takes effect once someone else approves it."
      reasons="restore"
      version={version}
      tone="accent"
    />
  );
}

function ruleNote(rule: Governed, tenantOwned: boolean, me: string): ReactNode {
  if (!tenantOwned) return <DrawerNote>A platform rule: it binds every organisation and cannot be changed from inside one.</DrawerNote>;
  if (rule.pending_change && rule.change_requested_by === me)
    return <DrawerNote>You requested this change, so someone else must publish or reject it.</DrawerNote>;
  return null;
}

function changeFacts(r: Pick<SoDRule, "pending_change" | "change_requested_by" | "change_requested_at" | "change_reason" | "published_by" | "published_at" | "rejected_by" | "rejected_at" | "publication_status">) {
  return [
    { label: "Publication", value: <StatusChip status={r.publication_status ?? "PUBLISHED"} /> },
    { label: "Pending change", value: r.pending_change ? PENDING_WORD[r.pending_change] ?? r.pending_change : "None" },
    { label: "Requested by", value: who(r.change_requested_by) },
    { label: "Requested", value: r.change_requested_at ? formatDateTime(r.change_requested_at) : "—" },
    { label: "Reason", value: r.change_reason || "—" },
    { label: "Published by", value: who(r.published_by) },
    { label: "Published", value: r.published_at ? formatDateTime(r.published_at) : "—" },
    ...(r.rejected_by ? [{ label: "Rejected by", value: who(r.rejected_by) }, { label: "Rejected", value: r.rejected_at ? formatDateTime(r.rejected_at) : "—" }] : []),
  ];
}

// ── separation of duties ─────────────────────────────────────────────────────

const KIND: Record<string, string> = {
  HARD: "Never together",
  OWN_OBJECT_FORBIDDEN: "Not on own record",
};

export function conflictLabel(r: SoDRule): string {
  return r.action_a === r.action_b || !r.action_b ? `${r.action_a} (own record)` : `${r.action_a} ↔ ${r.action_b}`;
}

/** Exceptions that currently permit the pair. */
export function exceptionsInForce(rows: SoDException[], now: number) {
  return rows.filter((e) => e.status === "APPROVED" && new Date(e.expires_at).getTime() > now);
}

export function sodRegister(data: AuthzData, ctx: Ctx): RegisterSpec {
  const rules = data.sodRules.rows;
  const byId = new Map(rules.map((r) => [r.sod_rule_id, r]));
  const inForce = exceptionsInForce(data.exceptions.rows, ctx.now);
  const exceptionsOf = (ruleId: string) => data.exceptions.rows.filter((e) => e.sod_rule_id === ruleId);

  return {
    noun: "rules",
    what: "separation-of-duties rules",
    idColumn: "Rule ID",
    columns: [{ label: "Conflict" }, { label: "Kind" }, { label: "Applies to" }, { label: "Exceptions" }, { label: "State" }, { label: "Created" }],
    searchPlaceholder: "Search action, area or rule ID",
    empty: "No separation-of-duties rules yet. Propose one with “New rule”.",
    error: data.sodRules.error,
    filters: [
      { name: "state", allLabel: "All states", options: STATE_FILTER },
      { name: "kind", allLabel: "All kinds", options: Object.entries(KIND) as [string, string][] },
      { name: "scope", allLabel: "All scopes", options: SCOPE_FILTER },
    ],
    rows: rules.map((r) => {
      const live = inForce.filter((e) => e.sod_rule_id === r.sod_rule_id).length;
      return {
        id: r.sod_rule_id,
        idLabel: short(r.sod_rule_id),
        search: [r.sod_rule_id, r.domain_code, r.action_a, r.action_b, r.conflict_type].join(" "),
        facets: { state: ruleState(r), kind: r.conflict_type, scope: r.tenant_id ? "tenant" : "platform" },
        cells: [
          <TwoLine key="c" mono primary={conflictLabel(r)} secondary={r.domain_code} />,
          <span key="k" className="whitespace-nowrap">{KIND[r.conflict_type] ?? r.conflict_type}</span>,
          r.tenant_id ? "This organisation" : "Every organisation",
          live > 0 ? <span key="e" className="font-medium text-amber-700 dark:text-amber-400">{live} in force</span> : <span key="e" className="text-slate-400">—</span>,
          <Chip key="s" {...ruleChip(r)} />,
          <span key="d" className="whitespace-nowrap tabular-nums">{formatDate(r.created_at)}</span>,
        ],
      };
    }),
    drawer: (id, links) => {
      const r = byId.get(id);
      if (!r) return null;
      const exceptions = exceptionsOf(id);
      const pane = ["overview", "exceptions", "change"].includes(links.pane) ? links.pane : "overview";
      const tenantOwned = Boolean(r.tenant_id);
      return (
        <DetailDrawer
          heading="Rule details"
          closeHref={links.close}
          icon={Scale}
          title={<span className="font-mono text-[13px]">{conflictLabel(r)}</span>}
          subtitle={`${r.domain_code} · ${short(id)}`}
          status={ruleChip(r)}
          panes={[
            { key: "overview", label: "Overview", href: links.paneHref("overview") },
            { key: "exceptions", label: `Exceptions (${exceptions.length})`, href: links.paneHref("exceptions") },
            { key: "change", label: "Change history", href: links.paneHref("change") },
          ]}
          activePane={pane}
          actions={ruleCommands({ rule: r, kind: "sod_rule", id, me: ctx.me, version: r.version, tenantOwned })}
        >
          {pane === "overview" && (
            <DrawerFacts
              items={[
                { label: "Area", value: r.domain_code },
                { label: "Action", value: <Mono>{r.action_a}</Mono> },
                { label: "Conflicts with", value: r.action_b && r.action_b !== r.action_a ? <Mono>{r.action_b}</Mono> : "Its own record" },
                { label: "Kind", value: KIND[r.conflict_type] ?? r.conflict_type },
                { label: "Applies to", value: tenantOwned ? "This organisation" : "Every organisation" },
                { label: "Jurisdiction", value: r.jurisdiction_id ? <Mono>{r.jurisdiction_id}</Mono> : "Everywhere" },
                { label: "Version", value: r.version ?? "—" },
                { label: "Created", value: formatDateTime(r.created_at) },
                { label: "Rule ID", value: <Mono>{id}</Mono> },
              ]}
            />
          )}
          {pane === "exceptions" && (
            <div className="space-y-3 py-1">
              {exceptions.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-slate-500">No exceptions to this rule.</p>
              ) : (
                exceptions.map((e) => (
                  <div key={e.sod_exception_id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-semibold text-navy-950 dark:text-slate-100">{who(e.principal_id)}</p>
                        <p className="text-[11.5px] text-slate-500">
                          {e.compensating_control} · until {formatDate(e.expires_at)}
                        </p>
                      </div>
                      <StatusChip status={e.status} />
                    </div>
                    {(e.status === "REQUESTED" || e.status === "APPROVED") && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {e.status === "REQUESTED" && e.requested_by !== ctx.me && e.principal_id !== ctx.me && (
                          <>
                            <Command command="sod_exception.approve" id={e.sod_exception_id} label="Approve" title="Approve this exception" reasons="approve" tone="accent" />
                            <Command command="sod_exception.reject" id={e.sod_exception_id} label="Reject" title="Reject this exception" reasons="reject" tone="danger" />
                          </>
                        )}
                        {e.status === "APPROVED" && (
                          <Command command="sod_exception.revoke" id={e.sod_exception_id} label="Revoke" title="Revoke this exception" reasons="end" tone="danger" />
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
              {r.active_flag && !data.exceptions.error && (
                <div className="pt-1">
                  <RequestExceptionDialog ruleId={id} />
                </div>
              )}
            </div>
          )}
          {pane === "change" && <DrawerFacts items={changeFacts(r)} />}
          {ruleNote(r, tenantOwned, ctx.me)}
        </DetailDrawer>
      );
    },
  };
}

// ── access conditions ────────────────────────────────────────────────────────

export function conditionSentence(r: ABACRule): string {
  const op = ABAC_OPERATORS.find((o) => o.raw === r.operator)?.label ?? r.operator;
  const value = r.attribute_value ? ` ${r.attribute_value}` : "";
  return `${r.effect === "FORBID" ? "Refuse when" : "Only when"} ${r.attribute_key} ${op}${value}`;
}

export function conditionsRegister(data: AuthzData, ctx: Ctx): RegisterSpec {
  const rules = data.abac.rows;
  const byId = new Map(rules.map((r) => [r.abac_rule_id, r]));

  return {
    noun: "conditions",
    what: "access conditions",
    idColumn: "Code",
    columns: [{ label: "Condition" }, { label: "Effect" }, { label: "Applies to" }, { label: "State" }, { label: "Created by" }, { label: "Created" }],
    searchPlaceholder: "Search code, action or attribute",
    empty: "No access conditions yet. Propose one with “New condition”.",
    error: data.abac.error,
    filters: [
      { name: "state", allLabel: "All states", options: STATE_FILTER },
      {
        name: "effect",
        allLabel: "All effects",
        options: [
          ["REQUIRE", "Require"],
          ["FORBID", "Forbid"],
        ],
      },
      { name: "scope", allLabel: "All scopes", options: SCOPE_FILTER },
    ],
    rows: rules.map((r) => ({
      id: r.abac_rule_id,
      idLabel: r.rule_code,
      search: [r.abac_rule_id, r.rule_code, r.action_type, r.attribute_key, r.attribute_value].join(" "),
      facets: { state: ruleState(r), effect: r.effect, scope: r.tenant_id ? "tenant" : "platform" },
      cells: [
        <TwoLine key="c" primary={conditionSentence(r)} secondary={<span className="font-mono">{r.action_type}</span>} />,
        r.effect === "FORBID" ? "Forbid" : "Require",
        r.tenant_id ? "This organisation" : "Every organisation",
        <Chip key="s" {...ruleChip(r)} />,
        who(r.created_by_principal_id),
        <span key="d" className="whitespace-nowrap tabular-nums">{formatDate(r.created_at)}</span>,
      ],
    })),
    drawer: (id, links) => {
      const r = byId.get(id);
      if (!r) return null;
      const pane = links.pane === "change" ? "change" : "overview";
      const tenantOwned = Boolean(r.tenant_id);
      return (
        <DetailDrawer
          heading="Condition details"
          closeHref={links.close}
          icon={ListFilter}
          title={r.rule_code}
          subtitle={`On ${r.action_type}`}
          status={ruleChip(r)}
          panes={[
            { key: "overview", label: "Overview", href: links.paneHref("overview") },
            { key: "change", label: "Change history", href: links.paneHref("change") },
          ]}
          activePane={pane}
          actions={ruleCommands({ rule: r, kind: "abac", id, me: ctx.me, version: r.version, tenantOwned })}
        >
          {pane === "overview" ? (
            <DrawerFacts
              items={[
                { label: "Reads as", value: conditionSentence(r) },
                { label: "Action", value: <Mono>{r.action_type}</Mono> },
                { label: "Effect", value: r.effect === "FORBID" ? "Forbid — refuse when it holds" : "Require — refuse unless it holds" },
                { label: "Attribute", value: <Mono>{r.attribute_key}</Mono> },
                { label: "Comparison", value: ABAC_OPERATORS.find((o) => o.raw === r.operator)?.label ?? r.operator },
                { label: "Value", value: r.attribute_value ? <Mono>{r.attribute_value}</Mono> : "—" },
                { label: "Applies to", value: tenantOwned ? "This organisation" : "Every organisation" },
                { label: "Created by", value: who(r.created_by_principal_id) },
                { label: "Created", value: formatDateTime(r.created_at) },
              ]}
            />
          ) : (
            <DrawerFacts items={changeFacts(r)} />
          )}
          {ruleNote(r, tenantOwned, ctx.me)}
        </DetailDrawer>
      );
    },
  };
}
