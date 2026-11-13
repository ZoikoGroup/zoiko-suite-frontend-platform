// Tab 8 · Calendars (F08, REF-10): business calendars, their maker-checker
// published versions (immutable once published; an amendment is a new
// version), holiday imports, and business-day arithmetic that names the exact
// version it used.

import { CalendarDays, Plus } from "lucide-react";
import { RegisterView, type RegisterSpec, type Row } from "@/components/admin/authorization/console/register";
import { DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { Field, FieldGrid, SelectField, TextArea } from "@/components/admin/authorization/ui";
import * as J from "@/lib/api/jurisdictions";
import { BASE, day, jurisdictionLabel, loadCalendars, loadJurisdictions, settle, type Ctx, type Query } from "./data";
import { Cmd, Commands, MiniList, PaneTitle, StatusChip, Unavailable, shortHash, who } from "./shared";

export async function CalendarsTab({ query, ctx }: { query: Query; ctx: Ctx }) {
  const [calendars, jurisdictions] = await Promise.all([loadCalendars(ctx.identity), loadJurisdictions(ctx.identity)]);
  const byId = new Map((jurisdictions.data ?? []).map((j) => [j.jurisdiction_id, j]));
  const rows: Row[] = (calendars.data ?? []).map((c) => ({
    id: c.calendar_code,
    idLabel: c.calendar_code,
    search: `${c.calendar_code} ${c.authority} ${c.description ?? ""} ${byId.get(c.jurisdiction_id)?.jurisdiction_code ?? ""}`,
    facets: { jur: c.jurisdiction_id },
    cells: [
      <TwoLine key="a" primary={c.authority} secondary={c.description ?? undefined} />,
      <span key="j">{jurisdictionLabel(byId, c.jurisdiction_id)}</span>,
      <span key="c" className="whitespace-nowrap">
        {day(c.created_at)}
      </span>,
      <span key="b">{who(c.created_by_principal_id)}</span>,
    ],
  }));
  const spec: RegisterSpec = {
    base: BASE,
    noun: "calendars",
    what: "the business calendars",
    idColumn: "Calendar",
    columns: [{ label: "Authority" }, { label: "Jurisdiction" }, { label: "Created" }, { label: "By" }],
    rows,
    filters: [{ name: "jur", allLabel: "All jurisdictions", options: (jurisdictions.data ?? []).filter((j) => j.active_flag).map((j) => [j.jurisdiction_id, j.jurisdiction_code] as const) }],
    searchPlaceholder: "Search calendar code or authority…",
    empty: "No business calendar yet. Create one, add a version with its holidays, then a second person publishes it.",
    error: calendars.error,
    problem: (e) => <Unavailable what="The business calendars" error={e} />,
    drawer: (id, links) => <CalendarDrawer code={id} links={links} ctx={ctx} />,
  };
  return <RegisterView spec={spec} query={query} />;
}

export function CalendarsActions({ jurisdictions }: { jurisdictions: J.Jurisdiction[] }) {
  return (
    <Cmd command="calendar.create" label="New calendar" icon={<Plus className="h-4 w-4" />} title="Create a business calendar">
      <FieldGrid>
        <Field name="calendar_code" label="Code" placeholder="GB-ENG" />
        <SelectField name="jurisdiction_id" label="Jurisdiction" options={jurisdictions.filter((j) => j.active_flag).map((j) => [j.jurisdiction_id, J.describeJurisdiction(j)] as const)} />
        <Field name="authority" label="Authority" placeholder="UK Government" className="sm:col-span-2" />
        <TextArea name="description" label="Description" optional className="sm:col-span-2" />
      </FieldGrid>
    </Cmd>
  );
}

const HOLIDAYS_HINT = "One per line: YYYY-MM-DD Name (or a JSON array of {date, name, observed_rule}).";

async function CalendarDrawer({ code, links, ctx }: { code: string; links: { close: string; pane: string; paneHref: (k: string) => string }; ctx: Ctx }) {
  const [calendars, versions] = await Promise.all([loadCalendars(ctx.identity), J.listCalendarVersions(code, ctx.identity).then(settle)]);
  const c = (calendars.data ?? []).find((x) => x.calendar_code === code);
  if (!c) return null;
  const list = [...(versions.data ?? [])].sort((a, b) => b.version - a.version);
  const published = list.find((v) => v.status === "PUBLISHED");
  return (
    <DetailDrawer
      heading="Business calendar"
      closeHref={links.close}
      icon={CalendarDays}
      title={c.calendar_code}
      subtitle={c.authority}
      status={published ? { label: `v${published.version} published`, tone: "success" } : { label: "No published version", tone: "warning" }}
      actions={
        <>
          <Cmd command="calendar.version" label="New version" title={`New version of ${code}`} hidden={{ id: code }} description="A DRAFT version; a second person publishes it.">
            <FieldGrid>
              <Field name="effective_from" label="Effective from" type="date" />
              <Field name="timezone" label="Time zone" placeholder="Europe/London" />
              <Field name="weekend_days" label="Weekend days (0 = Sun … 6 = Sat)" defaultValue="0 6" />
              <Field name="cutoff_time" label="Cut-off time" optional placeholder="17:00" />
              <TextArea name="holidays" label="Holidays" rows={5} className="sm:col-span-2" hint={HOLIDAYS_HINT} />
            </FieldGrid>
          </Cmd>
          {published && (
            <Cmd command="calendar.check" label="Check a date" tone="accent" title={`Business days on ${code}`} hidden={{ id: code }} description="Whether a date is a business day, and the date N business days later, from the version in force.">
              <FieldGrid>
                <Field name="date" label="Date" type="date" />
                <Field name="days" label="Add business days" type="number" optional />
              </FieldGrid>
            </Cmd>
          )}
        </>
      }
    >
      <DrawerFacts
        items={[
          { label: "Versions", value: versions.data ? list.length : "Unavailable" },
          { label: "In force", value: published ? `v${published.version} from ${published.effective_from} · ${published.timezone}` : "—" },
          { label: "Holidays", value: published ? (published.holidays ?? []).length : "—" },
          { label: "Content digest", value: published ? shortHash(published.content_digest) : "—" },
        ]}
      />
      <PaneTitle>Versions</PaneTitle>
      <MiniList
        empty="No version yet."
        items={list.map((v) => ({
          key: v.calendar_version_id,
          primary: `v${v.version} · from ${v.effective_from}`,
          secondary: `${(v.holidays ?? []).length} holiday(s) · ${who(v.created_by_principal_id)}${v.published_by ? ` · published by ${who(v.published_by)}` : ""}`,
          right:
            v.status === "DRAFT" && v.created_by_principal_id !== ctx.me ? (
              <Cmd command="calendar.publish" label="Publish" tone="accent" title={`Publish v${v.version} of ${code}`} hidden={{ id: code, version: v.version }} description="Makes the version the one in force from its date. It cannot change afterwards." />
            ) : (
              <StatusChip status={v.status} />
            ),
        }))}
      />
      {list.some((v) => v.status === "DRAFT" && v.created_by_principal_id === ctx.me) && <DrawerNote>You authored a draft version here, so a second person publishes it.</DrawerNote>}
      <div className="mt-3">
        <Commands>
          <Cmd command="calendar.import" label="Import holidays" title={`Import a holiday list into ${code}`} hidden={{ id: code }} description="ImportHolidayCalendar: the authority's list, with observed-day rules applied, as a DRAFT version.">
            <FieldGrid>
              <Field name="source_authority" label="Source authority" />
              <Field name="source_reference" label="Source reference" />
              <Field name="source_version" label="Source version" />
              <Field name="effective_from" label="Effective from" type="date" />
              <Field name="timezone" label="Time zone" placeholder="Europe/London" />
              <Field name="weekend_days" label="Weekend days (0 = Sun … 6 = Sat)" defaultValue="0 6" />
              <TextArea name="holidays" label="Holidays" rows={5} className="sm:col-span-2" hint={HOLIDAYS_HINT} />
            </FieldGrid>
          </Cmd>
          {list[0] && (
            <Cmd command="calendar.sources" label="Set sources" title={`Sources of v${list[0].version}`} hidden={{ id: code, version: list[0].version }}>
              <TextArea name="source_ids" label="Source ids" defaultValue={(list[0].source_ids ?? []).join("\n")} />
            </Cmd>
          )}
        </Commands>
      </div>
    </DetailDrawer>
  );
}
