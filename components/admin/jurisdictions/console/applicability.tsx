// Tab 4 · Applicability decisions (F11–F13, F20–F22): which jurisdictions
// apply to each of the tenant's legal entities (projected from
// tenant-entity-registry events, restored by the J-10 backfill), the JUR-1
// determination, and the runtime tools: resolve a rule, validate an action,
// the applicability evaluators, and regulatory submissions.

import Form from "next/form";
import { Building2, FlaskConical, Gavel, RefreshCw, Search, ShieldCheck, Send } from "lucide-react";
import { RegisterView, type RegisterSpec, type Row } from "@/components/admin/authorization/console/register";
import { DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { Field, FieldGrid, SelectField, TextArea } from "@/components/admin/authorization/ui";
import * as J from "@/lib/api/jurisdictions";
import { BASE, day, jurisdictionLabel, loadEntities, loadJurisdictions, settle, type Ctx, type Query } from "./data";
import { Cmd, Commands, MiniList, Mono, PaneTitle, StatusChip, Unavailable, who } from "./shared";

export async function ApplicabilityTab({ query, ctx }: { query: Query; ctx: Ctx }) {
  const [entities, jurisdictions] = await Promise.all([loadEntities(ctx.identity), loadJurisdictions(ctx.identity)]);
  const byId = new Map((jurisdictions.data ?? []).map((j) => [j.jurisdiction_id, j]));
  const rows: Row[] = (entities.data ?? []).map((e) => ({
    id: e.legal_entity_id,
    idLabel: e.entity_code,
    search: `${e.entity_code} ${e.legal_name} ${e.trading_name ?? ""} ${byId.get(e.primary_jurisdiction_id)?.jurisdiction_code ?? ""}`,
    facets: { status: e.entity_status },
    cells: [
      <TwoLine key="n" primary={e.trading_name || e.legal_name} secondary={e.entity_type} />,
      <span key="p" className="whitespace-nowrap">
        {jurisdictionLabel(byId, e.primary_jurisdiction_id)}
      </span>,
      <Applicable key="a" entityId={e.legal_entity_id} ctx={ctx} />,
      <StatusChip key="s" status={e.entity_status} />,
    ],
  }));
  const statuses = [...new Set((entities.data ?? []).map((e) => e.entity_status))];

  const spec: RegisterSpec = {
    base: BASE,
    noun: "legal entities",
    what: "the tenant's legal entities",
    idColumn: "Entity",
    columns: [{ label: "Name / type" }, { label: "Primary jurisdiction" }, { label: "Applicable jurisdictions", align: "right" }, { label: "Status" }],
    rows,
    filters: [{ name: "status", allLabel: "All states", options: statuses.map((s) => [s, s.charAt(0) + s.slice(1).toLowerCase()] as const) }],
    searchPlaceholder: "Search entity code, name or jurisdiction…",
    empty: "This tenant has no legal entity yet. Entities are created in Tenants & Entities; their jurisdictions are projected here.",
    error: entities.error,
    problem: (e) => <Unavailable what="The tenant's legal entities (tenant-entity-registry-svc)" error={e} />,
    drawer: (id, links) => <EntityDrawer id={id} links={links} ctx={ctx} byId={byId} />,
  };
  return (
    <>
      <RegisterView spec={spec} query={query} />
      <SubmissionLookup query={query} ctx={ctx} />
    </>
  );
}

async function Applicable({ entityId, ctx }: { entityId: string; ctx: Ctx }) {
  const r = await J.getEntityJurisdictions(entityId, ctx.identity);
  if (!r.ok) return <span className="text-slate-400">—</span>;
  return <span className="tabular-nums">{(r.data.jurisdictions ?? []).length}</span>;
}

async function EntityDrawer({ id, links, ctx, byId }: { id: string; links: { close: string; pane: string; paneHref: (k: string) => string }; ctx: Ctx; byId: Map<string, J.Jurisdiction> }) {
  const [entities, mapping] = await Promise.all([loadEntities(ctx.identity), J.getEntityJurisdictions(id, ctx.identity).then(settle)]);
  const e = (entities.data ?? []).find((x) => x.legal_entity_id === id);
  if (!e) return null;
  const rows = mapping.data?.jurisdictions ?? [];
  return (
    <DetailDrawer
      heading="Applicability"
      closeHref={links.close}
      icon={Building2}
      title={e.trading_name || e.legal_name}
      subtitle={`${e.entity_code} · primary ${jurisdictionLabel(byId, e.primary_jurisdiction_id)}`}
      status={{ label: e.entity_status.toLowerCase(), tone: e.entity_status === "ACTIVE" ? "success" : "neutral" }}
      actions={
        <>
          <Cmd command="entity.backfill" label="Backfill" icon={<RefreshCw className="h-4 w-4" />} title={`Backfill ${e.entity_code}`} hidden={{ legal_entity_id: id }} description="J-10: re-reads this entity's jurisdiction assignments from tenant-entity-registry and restores any mapping whose events left Kafka retention. A rerun changes nothing." />
          <Cmd command="determine.jurisdiction" label="Determine jurisdiction" tone="accent" icon={<Gavel className="h-4 w-4" />} title={`Which jurisdiction governs ${e.entity_code}?`} hidden={{ legal_entity_id: id }} description="JUR-1: decided from the entity's recorded assignments, never from a claim. A claim is checked against them.">
            <FieldGrid>
              <SelectField name="purpose" label="Purpose" options={J.DETERMINATION_PURPOSES.map((p) => [p, p.charAt(0) + p.slice(1).toLowerCase()] as const)} />
              <Field name="effective_at" label="At" type="date" optional />
              <Field name="claimed_jurisdiction" label="Claimed jurisdiction (code)" optional className="sm:col-span-2" />
            </FieldGrid>
          </Cmd>
        </>
      }
    >
      <DrawerFacts
        items={[
          { label: "Applicable jurisdictions", value: mapping.data ? rows.length : "Unavailable" },
          { label: "As of", value: mapping.data ? day(mapping.data.effective_at) : "—" },
          { label: "Entity type", value: e.entity_type },
          { label: "Default currency", value: e.default_currency_code },
        ]}
      />
      <PaneTitle>Projected mappings</PaneTitle>
      {mapping.error ? (
        <DrawerNote>The projection could not be read: {J.explainJurisdictionProblem(mapping.error)}</DrawerNote>
      ) : (
        <MiniList
          empty="No jurisdiction is projected for this entity. Run the backfill if its events left Kafka retention."
          items={rows.map((m) => ({
            key: m.applicability_id,
            primary: jurisdictionLabel(byId, m.jurisdiction_id),
            secondary: `${m.applicability_type.toLowerCase()} · from ${day(m.effective_from)} · ${m.source_event_type}`,
            right: <StatusChip status={m.effective_to ? "RETIRED" : "ACTIVE"} text={m.effective_to ? "Ended" : "In force"} />,
          }))}
        />
      )}
    </DetailDrawer>
  );
}

/** The tab's commands: the runtime tools. */
export function ApplicabilityActions({ jurisdictions }: { jurisdictions: J.Jurisdiction[] }) {
  const jOpts = jurisdictions.filter((j) => j.active_flag).map((j) => [j.jurisdiction_id, J.describeJurisdiction(j)] as const);
  const evaluators = Object.entries(J.EVALUATORS).map(([k, v]) => [k, v.label] as const);
  return (
    <>
      <Cmd command="resolve.rule" label="Resolve a rule" icon={<Search className="h-4 w-4" />} title="Resolve a rule" description="From the released, verified packs in force at the date. The decision and its basis are recorded as evidence.">
        <FieldGrid>
          <Field name="jurisdiction" label="Jurisdiction code" placeholder="GB" />
          <Field name="effective_at" label="At" type="date" optional />
          <Field name="rule_domain" label="Domain" placeholder="TAX" />
          <Field name="rule_code" label="Rule code" placeholder="STD" />
        </FieldGrid>
      </Cmd>
      <Cmd command="rule.validate" label="Validate an action" icon={<ShieldCheck className="h-4 w-4" />} title="Validate an action" description="Whether an action is permitted under the rules in force (J-06). Conflicting or missing rules are an answer, never a guess.">
        <FieldGrid>
          <SelectField name="jurisdiction_id" label="Jurisdiction" options={jOpts} className="sm:col-span-2" />
          <Field name="action_type" label="Action type" placeholder="CREATE_INVOICE" />
          <Field name="entity_type" label="Entity type" placeholder="SUBSIDIARY" />
          <Field name="effective_at" label="At" type="date" optional />
          <TextArea name="payload" label="Payload (JSON)" optional className="sm:col-span-2" />
        </FieldGrid>
      </Cmd>
      <Cmd command="evaluate" label="Evaluate" icon={<FlaskConical className="h-4 w-4" />} title="Run an applicability evaluator" description="Registrations, licences, schemes, thresholds, submission profiles, payroll parameters, retention, accounting mappings, calculations and due dates: each answers from the released packs, with its steps.">
        <FieldGrid>
          <SelectField name="kind" label="Evaluator" options={evaluators} className="sm:col-span-2" />
          <TextArea name="body" label="Request (JSON)" rows={7} className="sm:col-span-2" placeholder='{"jurisdiction":"GB","rule_domain":"TAX","rule_code":"STD","taxable_amount":"100.00","currency":"GBP"}' />
        </FieldGrid>
      </Cmd>
      <Cmd command="submission.register" label="Register submission" icon={<Send className="h-4 w-4" />} title="Register a regulatory submission" description="Binds a filing or e-invoice to the submission profile in force, so later provider callbacks are checked against its lifecycle.">
        <FieldGrid>
          <Field name="jurisdiction" label="Jurisdiction code" placeholder="GB" />
          <Field name="kind" label="Kind" placeholder="E_INVOICE or FILING" />
          <Field name="profile_code" label="Profile code" />
          <Field name="effective_at" label="At" type="date" optional />
          <Field name="subject_ref" label="Subject reference" className="sm:col-span-2" />
          <Field name="payload_hash" label="Payload hash" placeholder="sha256:…" className="sm:col-span-2" />
        </FieldGrid>
      </Cmd>
      <Cmd command="entity.backfill" label="Backfill all" icon={<RefreshCw className="h-4 w-4" />} title="Backfill every entity of this tenant" description="J-10 for the whole tenant: restores projections whose events left Kafka retention." />
      <Cmd command="resolver.invalidate" label="Drop resolver cache" title="Drop the resolver cache" description="This replica re-reads the released packs on its next resolution. Push invalidation normally does this." />
    </>
  );
}

/** Submissions have no list route: a lookup by id, then its events and commands. */
async function SubmissionLookup({ query, ctx }: { query: Query; ctx: Ctx }) {
  const id = (query.sub ?? "").trim();
  const read = id ? await J.getSubmission(id, ctx.identity) : null;
  const sub = read?.ok ? ("submission" in read.data ? read.data.submission : read.data) : null;
  const events = read?.ok ? ("submission" in read.data ? read.data.events : read.data.events) ?? [] : [];
  return (
    <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
      <Form action={BASE} scroll={false} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value="applicability" />
        <label className="text-[12.5px] font-semibold text-navy-950 dark:text-slate-100" htmlFor="sub">
          Regulatory submission
        </label>
        <input id="sub" name="sub" defaultValue={id} placeholder="Submission id" className="h-9 min-w-72 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] dark:border-slate-700 dark:bg-slate-900" />
        <button type="submit" className="h-9 rounded-lg border border-slate-200 px-3 text-[12.5px] font-medium hover:bg-slate-50 dark:border-slate-700">
          Look up
        </button>
      </Form>
      {read && !read.ok && <p className="mt-2 text-[12px] text-amber-700">{J.explainJurisdictionProblem(read.error)}</p>}
      {sub && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <DrawerFacts
            items={[
              { label: "Status", value: <StatusChip status={sub.status} /> },
              { label: "Kind · profile", value: `${sub.submission_kind} · ${sub.profile_code}` },
              { label: "Jurisdiction", value: sub.jurisdiction_code },
              { label: "Subject", value: sub.subject_ref },
              { label: "Payload hash", value: <Mono>{sub.payload_hash.slice(0, 20)}…</Mono> },
              { label: "Submitted by", value: who(sub.submitted_by) },
            ]}
          />
          <div>
            <MiniList empty="No provider event yet." items={(events ?? []).map((e) => ({ key: e.provider_event_id, primary: `${e.reported_status} → ${e.status_after}`, secondary: `${day(e.occurred_at)} · ${e.disposition}` }))} />
            {!sub.is_terminal && (
              <div className="mt-2">
                <Commands>
                  <Cmd command="submission.event" label="Record provider event" title="Record a provider callback" hidden={{ id: sub.submission_id }}>
                    <FieldGrid>
                      <Field name="provider_event_id" label="Provider event id" />
                      <Field name="status" label="Reported status" placeholder="ACCEPTED" />
                      <Field name="receipt_id" label="Receipt id" optional />
                      <Field name="occurred_at" label="Occurred" type="datetime-local" />
                    </FieldGrid>
                  </Cmd>
                </Commands>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
