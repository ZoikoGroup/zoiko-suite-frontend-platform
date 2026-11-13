// Tab 2 · Rules (F02, F04, F06, F14): effective-dated rules across
// jurisdictions, their activation by a second person on a workflow-svc
// approval (J-02), legal drift, the bitemporal status history, provenance and
// typed parameters.
//
// Maker-checker in the UI: the author of a DRAFT rule sees "Request approval";
// anyone else sees "Approve and activate". The service enforces it either way
// (403 self_approval_forbidden).

import Link from "next/link";
import { BookOpenCheck, CheckCircle2, ExternalLink, Send } from "lucide-react";
import { RegisterView, type RegisterSpec, type Row } from "@/components/admin/authorization/console/register";
import { ButtonLink, DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { Field, FieldGrid, SelectField, TextArea } from "@/components/admin/authorization/ui";
import * as J from "@/lib/api/jurisdictions";
import { listPendingApprovals } from "@/lib/api/workflow";
import { directory } from "@/lib/directory";
import { BASE, day, jurisdictionLabel, loadJurisdictions, loadRegimes, loadRules, loadSources, settle, tabHref, type Ctx, type Query } from "./data";
import { Cmd, Commands, MiniList, Mono, PaneTitle, StatusChip, Unavailable, who } from "./shared";

export async function RulesTab({ query, ctx }: { query: Query; ctx: Ctx }) {
  const jurisdictions = await loadJurisdictions(ctx.identity);
  const list = jurisdictions.data ?? [];
  const byId = new Map(list.map((j) => [j.jurisdiction_id, j]));
  // Every active jurisdiction's own rules (there is no cross-jurisdiction list route).
  const scope = list.filter((j) => j.active_flag || j.jurisdiction_id === query.jur);
  const reads = await Promise.all(scope.map((j) => loadRules(j.jurisdiction_id, ctx.identity)));
  const rules = reads.flatMap((r) => r.data ?? []);
  const failed = reads.filter((r) => r.error).length;

  const rows: Row[] = rules.map((r) => ({
    id: r.jurisdiction_rule_id,
    idLabel: r.rule_code,
    search: `${r.rule_code} ${r.rule_name} ${r.rule_domain} ${byId.get(r.jurisdiction_id)?.jurisdiction_code ?? ""} ${r.source_reference ?? ""}`,
    facets: { jur: r.jurisdiction_id, status: r.rule_status, drift: r.legal_drift_state === "CURRENT" ? "CURRENT" : "OPEN", domain: r.rule_domain },
    cells: [
      <TwoLine key="n" primary={r.rule_name} secondary={r.rule_domain} />,
      <span key="j" className="whitespace-nowrap">
        {byId.get(r.jurisdiction_id)?.jurisdiction_code ?? "—"}
      </span>,
      <span key="f" className="whitespace-nowrap">
        {day(r.effective_from)}
        {r.effective_to ? ` → ${day(r.effective_to)}` : ""}
      </span>,
      <StatusChip key="s" status={r.rule_status} />,
      <StatusChip key="d" status={r.legal_drift_state} />,
      <span key="a" className="whitespace-nowrap">
        {who(r.created_by_principal_id)}
      </span>,
    ],
  }));
  const domains = [...new Set(rules.map((r) => r.rule_domain))].sort();

  const spec: RegisterSpec = {
    base: BASE,
    noun: "rules",
    what: "the rules",
    idColumn: "Rule",
    columns: [{ label: "Name / domain" }, { label: "Jurisdiction" }, { label: "Effective" }, { label: "Status" }, { label: "Legal drift" }, { label: "Author" }],
    rows,
    filters: [
      { name: "jur", allLabel: "All jurisdictions", options: scope.map((j) => [j.jurisdiction_id, j.jurisdiction_code] as const) },
      { name: "status", allLabel: "All statuses", options: J.RULE_STATUSES.map((s) => [s, s.charAt(0) + s.slice(1).toLowerCase()] as const) },
      { name: "drift", allLabel: "Any drift", options: [["OPEN", "Drifted or under review"], ["CURRENT", "Current"]] },
      { name: "domain", allLabel: "All domains", options: domains.map((d) => [d, d] as const) },
    ],
    searchPlaceholder: "Search rule code, name, domain or jurisdiction…",
    empty: "No rule is recorded yet. Propose one with Propose rule change.",
    note: failed ? `${failed} jurisdiction(s) unreadable` : undefined,
    error: jurisdictions.error,
    problem: (e) => <Unavailable what="The rules" error={e} />,
    drawer: (id, links) => <RuleDrawer id={id} links={links} ctx={ctx} byId={byId} />,
  };
  return <RegisterView spec={spec} query={query} />;
}

/** The header's gold action: a DRAFT rule, activated later by someone else. */
export function ProposeRule({ jurisdictions, defaultJurisdiction }: { jurisdictions: J.Jurisdiction[]; defaultJurisdiction?: string }) {
  const options = jurisdictions.filter((j) => j.active_flag).map((j) => [j.jurisdiction_id, J.describeJurisdiction(j)] as const);
  return (
    <Cmd
      command="rule.create"
      label="Propose rule change"
      tone="accent"
      size="md"
      icon={<span className="text-base leading-none">+</span>}
      title="Propose a rule change"
      description="Records an effective-dated rule as DRAFT. It applies only after a second person activates it, citing an approval workflow-svc confirms (J-02)."
      footnote="To change a rule in force, propose its replacement here (naming the rule it supersedes), then retire or supersede the old one."
    >
      <FieldGrid>
        <SelectField name="jurisdiction_id" label="Jurisdiction" defaultValue={defaultJurisdiction} options={options} className="sm:col-span-2" />
        <Field name="rule_domain" label="Domain" list="rule-domains" placeholder="TAX" />
        <Field name="rule_code" label="Rule code" placeholder="VAT-STANDARD" />
        <Field name="rule_name" label="Rule name" placeholder="Standard rate" className="sm:col-span-2" />
        <Field name="effective_from" label="Effective from" type="date" />
        <Field name="effective_to" label="Effective to" type="date" optional />
        <TextArea name="rule_payload" label="Payload (JSON)" optional placeholder='{"applies": ["B2C"]}' className="sm:col-span-2" hint="Applicability metadata. Rates and bands go in typed parameters." />
        <Field name="source_reference" label="Source reference" optional className="sm:col-span-2" />
        <Field name="external_feed_reference" label="Regulatory feed reference" optional className="sm:col-span-2" hint="A change on this reference moves the rule to UNDER_REVIEW automatically (JR-6)." />
        <Field name="supersedes_rule_id" label="Supersedes rule id" optional className="sm:col-span-2" />
      </FieldGrid>
      <datalist id="rule-domains">
        {J.RULE_DOMAINS.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
    </Cmd>
  );
}

async function RuleDrawer({
  id,
  links,
  ctx,
  byId,
}: {
  id: string;
  links: { close: string; pane: string; paneHref: (k: string) => string };
  ctx: Ctx;
  byId: Map<string, J.Jurisdiction>;
}) {
  const [rule, history, drift, provenance, parameters, pending, sources, regimes] = await Promise.all([
    J.getRule(id, ctx.identity).then(settle),
    J.listStatusHistory(id, ctx.identity).then(settle),
    J.listDriftEvents(id, ctx.identity).then(settle),
    J.getProvenance(id, ctx.identity).then(settle),
    J.getParameters(id, ctx.identity).then(settle),
    listPendingApprovals(ctx.identity, { limit: 200 }).then(settle),
    loadSources(ctx.identity),
    loadRegimes(ctx.identity),
  ]);
  const r = rule.data;
  if (!r) return null;
  const pane = links.pane || "overview";
  const author = r.created_by_principal_id === ctx.me;
  const approvals = (pending.data ?? []).filter((w) => w.subject_type === "jurisdiction_rule" && w.subject_id === id);
  // The pending list carries no stages; the drawer offers the newest approval of this rule.
  const mine = approvals[0];
  const people = directory().filter((p) => p.principalId !== ctx.me);
  const jSources = (sources.data ?? []).filter((s) => s.jurisdiction_id === r.jurisdiction_id && s.reviewed_at && !s.superseded_by_source_id);
  const payloadKeys = r.rule_payload && typeof r.rule_payload === "object" ? Object.keys(r.rule_payload as object) : [];

  return (
    <DetailDrawer
      heading="Rule details"
      closeHref={links.close}
      icon={BookOpenCheck}
      title={`${r.rule_domain} · ${r.rule_code}`}
      subtitle={`${r.rule_name} · ${jurisdictionLabel(byId, r.jurisdiction_id)}`}
      status={{ label: r.rule_status.charAt(0) + r.rule_status.slice(1).toLowerCase(), tone: r.rule_status === "ACTIVE" ? (r.legal_drift_state === "CURRENT" ? "success" : "danger") : r.rule_status === "DRAFT" ? "warning" : "neutral" }}
      panes={["overview", "approval", "history", "provenance"].map((k) => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1), href: links.paneHref(k) }))}
      activePane={pane}
      actions={
        <>
          <ButtonLink href={tabHref("registry", { id: r.jurisdiction_id })} icon={ExternalLink}>
            Jurisdiction
          </ButtonLink>
          {r.rule_status === "DRAFT" && !author && (
            <Cmd
              command="rule.approve-activate"
              label="Approve and activate"
              tone="accent"
              icon={<CheckCircle2 className="h-4 w-4" />}
              title={`Approve and activate ${r.rule_code}`}
              hidden={{ id }}
              description="Records your approval on the workflow-svc approval this activation cites (if it is still pending), then activates the rule citing it. You are not the rule's author, so you may."
            >
              <FieldGrid>
                <Field name="approval_reference" label="Approval reference (workflow id)" defaultValue={mine?.workflow_instance_id ?? ""} className="sm:col-span-2" hint="From the author's approval request." />
                <TextArea name="rationale" label="Rationale" optional className="sm:col-span-2" />
              </FieldGrid>
            </Cmd>
          )}
          {r.rule_status === "DRAFT" && author && (
            <Cmd command="rule.request-approval" label="Request approval" tone="accent" icon={<Send className="h-4 w-4" />} title={`Request approval of ${r.rule_code}`} hidden={{ id }} description="Opens a workflow-svc approval bound to this rule. The approver then activates it; you, its author, cannot.">
              <SelectField name="approver" label="Approver" options={people.map((p) => [p.principalId, `${p.name} · ${p.title}`] as const)} />
            </Cmd>
          )}
        </>
      }
    >
      {pane === "overview" && (
        <>
          <DrawerFacts
            items={[
              { label: "Effective", value: `${day(r.effective_from)} → ${r.effective_to ? day(r.effective_to) : "open"}` },
              { label: "Legal drift", value: r.legal_drift_state.replaceAll("_", " ").toLowerCase() },
              { label: "Version · precedence", value: `v${r.rule_version ?? 1} · ${r.precedence_level ?? 0}` },
              { label: "Payload", value: payloadKeys.length ? payloadKeys.join(", ") : "—" },
              { label: "Source reference", value: r.source_reference ?? "—" },
              { label: "Feed reference", value: r.external_feed_reference ?? "—" },
              { label: "Supersedes", value: r.supersedes_rule_id ? <Mono>{r.supersedes_rule_id.slice(0, 8)}</Mono> : "—" },
              { label: "Author", value: who(r.created_by_principal_id) },
              { label: "Record version (ETag)", value: r.row_version ?? "—" },
            ]}
          />
          <div className="mt-3">
            <Commands>
              {r.rule_status === "ACTIVE" && (
                <Cmd command="rule.drift" label="Record drift" title={`Record legal drift on ${r.rule_code}`} hidden={{ id, row_version: r.row_version }} description="Drift is separate from status: an ACTIVE rule stays in force while it is reviewed. The history is append-only.">
                  <FieldGrid>
                    <SelectField name="drift_state" label="Drift state" options={J.DRIFT_STATES.map((s) => [s, s.replaceAll("_", " ").toLowerCase()] as const)} defaultValue={r.legal_drift_state === "CURRENT" ? "DRIFTED" : "CURRENT"} className="sm:col-span-2" />
                    <TextArea name="reason" label="Reason (the evidence)" className="sm:col-span-2" />
                  </FieldGrid>
                </Cmd>
              )}
              {r.rule_status === "ACTIVE" && (
                <Cmd command="rule.close" label="Supersede or retire" tone="danger" title={`End ${r.rule_code}`} hidden={{ id, row_version: r.row_version }} description="End-dates the rule. Point-in-time reads after the date stop matching it.">
                  <FieldGrid>
                    <SelectField name="new_status" label="New status" options={[["SUPERSEDED", "Superseded"], ["RETIRED", "Retired"]]} />
                    <Field name="effective_to" label="Ends" type="date" optional hint="Blank = now." />
                  </FieldGrid>
                </Cmd>
              )}
            </Commands>
          </div>
        </>
      )}

      {pane === "approval" && (
        <>
          <PaneTitle>Approvals in workflow-svc</PaneTitle>
          {pending.error ? (
            <DrawerNote>Pending approvals cannot be listed with your grants. The approval reference is in the author&apos;s request result.</DrawerNote>
          ) : (
            <MiniList
              empty={r.rule_status === "DRAFT" ? "No pending approval names this rule." : "Not waiting for an approval."}
              items={approvals.map((w) => ({
                key: w.workflow_instance_id,
                primary: <Mono>{w.workflow_instance_id}</Mono>,
                secondary: `Requested by ${who(w.initiated_by)} · stage ${w.current_stage}`,
                right: <StatusChip status={w.workflow_status} />,
              }))}
            />
          )}
          {r.rule_status === "DRAFT" && !author && (
            <div className="mt-3">
              <Cmd command="rule.reject-approval" label="Reject approval" tone="danger" title={`Reject the approval of ${r.rule_code}`} hidden={{ id }}>
                <FieldGrid>
                  <Field name="approval_reference" label="Approval reference" defaultValue={mine?.workflow_instance_id ?? ""} className="sm:col-span-2" />
                  <TextArea name="rationale" label="Reason" className="sm:col-span-2" />
                </FieldGrid>
              </Cmd>
            </div>
          )}
          <DrawerNote>
            {author ? "You authored this rule, so you cannot approve or activate it." : "Activation rests on an APPROVED workflow bound to this rule and decided by someone other than its author."}
          </DrawerNote>
        </>
      )}

      {pane === "history" && (
        <>
          <PaneTitle>Status history (bitemporal)</PaneTitle>
          <MiniList
            empty={history.error ? "Unavailable." : "No status change recorded."}
            items={(history.data ?? []).map((h) => ({
              key: h.history_id,
              primary: h.rule_status,
              secondary: `known ${day(h.known_from)}${h.known_to ? ` → ${day(h.known_to)}` : ""} · ${who(h.changed_by_principal_id)}${h.change_reason ? ` · ref ${h.change_reason.slice(0, 8)}` : ""}`,
              right: h.known_to ? undefined : <StatusChip status="ACTIVE" text="Current" />,
            }))}
          />
          <PaneTitle>Legal drift history</PaneTitle>
          <MiniList
            empty={drift.error ? "Unavailable." : "The drift state has never changed."}
            items={(drift.data ?? []).map((e) => ({ key: e.drift_event_id, primary: `${e.from_state} → ${e.to_state}`, secondary: `${day(e.effective_at)} · ${who(e.recorded_by_principal_id)} · ${e.reason ?? ""}` }))}
          />
        </>
      )}

      {pane === "provenance" && (
        <>
          <DrawerFacts
            items={[
              { label: "Regime", value: provenance.data?.regime_id ? (regimes.data ?? []).find((g) => g.regime_id === provenance.data!.regime_id)?.regime_code ?? provenance.data.regime_id.slice(0, 8) : "—" },
              { label: "Interpretation", value: provenance.data?.interpretation_id ? <Mono>{provenance.data.interpretation_id.slice(0, 8)}</Mono> : "—" },
              { label: "Sources", value: provenance.data?.source_ids?.length ?? 0 },
              { label: "Published on", value: provenance.data?.published_on ?? "—" },
              { label: "Typed parameters", value: parameters.data ? "Set" : "None" },
            ]}
          />
          {parameters.data && (
            <details className="mt-2 text-[11.5px]">
              <summary className="cursor-pointer text-slate-500">Parameters (JSON)</summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-50 p-2 dark:bg-slate-800">{JSON.stringify(parameters.data.parameters ?? parameters.data, null, 2)}</pre>
            </details>
          )}
          <div className="mt-3">
            <Commands>
              <Cmd command="rule.provenance" label="Set provenance" title={`Provenance of ${r.rule_code}`} hidden={{ id }} description="The reviewed sources, regime and approved interpretation this rule rests on. A pack compile refuses rules without it.">
                <FieldGrid>
                  <SelectField name="regime_id" label="Regime" optional defaultValue={provenance.data?.regime_id ?? ""} options={[["", "None"], ...(regimes.data ?? []).map((g) => [g.regime_id, `${g.regime_code} · ${g.regime_name}`] as const)]} />
                  <Field name="interpretation_id" label="Interpretation id" optional defaultValue={provenance.data?.interpretation_id ?? ""} />
                  <TextArea name="source_ids" label="Source ids" defaultValue={(provenance.data?.source_ids ?? []).join("\n")} className="sm:col-span-2" hint={jSources.length ? `Reviewed sources here: ${jSources.map((s) => `${s.source_id} (${s.title})`).join("; ")}` : "Capture and review a source first."} />
                  <Field name="precedence" label="Precedence" type="number" optional />
                  <Field name="published_on" label="Published on" type="date" optional />
                </FieldGrid>
              </Cmd>
              <Cmd command="rule.parameters" label="Set parameters" title={`Typed parameters of ${r.rule_code}`} hidden={{ id }}>
                <TextArea name="parameters" label="Parameters (JSON)" rows={6} placeholder='{"family":"TAX_RATE","class":"STANDARD","rate":"0.2000","rounding":{"mode":"HALF_UP","scale":2}}' />
              </Cmd>
            </Commands>
          </div>
        </>
      )}
      <p className="mt-4 text-[11px] text-slate-400">
        <Link href={tabHref("rules", { jur: r.jurisdiction_id })} className="hover:underline">
          Other rules of this jurisdiction
        </Link>
      </p>
    </DetailDrawer>
  );
}
