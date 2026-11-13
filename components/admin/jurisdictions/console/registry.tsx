// Tab 1 · Jurisdiction registry (F01, F07): every jurisdiction, the packs that
// cover it, its rules and sources, and its versioned history and aliases.

import Link from "next/link";
import { Globe2, Landmark, Plus, Upload, ExternalLink } from "lucide-react";
import { RegisterView, type RegisterSpec, type Row } from "@/components/admin/authorization/console/register";
import { ButtonLink, DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { Field, FieldGrid, SelectField, TextArea } from "@/components/admin/authorization/ui";
import * as J from "@/lib/api/jurisdictions";
import {
  BASE,
  day,
  flagOf,
  jurisdictionLabel,
  loadJurisdictions,
  loadPacks,
  loadRules,
  loadSources,
  packsNaming,
  tabHref,
  type Ctx,
  type Query,
} from "./data";
import { Chip, Cmd, Commands, MiniList, PaneTitle, StatusChip, Unavailable, who } from "./shared";

const TYPE_OPTIONS = (types: string[]) => types.map((t) => [t, t.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())] as const);

export async function RegistryTab({ query, ctx }: { query: Query; ctx: Ctx }) {
  const [jurisdictions, packs, sources] = await Promise.all([loadJurisdictions(ctx.identity), loadPacks(ctx.identity), loadSources(ctx.identity)]);
  const list = jurisdictions.data ?? [];
  const byId = new Map(list.map((j) => [j.jurisdiction_id, j]));
  const types = [...new Set(list.map((j) => j.jurisdiction_type))].sort();

  const rows: Row[] = list.map((j) => {
    const naming = packsNaming(packs.data, j.jurisdiction_code);
    const released = naming.find((n) => n.version.status === "RELEASED") ?? naming[0];
    const mySources = (sources.data ?? []).filter((s) => s.jurisdiction_id === j.jurisdiction_id);
    const lastCheck = mySources.map((s) => s.reviewed_at).filter(Boolean).sort().at(-1);
    const parent = j.parent_jurisdiction_id ? byId.get(j.parent_jurisdiction_id) : undefined;
    return {
      id: j.jurisdiction_id,
      idLabel: j.jurisdiction_code,
      search: `${j.jurisdiction_code} ${j.jurisdiction_name} ${j.jurisdiction_type} ${parent?.jurisdiction_name ?? ""} ${released?.pack.pack_ref ?? ""}`,
      facets: { type: j.jurisdiction_type, state: j.active_flag ? "ACTIVE" : "INACTIVE" },
      cells: [
        <span key="n" className="flex items-center gap-2">
          <span aria-hidden className="w-5 text-center text-[15px]">
            {flagOf(j.jurisdiction_code) || "·"}
          </span>
          <TwoLine primary={j.jurisdiction_name} secondary={parent ? `in ${parent.jurisdiction_name}` : j.jurisdiction_type.replaceAll("_", " ").toLowerCase()} />
        </span>,
        released ? (
          <Link key="p" href={tabHref("packs", { id: released.pack.pack_ref, ver: released.version.version })} className="font-mono text-[12px] font-semibold text-navy-600 hover:underline dark:text-navy-300">
            {released.pack.pack_ref}
          </Link>
        ) : (
          <span key="p" className="text-slate-400">
            —
          </span>
        ),
        <RuleCount key="r" id={j.jurisdiction_id} ctx={ctx} />,
        <span key="c" className="whitespace-nowrap">
          {lastCheck ? day(lastCheck) : mySources.length ? "Not yet reviewed" : "—"}
        </span>,
        <span key="e" className="whitespace-nowrap">
          {day(j.effective_from)}
        </span>,
        <span key="o" className="whitespace-nowrap">
          {released?.pack.owner ?? "—"}
        </span>,
        <WorkflowState key="w" j={j} released={released?.version.status === "RELEASED"} pendingSources={mySources.filter(J.sourceAwaitingReview).length} ctx={ctx} />,
      ],
    };
  });

  const spec: RegisterSpec = {
    base: BASE,
    noun: "jurisdictions",
    what: "the jurisdiction register",
    idColumn: "Code",
    columns: [
      { label: "Jurisdiction / Region" },
      { label: "Rule pack" },
      { label: "Rules", align: "right" },
      { label: "Source checked" },
      { label: "Effective from" },
      { label: "Legal owner" },
      { label: "Workflow state" },
    ],
    rows,
    filters: [
      { name: "type", allLabel: "All types", options: TYPE_OPTIONS(types) },
      { name: "state", allLabel: "All states", options: [["ACTIVE", "Active"], ["INACTIVE", "Retired"]] },
    ],
    searchPlaceholder: "Search jurisdiction, code, region, or rule pack…",
    empty: "No jurisdiction is registered yet. Register one with New jurisdiction, or propose an import of a source standard.",
    error: jurisdictions.error,
    problem: (e) => <Unavailable what="The jurisdiction register" error={e} />,
    drawer: (id, links) => <JurisdictionDrawer id={id} links={links} ctx={ctx} />,
  };
  return <RegisterView spec={spec} query={query} />;
}

async function RuleCount({ id, ctx }: { id: string; ctx: Ctx }) {
  const r = await loadRules(id, ctx.identity);
  if (!r.data) return <span className="text-slate-400" title="Rules unavailable">—</span>;
  return <span className="tabular-nums">{r.data.filter((x) => x.rule_status === "ACTIVE").length}</span>;
}

async function WorkflowState({ j, released, pendingSources, ctx }: { j: J.Jurisdiction; released: boolean; pendingSources: number; ctx: Ctx }) {
  if (!j.active_flag) return <Chip text="Retired" tone="neutral" />;
  const r = await loadRules(j.jurisdiction_id, ctx.identity);
  const rules = r.data ?? [];
  if (rules.some(J.isDriftedInForce)) return <Chip text="Drift review" tone="danger" />;
  if (pendingSources > 0) return <Chip text="Source review" tone="warning" />;
  if (rules.some((x) => x.rule_status === "DRAFT")) return <Chip text="Draft rules" tone="warning" />;
  if (released) return <Chip text="Published" tone="success" />;
  return <Chip text="No pack" tone="neutral" />;
}

export function RegistryActions({ jurisdictions }: { jurisdictions: J.Jurisdiction[] }) {
  return (
    <>
      <Cmd command="import.propose" label="Propose import" icon={<Upload className="h-4 w-4" />} title="Propose a jurisdiction import" description="ImportJurisdictionUpdate: rows from a source standard (ISO 3166, an authority's register). Nothing changes until a second person approves the batch.">
        <FieldGrid>
          <Field name="source_standard" label="Source standard" placeholder="ISO 3166-2" />
          <Field name="source_version" label="Source version" placeholder="2026-10" />
          <Field name="evidence_ref" label="Evidence" placeholder="https://… or ticket id" className="sm:col-span-2" />
          <Field name="summary" label="Summary" placeholder="New subdivisions for …" className="sm:col-span-2" />
          <TextArea
            name="items"
            label="Rows (JSON array)"
            rows={6}
            className="sm:col-span-2"
            placeholder='[{"action":"ADD","target":{"code":"XX","type":"COUNTRY"},"jurisdiction_name":"Example","authority_type":"NATIONAL","effective_from":"2027-01-01T00:00:00Z"}]'
            hint="Each row: action ADD, UPDATE or RETIRE; target {code, type} or {jurisdiction_id}."
          />
        </FieldGrid>
      </Cmd>
      <NewJurisdiction jurisdictions={jurisdictions} />
    </>
  );
}

function NewJurisdiction({ jurisdictions }: { jurisdictions: J.Jurisdiction[] }) {
  const parents: (readonly [string, string])[] = [["", "None (top level)"], ...jurisdictions.filter((j) => j.active_flag).map((j) => [j.jurisdiction_id, J.describeJurisdiction(j)] as const)];
  return (
    <Cmd command="jur.create" label="New jurisdiction" icon={<Plus className="h-4 w-4" />} title="Register a jurisdiction" description="AddInternalJurisdiction. Governed and platform-scoped: needs JURISDICTION_CREATE on the platform scope.">
      <FieldGrid>
        <Field name="jurisdiction_code" label="Code" placeholder="GB, US-CA" maxLength={64} />
        <Field name="jurisdiction_name" label="Name" placeholder="United Kingdom" />
        <Field name="jurisdiction_type" label="Type" list="jur-types" placeholder="COUNTRY" />
        <Field name="authority_type" label="Authority type" list="jur-authorities" placeholder="NATIONAL" />
        <SelectField name="parent_jurisdiction_id" label="Parent" optional defaultValue="" options={parents} className="sm:col-span-2" />
        <Field name="effective_from" label="Effective from" type="date" />
        <Field name="effective_to" label="Effective to" type="date" optional />
      </FieldGrid>
      <datalist id="jur-types">
        {J.JURISDICTION_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <datalist id="jur-authorities">
        {J.AUTHORITY_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </Cmd>
  );
}

async function JurisdictionDrawer({ id, links, ctx }: { id: string; links: { close: string; pane: string; paneHref: (k: string) => string }; ctx: Ctx }) {
  const [jurisdictions, packs, sources, rules, ancestors, aliases, asOf] = await Promise.all([
    loadJurisdictions(ctx.identity),
    loadPacks(ctx.identity),
    loadSources(ctx.identity),
    loadRules(id, ctx.identity),
    J.getAncestors(id, ctx.identity),
    J.listAliases(id, ctx.identity),
    J.getJurisdictionAsOf(id, undefined, ctx.identity),
  ]);
  const byId = new Map((jurisdictions.data ?? []).map((j) => [j.jurisdiction_id, j]));
  const j = byId.get(id);
  if (!j) return null;
  const pane = links.pane || "overview";
  const mySources = (sources.data ?? []).filter((s) => s.jurisdiction_id === id);
  const naming = packsNaming(packs.data, j.jurisdiction_code);
  const current = naming.find((n) => n.version.status === "RELEASED") ?? naming[0];
  const ruleList = rules.data ?? [];
  const lastCheck = mySources.map((s) => s.reviewed_at).filter(Boolean).sort().at(-1);

  return (
    <DetailDrawer
      heading="Jurisdiction details"
      closeHref={links.close}
      icon={Globe2}
      title={
        <span className="inline-flex items-center gap-2">
          <span aria-hidden>{flagOf(j.jurisdiction_code)}</span>
          {j.jurisdiction_name}
        </span>
      }
      subtitle={`${j.jurisdiction_code}${current ? ` · ${current.pack.pack_ref}@${current.version.version}` : " · no pack names it yet"}`}
      status={j.active_flag ? (mySources.some(J.sourceAwaitingReview) ? { label: "Review", tone: "warning" } : { label: "Active", tone: "success" }) : { label: "Retired", tone: "neutral" }}
      panes={["overview", "rules", "sources", "audit"].map((k) => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1), href: links.paneHref(k) }))}
      activePane={pane}
      actions={
        <>
          <ButtonLink href={tabHref("rules", { jur: id })} icon={ExternalLink}>
            View rules
          </ButtonLink>
          <ButtonLink href={tabHref("sources", { jur: id })} icon={Landmark}>
            Review sources
          </ButtonLink>
        </>
      }
    >
      {pane === "overview" && (
        <>
          <DrawerFacts
            items={[
              { label: "Coverage", value: j.jurisdiction_name },
              { label: "Type · authority", value: `${j.jurisdiction_type} · ${j.authority_type}` },
              { label: "Parent", value: jurisdictionLabel(byId, j.parent_jurisdiction_id) },
              { label: "Published rules", value: rules.data ? ruleList.filter((r) => r.rule_status === "ACTIVE").length : "Unavailable" },
              { label: "Draft rules", value: rules.data ? ruleList.filter((r) => r.rule_status === "DRAFT").length : "—" },
              { label: "Source authorities", value: [...new Set(mySources.map((s) => s.authority))].join(", ") || "None captured" },
              { label: "Last source check", value: lastCheck ? day(lastCheck) : "—" },
              { label: "Effective", value: `${day(j.effective_from)} → ${j.effective_to ? day(j.effective_to) : "open"}` },
              { label: "Current rule version", value: current ? `${current.version.version} · ${current.version.status.toLowerCase()}` : "—" },
              { label: "Legal owner", value: current?.pack.owner ?? "—" },
            ]}
          />
          {j.active_flag && (
            <div className="mt-3">
              <Commands>
                <Cmd command="jur.alias.add" label="Add alias" title={`Map an external code to ${j.jurisdiction_code}`} hidden={{ id }} description="AmendJurisdictionAlias: an external system's code for this jurisdiction, valid for a period.">
                  <FieldGrid>
                    <Field name="alias_system" label="Code system" placeholder="ISO3166_1_ALPHA3" />
                    <Field name="alias_code" label="Code" placeholder="GBR" />
                    <Field name="source_standard" label="Source standard" placeholder="ISO 3166-1" />
                    <Field name="source_version" label="Source version" placeholder="2026" />
                    <Field name="mapping_rationale" label="Rationale" className="sm:col-span-2" />
                    <Field name="evidence_ref" label="Evidence" optional className="sm:col-span-2" />
                    <Field name="valid_from" label="Valid from" type="date" />
                    <Field name="valid_to" label="Valid to" type="date" optional />
                  </FieldGrid>
                </Cmd>
                <Cmd command="jur.retire" label="Retire" tone="danger" title={`Retire ${j.jurisdiction_code}`} hidden={{ id, row_version: j.row_version }} description="RetireJurisdiction: end-dated, kept with its history, and no longer resolvable. Every service that validates against this register will fail closed on it.">
                  <FieldGrid>
                    <TextArea name="reason" label="Reason" className="sm:col-span-2" />
                    <Field name="evidence_ref" label="Evidence" optional className="sm:col-span-2" />
                    <SelectField
                      name="superseded_by"
                      label="Superseded by"
                      optional
                      defaultValue=""
                      className="sm:col-span-2"
                      options={[["", "Nothing replaces it"], ...[...byId.values()].filter((x) => x.active_flag && x.jurisdiction_id !== id).map((x) => [x.jurisdiction_id, J.describeJurisdiction(x)] as const)]}
                    />
                  </FieldGrid>
                </Cmd>
              </Commands>
            </div>
          )}
        </>
      )}

      {pane === "rules" &&
        (rules.data ? (
          <MiniList
            empty="No rule is recorded on this jurisdiction itself. Rules of its ancestors still apply."
            items={ruleList.map((r) => ({
              key: r.jurisdiction_rule_id,
              primary: <Link href={tabHref("rules", { jur: id, id: r.jurisdiction_rule_id })} className="hover:underline">{`${r.rule_domain} · ${r.rule_code}`}</Link>,
              secondary: `${r.rule_name} · from ${day(r.effective_from)}`,
              right: <StatusChip status={J.isDriftedInForce(r) ? r.legal_drift_state : r.rule_status} />,
            }))}
          />
        ) : (
          <DrawerNote>The rules could not be read: {J.explainJurisdictionProblem(rules.error!)}</DrawerNote>
        ))}

      {pane === "sources" && (
        <MiniList
          empty="No source is captured for this jurisdiction."
          items={mySources.map((s) => ({
            key: s.source_id,
            primary: <Link href={tabHref("sources", { id: s.source_id })} className="hover:underline">{s.title}</Link>,
            secondary: `${s.authority} · ${s.authority_level.replaceAll("_", " ").toLowerCase()}`,
            right: <StatusChip status={s.superseded_by_source_id ? "SUPERSEDED" : s.reviewed_at ? "REVIEWED" : "PENDING"} text={s.superseded_by_source_id ? "Superseded" : s.reviewed_at ? "Reviewed" : "Review"} />,
          }))}
        />
      )}

      {pane === "audit" && (
        <>
          <PaneTitle>Hierarchy</PaneTitle>
          <p className="text-[12px] text-slate-600 dark:text-slate-300">
            {ancestors.ok ? ([...ancestors.data].reverse().map((a) => a.jurisdiction_code).concat(j.jurisdiction_code).join(" › ") || j.jurisdiction_code) : "Ancestors unavailable"}
          </p>
          <PaneTitle>Version</PaneTitle>
          <DrawerFacts
            items={[
              { label: "Register version", value: asOf.ok ? `v${asOf.data.version_no} since ${day(asOf.data.valid_from)}` : "—" },
              { label: "Record version (ETag)", value: j.row_version ?? "—" },
              { label: "Created", value: `${day(j.created_at)} by ${who(j.created_by_principal_id)}` },
              { label: "Retirement", value: j.retirement_reason ?? "—" },
            ]}
          />
          <PaneTitle>Aliases</PaneTitle>
          {aliases.ok ? (
            <MiniList
              empty="No external code is mapped to this jurisdiction."
              items={aliases.data.map((a) => ({
                key: a.alias_id,
                primary: `${a.alias_system} ${a.alias_code}`,
                secondary: `${a.source_standard} ${a.source_version} · ${day(a.valid_from)} → ${a.valid_to ? day(a.valid_to) : "open"}`,
                right: a.valid_to ? (
                  <Chip text="Ended" tone="neutral" />
                ) : (
                  <Cmd command="jur.alias.end" label="End" title={`End ${a.alias_system} ${a.alias_code}`} hidden={{ id, alias_id: a.alias_id }}>
                    <FieldGrid>
                      <Field name="valid_to" label="Valid to" type="date" />
                      <TextArea name="reason" label="Reason" className="sm:col-span-2" />
                    </FieldGrid>
                  </Cmd>
                ),
              }))}
            />
          ) : (
            <DrawerNote>Aliases unavailable.</DrawerNote>
          )}
        </>
      )}
    </DetailDrawer>
  );
}
