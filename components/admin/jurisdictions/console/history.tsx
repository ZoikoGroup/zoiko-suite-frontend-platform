// Tab 6 · Change history (F07, F17, J-16): every proposed change to the
// reference data and who decided it — jurisdiction imports (maker-checker),
// source-change notices (reviewer, outcome) — and events the outbox could not
// deliver, which an operator requeues with a reason.

import { History, Layers, Radio } from "lucide-react";
import { RegisterView, type RegisterSpec, type Row } from "@/components/admin/authorization/console/register";
import { DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { Field, FieldGrid, SelectField, TextArea } from "@/components/admin/authorization/ui";
import * as J from "@/lib/api/jurisdictions";
import { BASE, day, loadImports, loadNotices, loadParked, settle, type Ctx, type Query } from "./data";
import { Chip, Cmd, MiniList, Mono, StatusChip, Unavailable, who } from "./shared";

type Kind = "import" | "notice" | "event";

export async function HistoryTab({ query, ctx }: { query: Query; ctx: Ctx }) {
  const [imports, notices, parked] = await Promise.all([loadImports(ctx.identity), loadNotices(ctx.identity), loadParked(ctx.identity)]);
  const rows: (Row & { at: string })[] = [];
  for (const b of imports.data ?? [])
    rows.push({
      id: `import:${b.batch_id}`,
      idLabel: `IMP-${b.batch_id.slice(0, 6)}`,
      at: b.proposed_at,
      search: `${b.summary} ${b.source_standard} ${b.source_version}`,
      facets: { kind: "import", status: b.status },
      cells: [<Chip key="k" text="Import" tone="info" />, <TwoLine key="t" primary={b.summary} secondary={`${b.source_standard} ${b.source_version} · ${b.item_count} row(s)`} />, <StatusChip key="s" status={b.status} />, <span key="b">{who(b.proposed_by)}</span>, <span key="a" className="whitespace-nowrap">{day(b.proposed_at)}</span>, <span key="d">{who(b.decided_by)}</span>],
    });
  for (const n of notices.data ?? [])
    rows.push({
      id: `notice:${n.notice_id}`,
      idLabel: `SCN-${n.notice_id.slice(0, 6)}`,
      at: n.created_at,
      search: `${n.title} ${n.authority} ${n.change_type}`,
      facets: { kind: "notice", status: n.status },
      cells: [<Chip key="k" text="Source change" tone="warning" />, <TwoLine key="t" primary={n.title} secondary={`${n.authority} · ${n.change_type.replaceAll("_", " ").toLowerCase()}`} />, <StatusChip key="s" status={n.status} />, <span key="b">{who(n.created_by_principal_id)}</span>, <span key="a" className="whitespace-nowrap">{day(n.created_at)}</span>, <span key="d">{who(n.closed_by ?? n.reviewer)}</span>],
    });
  for (const e of parked.data ?? [])
    rows.push({
      id: `event:${e.outbox_id}`,
      idLabel: `EVT-${e.outbox_id.slice(0, 6)}`,
      at: e.created_at,
      search: `${e.event_type} ${e.topic} ${e.last_error ?? ""}`,
      facets: { kind: "event", status: "PARKED" },
      cells: [<Chip key="k" text="Parked event" tone="danger" />, <TwoLine key="t" primary={e.event_type} secondary={e.last_error ?? e.topic} />, <StatusChip key="s" status="PARKED" />, <span key="b">System</span>, <span key="a" className="whitespace-nowrap">{day(e.created_at)}</span>, <span key="d">—</span>],
    });
  rows.sort((a, b) => b.at.localeCompare(a.at));
  const error = imports.error && notices.error ? imports.error : null;

  const spec: RegisterSpec = {
    base: BASE,
    noun: "changes",
    what: "the change history",
    idColumn: "Change",
    columns: [{ label: "Kind" }, { label: "What" }, { label: "Status" }, { label: "Raised by" }, { label: "Raised" }, { label: "Decided by" }],
    rows,
    filters: [
      { name: "kind", allLabel: "All kinds", options: [["import", "Imports"], ["notice", "Source changes"], ["event", "Parked events"]] },
      { name: "status", allLabel: "All states", options: [["PROPOSED", "Proposed"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["OPEN", "Open"], ["UNDER_REVIEW", "Under review"], ["CLOSED", "Closed"], ["PARKED", "Parked"]] },
    ],
    searchPlaceholder: "Search summary, authority, event type…",
    empty: "No change has been proposed yet.",
    note: [imports.error && "imports unavailable", notices.error && "notices unavailable", parked.error && "parked events unavailable"].filter(Boolean).join(" · ") || undefined,
    error,
    problem: (e) => <Unavailable what="The change history" error={e} />,
    drawer: (id, links) => <ChangeDrawer id={id} links={links} ctx={ctx} />,
  };
  return <RegisterView spec={spec} query={query} />;
}

async function ChangeDrawer({ id, links, ctx }: { id: string; links: { close: string; pane: string; paneHref: (k: string) => string }; ctx: Ctx }) {
  const [kind, raw] = id.split(":") as [Kind, string];
  if (kind === "import") {
    const read = await J.getImport(raw, ctx.identity).then(settle);
    const b = read.data;
    if (!b) return null;
    const proposer = b.proposed_by === ctx.me;
    return (
      <DetailDrawer
        heading="Import batch"
        closeHref={links.close}
        icon={Layers}
        title={b.summary}
        subtitle={`${b.source_standard} ${b.source_version}`}
        status={{ label: b.status.toLowerCase(), tone: b.status === "APPROVED" ? "success" : b.status === "REJECTED" ? "danger" : "warning" }}
        actions={
          b.status === "PROPOSED" && !proposer ? (
            <>
              <Cmd command="import.reject" label="Reject" tone="danger" title="Reject this import" hidden={{ id: raw }}>
                <TextArea name="reason" label="Reason" />
              </Cmd>
              <Cmd command="import.approve" label="Approve and apply" tone="accent" title="Approve this import" hidden={{ id: raw }} description="Applies every row in one transaction: jurisdictions added, updated or retired with their history.">
                <TextArea name="reason" label="Note" optional />
              </Cmd>
            </>
          ) : undefined
        }
      >
        <DrawerFacts
          items={[
            { label: "Rows", value: `${b.item_count}${b.invalid_count ? ` (${b.invalid_count} invalid)` : ""}` },
            { label: "Evidence", value: b.evidence_ref },
            { label: "Import hash", value: <Mono>{b.import_hash.slice(0, 18)}…</Mono> },
            { label: "Proposed", value: `${day(b.proposed_at)} by ${who(b.proposed_by)}` },
            { label: "Decided", value: b.decided_at ? `${day(b.decided_at)} by ${who(b.decided_by)}` : "Not yet" },
            { label: "Outcome", value: b.status === "APPROVED" ? `${b.added_count ?? 0} added · ${b.updated_count ?? 0} updated · ${b.retired_count ?? 0} retired` : b.decision_reason ?? "—" },
          ]}
        />
        {proposer && b.status === "PROPOSED" && <DrawerNote>You proposed this import, so a second person approves or rejects it.</DrawerNote>}
        <MiniList
          empty="No rows."
          items={(b.items ?? []).map((i) => ({ key: String(i.item_no), primary: `Row ${i.item_no}`, secondary: (i.validation_errors ?? []).join("; ") || i.outcome || "valid", right: i.validation_errors?.length ? <Chip text="Invalid" tone="danger" /> : undefined }))}
        />
      </DetailDrawer>
    );
  }
  if (kind === "notice") {
    const read = await J.getNotice(raw, ctx.identity).then(settle);
    const n = read.data?.data;
    if (!n) return null;
    const etag = read.data?.etag;
    return (
      <DetailDrawer
        heading="Source-change notice"
        closeHref={links.close}
        icon={History}
        title={n.title}
        subtitle={`${n.authority} · ${n.change_type.replaceAll("_", " ").toLowerCase()}`}
        status={{ label: n.status.replaceAll("_", " ").toLowerCase(), tone: n.status === "CLOSED" ? "neutral" : "warning" }}
        actions={
          n.status === "OPEN" ? (
            <Cmd command="notice.review" label="Take review" tone="accent" title="Review this notice" hidden={{ id: raw, etag }} description="You become its reviewer; you then close it with an outcome." />
          ) : n.status === "UNDER_REVIEW" ? (
            <Cmd command="notice.close" label="Close with outcome" tone="accent" title="Close this notice" hidden={{ id: raw, etag }}>
              <FieldGrid>
                <SelectField name="outcome" label="Outcome" options={J.NOTICE_OUTCOMES.map((o) => [o, o.replaceAll("_", " ").toLowerCase()] as const)} className="sm:col-span-2" />
                <TextArea name="note" label="Note" className="sm:col-span-2" />
                <Field name="linked_interpretation_id" label="Interpretation id" optional className="sm:col-span-2" />
              </FieldGrid>
            </Cmd>
          ) : undefined
        }
      >
        <DrawerFacts
          items={[
            { label: "Where", value: n.location ?? "—" },
            { label: "Detail", value: n.detail ?? "—" },
            { label: "Raised", value: `${day(n.created_at)} by ${who(n.created_by_principal_id)}` },
            { label: "Reviewer", value: who(n.reviewer) },
            { label: "Outcome", value: n.outcome ? `${n.outcome.replaceAll("_", " ").toLowerCase()} · ${n.outcome_note ?? ""}` : "—" },
          ]}
        />
      </DetailDrawer>
    );
  }
  const parked = await loadParked(ctx.identity);
  const e = (parked.data ?? []).find((x) => x.outbox_id === raw);
  if (!e) return null;
  return (
    <DetailDrawer
      heading="Parked outbox event"
      closeHref={links.close}
      icon={Radio}
      title={e.event_type}
      subtitle={`${e.topic} · ${e.publish_attempts} failed attempt(s)`}
      status={{ label: "Parked", tone: "danger" }}
      actions={
        <Cmd command="outbox.requeue" label="Requeue" tone="accent" title="Requeue this event" hidden={{ id: raw }} description="J-16: the relay tries it again on its next pass. The reason and evidence are kept, append-only.">
          <FieldGrid>
            <TextArea name="reason" label="Reason (what was fixed)" className="sm:col-span-2" />
            <Field name="evidence_ref" label="Evidence" optional className="sm:col-span-2" />
          </FieldGrid>
        </Cmd>
      }
    >
      <DrawerFacts
        items={[
          { label: "Last error", value: e.last_error ?? "—" },
          { label: "Partition key", value: e.partition_key ?? "—" },
          { label: "Created", value: day(e.created_at) },
          { label: "Earlier requeues", value: (e.requeues ?? []).length },
        ]}
      />
    </DetailDrawer>
  );
}
