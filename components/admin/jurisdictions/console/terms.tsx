// Tab 9 · Payment terms (F09, REF-10): a term's versions, their
// maker-checker approval, supersession and retirement, and the due date with
// every step that produced it.
//
// The service has no list of payment terms (only GET by code), so this tab
// opens on a code: the lookup form below sets ?term=.

import Form from "next/form";
import { Plus, ReceiptText, Timer } from "lucide-react";
import { DetailDrawer, DrawerFacts, DrawerNote, RegisterBody, RegisterTable, RowLink, TwoLine } from "@/components/admin/console";
import { Field, FieldGrid, SelectField, TextArea } from "@/components/admin/authorization/ui";
import * as J from "@/lib/api/jurisdictions";
import { BASE, day, href, settle, type Ctx, type Query } from "./data";
import { Cmd, StatusChip, Unavailable, shortHash, who } from "./shared";

export async function TermsTab({ query, ctx }: { query: Query; ctx: Ctx }) {
  const code = (query.term ?? "").trim().toUpperCase();
  const [term, versions] = code ? await Promise.all([J.getPaymentTerm(code, ctx.identity).then(settle), J.listPaymentTermVersions(code, ctx.identity).then(settle)]) : [null, null];
  const list = [...(versions?.data ?? [])].sort((a, b) => b.version - a.version);
  // Every link keeps ?term (RegisterView's links would drop it).
  const selected = query.id === undefined ? list[0] && String(list[0].version) : query.id || undefined;
  const at = (changes: Query) => href(query, changes);
  const error = term?.error ?? versions?.error ?? null;
  const drawer =
    term?.data && selected ? (
      <TermDrawer code={code} version={Number(selected)} versions={list} close={at({ id: "" })} ctx={ctx} name={term.data.term_name} />
    ) : null;
  return (
    <>
      <Form action={BASE} scroll={false} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        <input type="hidden" name="tab" value="terms" />
        <label htmlFor="term" className="text-[12.5px] font-semibold text-navy-950 dark:text-slate-100">
          Payment term
        </label>
        <input id="term" name="term" defaultValue={code} placeholder="NET30" className="h-9 w-48 rounded-lg border border-slate-200 bg-white px-3 font-mono text-[12.5px] uppercase dark:border-slate-700 dark:bg-slate-900" />
        <button type="submit" className="h-9 rounded-lg border border-slate-200 px-3 text-[12.5px] font-medium hover:bg-slate-50 dark:border-slate-700">
          Open
        </button>
        {term?.data && (
          <span className="text-[12px] text-slate-500">
            {term.data.term_name} · created {day(term.data.created_at)} by {who(term.data.created_by)}
          </span>
        )}
      </Form>
      {!code ? (
        <p className="px-5 py-14 text-center text-[13px] text-slate-500">Open a payment term by its code, or create one with New payment term.</p>
      ) : error ? (
        <Unavailable what={`Payment term ${code}`} error={error} />
      ) : (
        <RegisterBody drawer={drawer}>
          <RegisterTable
            columns={[{ label: "Version" }, { label: "Formula" }, { label: "Status" }, { label: "Authored" }, { label: "Approved" }]}
            empty={`${code} has no version yet. Add one with New version.`}
            rows={list.map((v) => {
              const open = at({ id: String(v.version) });
              return {
                key: v.term_version_id,
                href: open,
                selected: String(v.version) === selected,
                cells: [
                  <RowLink key="id" href={open}>{`v${v.version}`}</RowLink>,
                  <TwoLine key="f" primary={v.formula_text} secondary={shortHash(v.content_digest)} />,
                  <StatusChip key="s" status={v.status} />,
                  <span key="c" className="whitespace-nowrap">
                    {day(v.created_at)} · {who(v.created_by)}
                  </span>,
                  <span key="a" className="whitespace-nowrap">
                    {v.approved_at ? `${day(v.approved_at)} · ${who(v.approved_by)}` : "—"}
                  </span>,
                ],
              };
            })}
          />
        </RegisterBody>
      )}
    </>
  );
}

export function TermsActions({ jurisdictions, code }: { jurisdictions: J.Jurisdiction[]; code?: string }) {
  return (
    <>
      {code && (
        <>
          <Cmd command="term.due" label="Calculate due date" icon={<Timer className="h-4 w-4" />} title={`Due date under ${code}`} hidden={{ id: code }} description="ExplainDueDate: the version and calendar in force, and every step from the basis date to the due date.">
            <FieldGrid>
              <Field name="invoice_date" label="Invoice date" type="date" />
              <Field name="receipt_date" label="Receipt date" type="date" optional />
              <Field name="delivery_date" label="Delivery date" type="date" optional />
            </FieldGrid>
          </Cmd>
          <Cmd command="term.version" label="New version" title={`New version of ${code}`} hidden={{ id: code }} description="A DRAFT formula; a second person approves it.">
            <FieldGrid>
              <SelectField name="basis_date_rule" label="Basis date" options={J.BASIS_DATE_RULES.map((b) => [b, b.replaceAll("_", " ").toLowerCase()] as const)} />
              <SelectField name="due_method" label="Due method" options={J.DUE_METHODS.map((b) => [b, b.replaceAll("_", " ").toLowerCase()] as const)} />
              <Field name="due_days" label="Due days" type="number" optional />
              <Field name="due_day_of_month" label="Day of month" type="number" optional />
              <SelectField name="business_day_convention" label="Business-day convention" options={J.BUSINESS_DAY_CONVENTIONS.map((b) => [b, b.replaceAll("_", " ").toLowerCase()] as const)} />
              <Field name="calendar_code" label="Calendar" optional placeholder="GB-ENG" />
              <Field name="grace_days" label="Grace days" type="number" optional />
              <Field name="effective_from" label="Effective from" type="date" />
              <TextArea name="rationale" label="Rationale" className="sm:col-span-2" />
              <Field name="source_ref" label="Source reference" optional className="sm:col-span-2" />
            </FieldGrid>
          </Cmd>
        </>
      )}
      <Cmd command="term.create" label="New payment term" icon={<Plus className="h-4 w-4" />} title="Create a payment term">
        <FieldGrid>
          <Field name="term_code" label="Code" placeholder="NET30" />
          <Field name="term_name" label="Name" placeholder="Net 30 days" />
          <SelectField name="jurisdiction_id" label="Jurisdiction" optional defaultValue="" className="sm:col-span-2" options={[["", "Not tied to a jurisdiction"], ...jurisdictions.filter((j) => j.active_flag).map((j) => [j.jurisdiction_id, J.describeJurisdiction(j)] as const)]} />
        </FieldGrid>
      </Cmd>
    </>
  );
}

function TermDrawer({
  code,
  version,
  versions,
  close,
  ctx,
  name,
}: {
  code: string;
  version: number;
  versions: J.PaymentTermVersion[];
  close: string;
  ctx: Ctx;
  name: string;
}) {
  const v = versions.find((x) => x.version === version);
  if (!v) return null;
  const author = v.created_by === ctx.me;
  const active = versions.find((x) => x.status === "ACTIVE" && x.version !== version);
  return (
    <DetailDrawer
      heading="Payment term version"
      closeHref={close}
      icon={ReceiptText}
      title={`${code} v${v.version}`}
      subtitle={name}
      status={{ label: v.status.toLowerCase(), tone: v.status === "ACTIVE" ? "success" : v.status === "DRAFT" ? "warning" : "neutral" }}
      actions={
        <>
          {v.status === "DRAFT" && !author && <Cmd command="term.decide" label="Approve" tone="accent" title={`Approve ${code} v${v.version}`} hidden={{ id: code, version: v.version, step: "approve" }} description="The version becomes ACTIVE from its effective date." />}
          {v.status === "DRAFT" && active && !author && (
            <Cmd command="term.decide" label={`Supersede v${active.version}`} title={`v${v.version} supersedes v${active.version}`} hidden={{ id: code, version: v.version, step: "supersede", supersedes_version: active.version }} />
          )}
          {v.status === "ACTIVE" && (
            <Cmd command="term.decide" label="Retire" tone="danger" title={`Retire ${code} v${v.version}`} hidden={{ id: code, version: v.version, step: "retire" }}>
              <FieldGrid>
                <TextArea name="reason" label="Reason" className="sm:col-span-2" />
                <Field name="ends_on" label="Ends on" type="date" optional />
              </FieldGrid>
            </Cmd>
          )}
        </>
      }
    >
      <DrawerFacts
        items={[
          { label: "Formula", value: v.formula_text },
          { label: "Content digest", value: shortHash(v.content_digest) },
          { label: "Authored", value: `${day(v.created_at)} by ${who(v.created_by)}` },
          { label: "Approved", value: v.approved_at ? `${day(v.approved_at)} by ${who(v.approved_by)}` : "Not yet" },
          { label: "Ends on", value: v.ends_on ?? "—" },
          { label: "Retirement", value: v.retire_reason ?? "—" },
        ]}
      />
      {author && v.status === "DRAFT" && <DrawerNote>You authored this version, so a second person approves it.</DrawerNote>}
    </DetailDrawer>
  );
}
