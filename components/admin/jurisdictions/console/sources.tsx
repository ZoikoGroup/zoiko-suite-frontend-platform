// Tab 5 · Source authority (F14, F17): the source register every rule and
// interpretation cites, with its independent review (never by the person who
// captured it), supersession, regimes and interpretations.

import { BookMarked, FileSearch, Landmark, Plus, Stamp } from "lucide-react";
import { RegisterView, type RegisterSpec, type Row } from "@/components/admin/authorization/console/register";
import { DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { Field, FieldGrid, SelectField, TextArea } from "@/components/admin/authorization/ui";
import * as J from "@/lib/api/jurisdictions";
import { BASE, day, jurisdictionLabel, loadJurisdictions, loadRegimes, loadSources, settle, type Ctx, type Query } from "./data";
import { Cmd, Commands, Mono, StatusChip, Unavailable, shortHash, who } from "./shared";

const stateOf = (s: J.RegulatorySource) => (s.superseded_by_source_id ? "SUPERSEDED" : s.reviewed_at ? "REVIEWED" : "PENDING");

export async function SourcesTab({ query, ctx }: { query: Query; ctx: Ctx }) {
  const [sources, jurisdictions] = await Promise.all([loadSources(ctx.identity), loadJurisdictions(ctx.identity)]);
  const byId = new Map((jurisdictions.data ?? []).map((j) => [j.jurisdiction_id, j]));
  const rows: Row[] = (sources.data ?? []).map((s) => ({
    id: s.source_id,
    idLabel: s.official_identifier || s.source_id.slice(0, 8),
    search: `${s.title} ${s.authority} ${s.official_identifier ?? ""} ${byId.get(s.jurisdiction_id)?.jurisdiction_code ?? ""}`,
    facets: { jur: s.jurisdiction_id, state: stateOf(s), level: s.authority_level },
    cells: [
      <TwoLine key="t" primary={s.title} secondary={s.authority} />,
      <span key="j" className="whitespace-nowrap">
        {byId.get(s.jurisdiction_id)?.jurisdiction_code ?? "—"}
      </span>,
      <TwoLine key="k" primary={s.source_type.replaceAll("_", " ").toLowerCase()} secondary={s.authority_level.replaceAll("_", " ").toLowerCase()} />,
      <span key="e" className="whitespace-nowrap">
        {s.effective_on ? day(s.effective_on) : "—"}
      </span>,
      <span key="r" className="whitespace-nowrap">
        {s.reviewed_at ? day(s.reviewed_at) : "—"}
      </span>,
      <StatusChip key="s" status={stateOf(s) === "PENDING" ? "PENDING" : stateOf(s)} text={stateOf(s) === "PENDING" ? "Source review" : stateOf(s) === "REVIEWED" ? "Reviewed" : "Superseded"} />,
    ],
  }));
  const levels = [...new Set((sources.data ?? []).map((s) => s.authority_level))];
  const spec: RegisterSpec = {
    base: BASE,
    noun: "sources",
    what: "the source register",
    idColumn: "Source",
    columns: [{ label: "Title / authority" }, { label: "Jurisdiction" }, { label: "Type / level" }, { label: "Effective on" }, { label: "Reviewed" }, { label: "State" }],
    rows,
    filters: [
      { name: "jur", allLabel: "All jurisdictions", options: (jurisdictions.data ?? []).filter((j) => j.active_flag).map((j) => [j.jurisdiction_id, j.jurisdiction_code] as const) },
      { name: "state", allLabel: "All states", options: [["PENDING", "Awaiting review"], ["REVIEWED", "Reviewed"], ["SUPERSEDED", "Superseded"]] },
      { name: "level", allLabel: "All levels", options: levels.map((l) => [l, l.replaceAll("_", " ").toLowerCase()] as const) },
    ],
    searchPlaceholder: "Search title, authority or identifier…",
    empty: "No source is captured yet. Capture one with Capture source.",
    error: sources.error,
    problem: (e) => <Unavailable what="The source register" error={e} />,
    drawer: (id, links) => <SourceDrawer id={id} links={links} ctx={ctx} byId={byId} />,
  };
  return <RegisterView spec={spec} query={query} />;
}

async function SourceDrawer({ id, links, ctx, byId }: { id: string; links: { close: string; pane: string; paneHref: (k: string) => string }; ctx: Ctx; byId: Map<string, J.Jurisdiction> }) {
  const [read, all] = await Promise.all([J.getSource(id, ctx.identity).then(settle), loadSources(ctx.identity)]);
  const s = read.data?.data;
  if (!s) return null;
  const etag = read.data?.etag;
  const author = s.created_by_principal_id === ctx.me;
  const replacements = (all.data ?? []).filter((x) => x.source_id !== id && x.jurisdiction_id === s.jurisdiction_id && !x.superseded_by_source_id);
  return (
    <DetailDrawer
      heading="Source details"
      closeHref={links.close}
      icon={Landmark}
      title={s.title}
      subtitle={`${s.authority} · ${jurisdictionLabel(byId, s.jurisdiction_id)}`}
      status={s.superseded_by_source_id ? { label: "Superseded", tone: "neutral" } : s.reviewed_at ? { label: "Reviewed", tone: "success" } : { label: "Review", tone: "warning" }}
      actions={
        <>
          {!s.superseded_by_source_id && replacements.length > 0 && (
            <Cmd command="source.supersede" label="Supersede" title={`Supersede "${s.title}"`} hidden={{ id, etag }} description="The old source is kept unchanged; new citations use the replacement.">
              <SelectField name="replacement_source_id" label="Replacement" options={replacements.map((x) => [x.source_id, x.title] as const)} />
            </Cmd>
          )}
          {!s.reviewed_at && !s.superseded_by_source_id && !author && (
            <Cmd command="source.review" label="Review source" tone="accent" icon={<FileSearch className="h-4 w-4" />} title={`Review "${s.title}"`} hidden={{ id, etag }} description="Your independent check that the captured snapshot is the authoritative text. After it, interpretations, rules and packs may cite this source." />
          )}
        </>
      }
    >
      <DrawerFacts
        items={[
          { label: "Type · level", value: `${s.source_type} · ${s.authority_level}` },
          { label: "Identifier", value: s.official_identifier ?? "—" },
          { label: "Published · effective", value: `${s.published_on ?? "—"} · ${s.effective_on ?? "—"}` },
          { label: "Location", value: <a href={s.location} target="_blank" rel="noreferrer" className="text-navy-600 hover:underline">{s.location.replace(/^https?:\/\//, "").slice(0, 40)}</a> },
          { label: "Snapshot hash", value: <Mono title={s.snapshot_hash}>{shortHash(s.snapshot_hash)}</Mono> },
          { label: "Language", value: s.language },
          { label: "Captured", value: `${day(s.created_at)} by ${who(s.created_by_principal_id)}` },
          { label: "Reviewed", value: s.reviewed_at ? `${day(s.reviewed_at)} by ${who(s.reviewed_by_principal_id)}` : "Not yet" },
        ]}
      />
      {author && !s.reviewed_at && <DrawerNote>You captured this source, so its review is someone else&apos;s.</DrawerNote>}
      <div className="mt-3">
        <Commands>
          <Cmd command="interp.create" label="Record interpretation" title="Record an interpretation of this source" hidden={{ jurisdiction_id: s.jurisdiction_id, source_ids: id }} description="What the source means for a rule, with its rationale. A second person approves it.">
            <FieldGrid>
              <Field name="subject" label="Subject" className="sm:col-span-2" />
              <TextArea name="decision" label="Interpretation" className="sm:col-span-2" />
              <TextArea name="rationale" label="Rationale" className="sm:col-span-2" />
              <Field name="regime_id" label="Regime id" optional className="sm:col-span-2" />
            </FieldGrid>
          </Cmd>
          <Cmd command="notice.create" label="Report a change" title="Report a change to this source" hidden={{ jurisdiction_id: s.jurisdiction_id, affected_source_id: id, authority: s.authority }} description="Opens a source-change notice: a reviewer decides whether rules must change. Nothing is published automatically.">
            <FieldGrid>
              <SelectField name="change_type" label="Change" options={J.NOTICE_CHANGE_TYPES.map((t) => [t, t.replaceAll("_", " ").toLowerCase()] as const)} className="sm:col-span-2" />
              <Field name="title" label="Title" className="sm:col-span-2" />
              <Field name="location" label="Where" optional className="sm:col-span-2" />
              <TextArea name="detail" label="Detail" optional className="sm:col-span-2" />
            </FieldGrid>
          </Cmd>
        </Commands>
      </div>
    </DetailDrawer>
  );
}

export async function SourcesActions({ ctx, jurisdictions }: { ctx: Ctx; jurisdictions: J.Jurisdiction[] }) {
  const regimes = await loadRegimes(ctx.identity);
  const jOpts = jurisdictions.filter((j) => j.active_flag).map((j) => [j.jurisdiction_id, J.describeJurisdiction(j)] as const);
  return (
    <>
      <Cmd command="interp.approve" label="Approve interpretation" icon={<Stamp className="h-4 w-4" />} title="Approve an interpretation" description="By its id (from the interpretation's recording). You cannot approve one you recorded.">
        <Field name="id" label="Interpretation id" />
      </Cmd>
      <Cmd command="regime.create" label="New regime" icon={<BookMarked className="h-4 w-4" />} title="Register a regime" description={`Regimes group rules (VAT, CIT, PAYE). ${regimes.data ? `${regimes.data.length} registered: ${regimes.data.map((r) => r.regime_code).join(", ") || "none"}.` : ""}`}>
        <FieldGrid>
          <Field name="regime_code" label="Code" placeholder="VAT" />
          <Field name="regime_name" label="Name" placeholder="Value added tax" />
          <TextArea name="description" label="Description" optional className="sm:col-span-2" />
        </FieldGrid>
      </Cmd>
      <Cmd command="source.create" label="Capture source" icon={<Plus className="h-4 w-4" />} title="Capture a regulatory source" description="The authoritative text and the sha256 of its snapshot. Content is immutable; a second person reviews it before anything cites it.">
        <FieldGrid>
          <SelectField name="jurisdiction_id" label="Jurisdiction" options={jOpts} className="sm:col-span-2" />
          <Field name="authority" label="Authority" placeholder="HM Revenue & Customs" className="sm:col-span-2" />
          <SelectField name="source_type" label="Type" options={J.SOURCE_TYPES.map((t) => [t, t.replaceAll("_", " ").toLowerCase()] as const)} />
          <SelectField name="authority_level" label="Authority level" options={J.AUTHORITY_LEVELS.map((t) => [t, t.replaceAll("_", " ").toLowerCase()] as const)} />
          <Field name="title" label="Title" className="sm:col-span-2" />
          <Field name="official_identifier" label="Official identifier" optional />
          <Field name="language" label="Language" optional placeholder="en" />
          <Field name="location" label="Location (URL)" className="sm:col-span-2" />
          <Field name="snapshot_hash" label="Snapshot hash" placeholder="sha256:<64 hex>" className="sm:col-span-2" />
          <Field name="published_on" label="Published on" type="date" optional />
          <Field name="effective_on" label="Effective on" type="date" optional />
        </FieldGrid>
      </Cmd>
    </>
  );
}
