// Tab 7 · Rollouts (F18): how a jurisdiction becomes supported. Each step is
// gated by checklist attestations with evidence and an expert approval; the
// database refuses a transition the gates do not allow, and the drawer names
// what blocks the next one.

import { Plus, Rocket, Sprout } from "lucide-react";
import { RegisterView, type RegisterSpec, type Row } from "@/components/admin/authorization/console/register";
import { DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { Field, FieldGrid, SelectField, TextArea } from "@/components/admin/authorization/ui";
import * as J from "@/lib/api/jurisdictions";
import { BASE, day, loadRollouts, settle, type Ctx, type Query } from "./data";
import { Cmd, Commands, MiniList, PaneTitle, StatusChip, Unavailable, who } from "./shared";

export async function RolloutsTab({ query, ctx }: { query: Query; ctx: Ctx }) {
  const rollouts = await loadRollouts(ctx.identity);
  const rows: Row[] = (rollouts.data ?? []).map((r) => ({
    id: r.rollout_id,
    idLabel: r.family_ref,
    search: `${r.family_ref} ${r.display_name} ${r.jurisdiction_code ?? ""} ${r.owner}`,
    facets: { status: r.status, layer: r.layer },
    cells: [
      <TwoLine key="n" primary={r.display_name} secondary={r.layer.replaceAll("_", " ").toLowerCase()} />,
      <span key="j">{r.jurisdiction_code ?? "—"}</span>,
      <span key="o" className="whitespace-nowrap">
        {r.owner}
      </span>,
      <StatusChip key="s" status={r.status} />,
      <span key="u" className="whitespace-nowrap">
        {day(r.updated_at)}
      </span>,
    ],
  }));
  const spec: RegisterSpec = {
    base: BASE,
    noun: "rollouts",
    what: "the rollouts",
    idColumn: "Family",
    columns: [{ label: "Rollout / layer" }, { label: "Jurisdiction" }, { label: "Owner" }, { label: "Status" }, { label: "Updated" }],
    rows,
    filters: [
      { name: "status", allLabel: "All states", options: J.ROLLOUT_STATUSES.map((s) => [s, s.charAt(0) + s.slice(1).toLowerCase()] as const) },
      { name: "layer", allLabel: "All layers", options: J.ROLLOUT_LAYERS.map((l) => [l, l.replaceAll("_", " ").toLowerCase()] as const) },
    ],
    searchPlaceholder: "Search rollout, family, jurisdiction or owner…",
    empty: "No rollout is planned. Seed the standard portfolio, or add one.",
    error: rollouts.error,
    problem: (e) => <Unavailable what="The rollouts" error={e} />,
    drawer: (id, links) => <RolloutDrawer id={id} links={links} ctx={ctx} />,
  };
  return <RegisterView spec={spec} query={query} />;
}

export function RolloutsActions() {
  return (
    <>
      <Cmd command="rollout.seed" label="Seed portfolio" icon={<Sprout className="h-4 w-4" />} title="Seed the standard rollout portfolio" description="Adds the standard rollouts (global reference, core, regional frameworks). Existing ones are left as they are." />
      <Cmd command="rollout.create" label="New rollout" icon={<Plus className="h-4 w-4" />} title="Plan a rollout" description="A rollout starts PLANNED; its checklist and expert approval gate every later step.">
        <FieldGrid>
          <Field name="family_ref" label="Family ref" placeholder="country.gb" />
          <Field name="display_name" label="Name" placeholder="United Kingdom" />
          <SelectField name="layer" label="Layer" options={J.ROLLOUT_LAYERS.map((l) => [l, l.replaceAll("_", " ").toLowerCase()] as const)} />
          <Field name="jurisdiction_code" label="Jurisdiction code" optional hint="Required for COUNTRY and SUBDIVISION." />
          <Field name="owner" label="Owner" />
          <Field name="support_owner" label="Support owner" optional />
          <TextArea name="scope_note" label="Scope" className="sm:col-span-2" />
        </FieldGrid>
      </Cmd>
    </>
  );
}

async function RolloutDrawer({ id, links, ctx }: { id: string; links: { close: string; pane: string; paneHref: (k: string) => string }; ctx: Ctx }) {
  const detail = await J.getRollout(id, ctx.identity).then(settle);
  const d = detail.data;
  if (!d) return null;
  const r = d.rollout;
  const pane = links.pane || "overview";
  const next = J.ROLLOUT_NEXT[r.status] ?? [];
  const unmet = (d.checklist ?? []).filter((c) => !c.met);
  const blockers = Object.entries(d.blockers ?? {}).flatMap(([to, why]) => why.map((w) => `${to}: ${w}`));
  return (
    <DetailDrawer
      heading="Rollout"
      closeHref={links.close}
      icon={Rocket}
      title={r.display_name}
      subtitle={`${r.family_ref} · ${r.layer.replaceAll("_", " ").toLowerCase()}`}
      status={{ label: r.status.toLowerCase(), tone: r.status === "LAUNCHED" ? "success" : r.status === "SUSPENDED" ? "danger" : "warning" }}
      panes={["overview", "checklist", "history"].map((k) => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1), href: links.paneHref(k) }))}
      activePane={pane}
      actions={
        next.length ? (
          <Cmd command="rollout.transition" label="Move rollout" tone="accent" title={`Move ${r.display_name}`} hidden={{ id }} description="The database refuses a step whose gates are not met.">
            <FieldGrid>
              <SelectField name="to" label="To" options={next.map((s) => [s, s.charAt(0) + s.slice(1).toLowerCase()] as const)} className="sm:col-span-2" />
              <TextArea name="reason" label="Reason" className="sm:col-span-2" />
            </FieldGrid>
          </Cmd>
        ) : undefined
      }
    >
      {pane === "overview" && (
        <>
          <DrawerFacts
            items={[
              { label: "Jurisdiction", value: r.jurisdiction_code ?? "—" },
              { label: "Owner", value: `${r.owner}${r.support_owner ? ` · support ${r.support_owner}` : ""}` },
              { label: "Checklist", value: `${(d.checklist ?? []).length - unmet.length} of ${(d.checklist ?? []).length} met` },
              { label: "Expert approvals", value: (d.expert_approvals ?? []).length },
              { label: "Packs", value: (d.pack_refs ?? []).join(", ") || "—" },
              { label: "Scope", value: r.scope_note },
            ]}
          />
          {blockers.length > 0 && <DrawerNote>Blocking the next step: {blockers.join("; ")}.</DrawerNote>}
          <div className="mt-3">
            <Commands>
              <Cmd command="rollout.expert" label="Expert decision" title="Record an expert decision" hidden={{ id }} description="A qualified expert's approval of the rollout's legal content.">
                <FieldGrid>
                  <Field name="qualification" label="Qualification" />
                  <SelectField name="decision" label="Decision" options={[["APPROVE", "Approve"], ["REJECT", "Reject"]]} />
                  <Field name="scope" label="Scope" className="sm:col-span-2" />
                  <TextArea name="notes" label="Notes" optional className="sm:col-span-2" />
                </FieldGrid>
              </Cmd>
              <Cmd command="rollout.owner" label="Set owner" title="Set the rollout's owner" hidden={{ id }}>
                <FieldGrid>
                  <Field name="owner" label="Owner" defaultValue={r.owner} />
                  <Field name="support_owner" label="Support owner" optional defaultValue={r.support_owner ?? ""} />
                </FieldGrid>
              </Cmd>
              <Cmd command="rollout.packs" label="Link packs" title="Packs this rollout ships" hidden={{ id }}>
                <TextArea name="pack_refs" label="Pack refs" defaultValue={(d.pack_refs ?? []).join("\n")} />
              </Cmd>
            </Commands>
          </div>
        </>
      )}
      {pane === "checklist" && (
        <MiniList
          empty="No checklist item."
          items={(d.checklist ?? []).map((c) => ({
            key: `${c.checklist}:${c.code}`,
            primary: c.text,
            secondary: `${c.checklist} · ${c.code}${c.met ? ` · ${who(c.attested_by)} · ${c.evidence_ref}` : ""}`,
            right: c.met ? (
              <StatusChip status="APPROVED" text="Met" />
            ) : (
              <Cmd command="rollout.attest" label="Attest" title={c.text} hidden={{ id, checklist: c.checklist, item_code: c.code, met: "true" }}>
                <Field name="evidence_ref" label="Evidence" />
              </Cmd>
            ),
          }))}
        />
      )}
      {pane === "history" && (
        <>
          <PaneTitle>Transitions</PaneTitle>
          <MiniList empty="No transition yet." items={(d.events ?? []).map((e, i) => ({ key: String(i), primary: `${e.from_status ?? "—"} → ${e.to_status}`, secondary: `${day(e.occurred_at)} · ${who(e.actor)} · ${e.reason}` }))} />
          <PaneTitle>Expert decisions</PaneTitle>
          <MiniList empty="None." items={(d.expert_approvals ?? []).map((e, i) => ({ key: String(i), primary: `${e.decision} · ${e.qualification}`, secondary: `${who(e.expert)} · ${e.scope}` }))} />
        </>
      )}
    </DetailDrawer>
  );
}
