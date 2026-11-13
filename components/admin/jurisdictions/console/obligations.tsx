// Tab 10 · Obligation rules (F10, ZS-JUR §15): how a period becomes a due
// date — anchor, offsets, business-day adjustment, extensions — versioned,
// with provenance, and published by a second person.

import { CalendarClock, Plus } from "lucide-react";
import { RegisterView, type RegisterSpec, type Row } from "@/components/admin/authorization/console/register";
import { DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { Field, FieldGrid, SelectField, TextArea } from "@/components/admin/authorization/ui";
import * as J from "@/lib/api/jurisdictions";
import { BASE, day, jurisdictionLabel, loadJurisdictions, loadObligationRules, type Ctx, type Query } from "./data";
import { Cmd, Commands, StatusChip, Unavailable, who } from "./shared";

export async function ObligationsTab({ query, ctx }: { query: Query; ctx: Ctx }) {
  const [rules, jurisdictions] = await Promise.all([loadObligationRules(ctx.identity), loadJurisdictions(ctx.identity)]);
  const byId = new Map((jurisdictions.data ?? []).map((j) => [j.jurisdiction_id, j]));
  const rows: Row[] = (rules.data ?? []).map((o) => ({
    id: o.obligation_rule_id,
    idLabel: o.obligation_code,
    search: `${o.obligation_code} ${o.name} ${byId.get(o.jurisdiction_id)?.jurisdiction_code ?? ""}`,
    facets: { jur: o.jurisdiction_id, status: o.status },
    cells: [
      <TwoLine key="n" primary={o.name} secondary={`v${o.rule_version}`} />,
      <span key="j">{byId.get(o.jurisdiction_id)?.jurisdiction_code ?? "—"}</span>,
      <TwoLine key="b" primary={`${o.period_basis.toLowerCase()} · ${o.anchor.toLowerCase().replaceAll("_", " ")}`} secondary={`+${o.offset_months}m ${o.offset_days}d${o.offset_to_month_end ? " · month end" : ""}`} />,
      <span key="e" className="whitespace-nowrap">
        {o.effective_from}
      </span>,
      <StatusChip key="s" status={o.status} />,
    ],
  }));
  const spec: RegisterSpec = {
    base: BASE,
    noun: "obligation rules",
    what: "the obligation rules",
    idColumn: "Obligation",
    columns: [{ label: "Name" }, { label: "Jurisdiction" }, { label: "Due-date rule" }, { label: "Effective from" }, { label: "Status" }],
    rows,
    filters: [
      { name: "jur", allLabel: "All jurisdictions", options: (jurisdictions.data ?? []).filter((j) => j.active_flag).map((j) => [j.jurisdiction_id, j.jurisdiction_code] as const) },
      { name: "status", allLabel: "All states", options: [["DRAFT", "Draft"], ["PUBLISHED", "Published"]] },
    ],
    searchPlaceholder: "Search obligation code or name…",
    empty: "No obligation rule yet.",
    error: rules.error,
    problem: (e) => <Unavailable what="The obligation rules" error={e} />,
    drawer: (id, links) => <ObligationDrawer id={id} links={links} ctx={ctx} byId={byId} />,
  };
  return <RegisterView spec={spec} query={query} />;
}

export function ObligationsActions({ jurisdictions }: { jurisdictions: J.Jurisdiction[] }) {
  return (
    <Cmd command="obligation.create" label="New obligation rule" icon={<Plus className="h-4 w-4" />} title="Record an obligation rule" description="A DRAFT due-date rule; record its provenance, then a second person publishes it.">
      <FieldGrid>
        <SelectField name="jurisdiction_id" label="Jurisdiction" options={jurisdictions.filter((j) => j.active_flag).map((j) => [j.jurisdiction_id, J.describeJurisdiction(j)] as const)} className="sm:col-span-2" />
        <Field name="obligation_code" label="Obligation code" placeholder="VAT_RETURN" />
        <Field name="name" label="Name" placeholder="VAT return" />
        <SelectField name="period_basis" label="Period basis" options={[["MONTHLY", "Monthly"], ["QUARTERLY", "Quarterly"], ["ANNUAL", "Annual"], ["EVENT_DRIVEN", "Event driven"], ["PAYROLL_CYCLE", "Payroll cycle"]]} />
        <SelectField name="anchor" label="Anchor" options={[["PERIOD_END", "Period end"], ["EVENT_DATE", "Event date"], ["REGISTRATION_DATE", "Registration date"], ["ANNIVERSARY", "Anniversary"]]} />
        <Field name="offset_months" label="Offset months" type="number" defaultValue="1" />
        <Field name="offset_days" label="Offset days" type="number" defaultValue="7" />
        <SelectField name="offset_to_month_end" label="To month end" options={[["false", "No"], ["true", "Yes"]]} />
        <SelectField name="business_day_adjustment" label="Business-day adjustment" options={[["NONE", "None"], ["NEXT", "Next business day"], ["PREVIOUS", "Previous business day"]]} />
        <Field name="calendar_code" label="Calendar" optional placeholder="GB-ENG" />
        <Field name="effective_from" label="Effective from" type="date" />
      </FieldGrid>
    </Cmd>
  );
}

async function ObligationDrawer({ id, links, ctx, byId }: { id: string; links: { close: string; pane: string; paneHref: (k: string) => string }; ctx: Ctx; byId: Map<string, J.Jurisdiction> }) {
  const rules = await loadObligationRules(ctx.identity);
  const o = (rules.data ?? []).find((x) => x.obligation_rule_id === id);
  if (!o) return null;
  const author = o.created_by_principal_id === ctx.me;
  const code = byId.get(o.jurisdiction_id)?.jurisdiction_code ?? "";
  return (
    <DetailDrawer
      heading="Obligation rule"
      closeHref={links.close}
      icon={CalendarClock}
      title={`${o.obligation_code} v${o.rule_version}`}
      subtitle={`${o.name} · ${jurisdictionLabel(byId, o.jurisdiction_id)}`}
      status={{ label: o.status.toLowerCase(), tone: o.status === "PUBLISHED" ? "success" : "warning" }}
      actions={
        <>
          <Cmd command="evaluate" label="Calculate a due date" title={`Due date for ${o.obligation_code}`} hidden={{ kind: "obligation" }} description="From the released packs (the rule must be in a released pack version).">
            <TextArea name="body" label="Request (JSON)" rows={5} defaultValue={JSON.stringify({ jurisdiction: code, obligation_code: o.obligation_code, period_end: "2026-12-31" }, null, 2)} />
          </Cmd>
          {o.status === "DRAFT" && !author && <Cmd command="obligation.publish" label="Publish" tone="accent" title={`Publish ${o.obligation_code} v${o.rule_version}`} hidden={{ id }} />}
        </>
      }
    >
      <DrawerFacts
        items={[
          { label: "Period · anchor", value: `${o.period_basis} · ${o.anchor}` },
          { label: "Offset", value: `${o.offset_months} month(s) ${o.offset_days} day(s)${o.offset_to_month_end ? " to month end" : ""}` },
          { label: "Business-day adjustment", value: `${o.business_day_adjustment}${o.calendar_code ? ` on ${o.calendar_code}` : ""}` },
          { label: "Extensions", value: o.extension_allowed ? `up to ${o.max_extension_days} day(s)` : "Not allowed" },
          { label: "Effective", value: `${o.effective_from} → ${o.effective_to ?? "open"}` },
          { label: "Sources", value: (o.source_ids ?? []).length },
          { label: "Authored", value: `${day(o.created_at)} by ${who(o.created_by_principal_id)}` },
          { label: "Published", value: o.published_at ? `${day(o.published_at)} by ${who(o.published_by)}` : "Not yet" },
        ]}
      />
      {author && o.status === "DRAFT" && <DrawerNote>You authored this rule, so a second person publishes it.</DrawerNote>}
      <div className="mt-3">
        <Commands>
          <Cmd command="obligation.provenance" label="Set provenance" title={`Provenance of ${o.obligation_code}`} hidden={{ id }}>
            <FieldGrid>
              <Field name="regime_id" label="Regime id" optional />
              <Field name="interpretation_id" label="Interpretation id" optional />
              <TextArea name="source_ids" label="Source ids" defaultValue={(o.source_ids ?? []).join("\n")} className="sm:col-span-2" />
            </FieldGrid>
          </Cmd>
        </Commands>
      </div>
    </DetailDrawer>
  );
}
