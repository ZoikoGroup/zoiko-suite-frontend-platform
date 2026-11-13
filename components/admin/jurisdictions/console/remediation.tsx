// Tab 11 · Remediation (F19): when a pack version is rolled back or
// withdrawn, every decision made with it is collected in a case and stays
// there until each has a disposition with evidence. Dispositions are
// append-only.

import { LifeBuoy, Plus } from "lucide-react";
import { RegisterView, type RegisterSpec, type Row } from "@/components/admin/authorization/console/register";
import { DetailDrawer, DrawerFacts, TwoLine } from "@/components/admin/console";
import { Field, FieldGrid, SelectField, TextArea } from "@/components/admin/authorization/ui";
import * as J from "@/lib/api/jurisdictions";
import { BASE, day, loadRemediation, settle, type Ctx, type Query } from "./data";
import { Cmd, MiniList, PaneTitle, StatusChip, Unavailable, who } from "./shared";

export async function RemediationTab({ query, ctx }: { query: Query; ctx: Ctx }) {
  const cases = await loadRemediation(ctx.identity);
  const rows: Row[] = (cases.data ?? []).map((c) => ({
    id: c.case_id,
    idLabel: `RC-${c.case_id.slice(0, 6)}`,
    search: `${c.pack_ref} ${c.version} ${c.reason} ${c.trigger}`,
    facets: { status: c.status, trigger: c.trigger },
    cells: [
      <TwoLine key="p" primary={`${c.pack_ref}@${c.version}`} secondary={c.trigger.toLowerCase()} />,
      <span key="r" className="whitespace-nowrap">
        {c.ring_code ? `${c.ring_code} / ${c.region_code}` : "—"}
      </span>,
      <span key="d" className="tabular-nums">
        {c.progress ? `${c.progress.dispositioned}/${c.progress.total}` : c.decisions_total}
      </span>,
      <StatusChip key="s" status={c.status} />,
      <span key="o" className="whitespace-nowrap">
        {day(c.opened_at)}
      </span>,
    ],
  }));
  const spec: RegisterSpec = {
    base: BASE,
    noun: "cases",
    what: "the remediation cases",
    idColumn: "Case",
    columns: [{ label: "Pack / trigger" }, { label: "Ring / region" }, { label: "Dispositioned", align: "right" }, { label: "Status" }, { label: "Opened" }],
    rows,
    filters: [
      { name: "status", allLabel: "All states", options: [["OPEN", "Open"], ["CLOSED", "Closed"]] },
      { name: "trigger", allLabel: "All triggers", options: [["ROLLBACK", "Rollback"], ["WITHDRAW", "Withdrawal"], ["MANUAL", "Manual"]] },
    ],
    searchPlaceholder: "Search pack, version or reason…",
    empty: "No remediation case. A rollback or withdrawal opens one automatically when decisions were made with the version.",
    error: cases.error,
    problem: (e) => <Unavailable what="The remediation cases" error={e} />,
    drawer: (id, links) => <CaseDrawer id={id} links={links} ctx={ctx} />,
  };
  return <RegisterView spec={spec} query={query} />;
}

export function RemediationActions() {
  return (
    <Cmd command="remediation.open" label="Open case" icon={<Plus className="h-4 w-4" />} title="Open a remediation case" description="For a version whose content was wrong without a rollback or withdrawal (retroactive legislation, a late source).">
      <FieldGrid>
        <Field name="pack_ref" label="Pack ref" />
        <Field name="version" label="Version" />
        <Field name="ring" label="Ring" optional />
        <Field name="region" label="Region" optional />
        <TextArea name="reason" label="Reason" className="sm:col-span-2" />
        <Field name="evidence_ref" label="Evidence" className="sm:col-span-2" />
      </FieldGrid>
    </Cmd>
  );
}

async function CaseDrawer({ id, links, ctx }: { id: string; links: { close: string; pane: string; paneHref: (k: string) => string }; ctx: Ctx }) {
  const [read, decisions] = await Promise.all([J.getRemediationCase(id, ctx.identity).then(settle), J.listCaseDecisions(id, ctx.identity).then(settle)]);
  const c = read.data;
  if (!c) return null;
  const pending = (decisions.data ?? []).filter((d) => !d.disposition);
  return (
    <DetailDrawer
      heading="Remediation case"
      closeHref={links.close}
      icon={LifeBuoy}
      title={`${c.pack_ref}@${c.version}`}
      subtitle={`${c.trigger.toLowerCase()} · opened ${day(c.opened_at)} by ${who(c.opened_by)}`}
      status={{ label: c.status.toLowerCase(), tone: c.status === "OPEN" ? "warning" : "neutral" }}
      actions={
        c.status === "OPEN" ? (
          <>
            {pending.length > 0 && (
              <Cmd command="remediation.disposition" label="Record disposition" title="Disposition a decision" hidden={{ id }} description="What happened to a decision made with this version. Append-only.">
                <FieldGrid>
                  <SelectField name="decision_id" label="Decision" options={pending.map((d) => [d.decision_id, `${d.decision_kind} · ${d.outcome} · ${day(d.decided_at)}`] as const)} className="sm:col-span-2" />
                  <SelectField name="disposition" label="Disposition" options={J.DISPOSITIONS.map((d) => [d, d.replaceAll("_", " ").toLowerCase()] as const)} className="sm:col-span-2" />
                  <Field name="evidence_ref" label="Evidence" className="sm:col-span-2" />
                  <Field name="new_decision_id" label="New decision id" optional className="sm:col-span-2" hint="When superseded by a new decision." />
                  <TextArea name="note" label="Note" optional className="sm:col-span-2" />
                </FieldGrid>
              </Cmd>
            )}
            {pending.length === 0 && (
              <Cmd command="remediation.close" label="Close case" tone="accent" title="Close this case" hidden={{ id }} description="Every decision has a disposition.">
                <TextArea name="note" label="Closing note" />
              </Cmd>
            )}
          </>
        ) : undefined
      }
    >
      <DrawerFacts
        items={[
          { label: "Reason", value: c.reason },
          { label: "Evidence", value: c.evidence_ref ?? "—" },
          { label: "Ring / region", value: c.ring_code ? `${c.ring_code} / ${c.region_code}` : "—" },
          { label: "Progress", value: c.progress ? `${c.progress.dispositioned} of ${c.progress.total} dispositioned` : `${c.decisions_total} decision(s)` },
          { label: "Closed", value: c.closed_at ? `${day(c.closed_at)} by ${who(c.closed_by)} · ${c.closure_note ?? ""}` : "—" },
        ]}
      />
      <PaneTitle>Decisions</PaneTitle>
      <MiniList
        empty={decisions.error ? "Unavailable." : "No decision."}
        items={(decisions.data ?? []).map((d) => ({
          key: d.decision_id,
          primary: `${d.decision_kind} · ${d.outcome}`,
          secondary: `${day(d.decided_at)} · ${who(d.requested_by)}`,
          right: d.disposition ? <StatusChip status="APPROVED" text={d.disposition.disposition.replaceAll("_", " ").toLowerCase()} /> : <StatusChip status="PENDING" text="Pending" />,
        }))}
      />
    </DetailDrawer>
  );
}
