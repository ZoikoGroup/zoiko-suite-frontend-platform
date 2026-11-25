import { ScrollText, Users } from "lucide-react";
import { ButtonLink, DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { explainDecisionBasis, listAccessDecisions, type AccessDecision } from "@/lib/api/authorization";
import { humanizeKey } from "@/lib/humanize";
import { formatDateTime } from "@/lib/format";
import { DECISION_WINDOW, type AuthzData, type Read } from "./data";
import { Chip, Mono, PersonCell, href, short, who, type Ctx, type Query, type RegisterSpec } from "./register";

type Tone = "success" | "warning" | "danger" | "neutral" | "info";

/** The answer in words. Anything unrecognised is shown as itself, never as allowed. */
export function answer(d: AccessDecision): { label: string; tone: Tone } {
  switch (d.decision ?? d.decision_outcome) {
    case "PERMIT":
    case "GRANTED":
      return { label: "Allowed", tone: "success" };
    case "DENY":
    case "DENIED":
      return { label: "Not allowed", tone: "danger" };
    case "STEP_UP":
      return { label: "Needs two-step", tone: "warning" };
    case "REQUIRE_APPROVAL":
      return { label: "Needs approval", tone: "warning" };
    default:
      return { label: d.decision ?? d.decision_outcome, tone: "neutral" };
  }
}

/** The part of an action before its first dot: "payment" in payment.approve. */
export function area(action: string): string {
  return action.split(".")[0] || action;
}

function why(d: AccessDecision): string {
  return d.decision_basis === "redacted" ? "Hidden (needs iam.policy.read)" : explainDecisionBasis(d.decision_basis).label;
}

/**
 * The decision log. A filter on the answer goes to the service, so "Not
 * allowed" finds refusals beyond the newest page; the rest filters the
 * newest DECISION_WINDOW decisions.
 */
export async function decisionsRegister(data: AuthzData, ctx: Ctx, query: Query): Promise<RegisterSpec> {
  const outcome = query.outcome === "GRANTED" || query.outcome === "DENIED" ? query.outcome : undefined;
  let log: Read<AccessDecision> & { more: boolean } = data.decisions;
  if (outcome) {
    const r = await listAccessDecisions(ctx.identity, { outcome, limit: DECISION_WINDOW });
    log = r.ok ? { rows: r.data.decisions ?? [], error: null, more: !!r.data.next_cursor } : { rows: [], error: r.error, more: false };
  }
  const rows = log.rows;
  const byId = new Map(rows.map((d) => [d.access_decision_id, d]));
  const areas = [...new Set(data.decisions.rows.map((d) => area(d.action_type)))].sort();

  return {
    noun: "decisions",
    what: "the decision log",
    idColumn: "Decision",
    columns: [{ label: "Person" }, { label: "Action" }, { label: "Answer" }, { label: "Why" }, { label: "Legal entity" }, { label: "When" }],
    searchPlaceholder: "Search person, action or decision ID",
    empty: "No permission checks have been recorded yet.",
    error: log.error,
    note: log.more ? `newest ${DECISION_WINDOW}` : undefined,
    filters: [
      {
        name: "outcome",
        allLabel: "Any answer",
        options: [
          ["GRANTED", "Allowed"],
          ["DENIED", "Not allowed"],
        ],
      },
      { name: "area", allLabel: "All areas", options: areas.map((a) => [a, humanizeKey(a)] as const) },
    ],
    rows: rows.map((d) => ({
      id: d.access_decision_id,
      idLabel: short(d.access_decision_id),
      search: [d.access_decision_id, d.principal_id, who(d.principal_id), d.action_type, d.legal_entity_id, d.resource_id].join(" "),
      facets: { outcome: d.decision_outcome, area: area(d.action_type) },
      cells: [
        <PersonCell key="p" id={d.principal_id} />,
        <Mono key="a">{d.action_type}</Mono>,
        <Chip key="o" {...answer(d)} />,
        <span key="w" className="block max-w-56 truncate" title={d.decision_basis}>{why(d)}</span>,
        d.legal_entity_id ? <span key="e" title={d.legal_entity_id}><Mono>{short(d.legal_entity_id)}</Mono></span> : "—",
        <span key="t" className="whitespace-nowrap tabular-nums">{formatDateTime(d.decided_at)}</span>,
      ],
    })),
    drawer: (id, links) => {
      const d = byId.get(id);
      if (!d) return null;
      const redacted = d.decision_basis === "redacted";
      const basis = explainDecisionBasis(d.decision_basis);
      const pane = links.pane === "context" ? "context" : "overview";
      return (
        <DetailDrawer
          heading="Decision details"
          closeHref={links.close}
          icon={ScrollText}
          title={<span className="font-mono text-[13px]">{d.action_type}</span>}
          subtitle={`${who(d.principal_id)} · ${formatDateTime(d.decided_at)}`}
          status={answer(d)}
          panes={[
            { key: "overview", label: "Overview", href: links.paneHref("overview") },
            { key: "context", label: "Context", href: links.paneHref("context") },
          ]}
          activePane={pane}
          actions={
            <ButtonLink href={href({ tab: "decisions", q: d.principal_id })} icon={Users}>
              All decisions for {who(d.principal_id)}
            </ButtonLink>
          }
        >
          {pane === "overview" ? (
            <>
              <DrawerFacts
                items={[
                  { label: "Answer", value: `${answer(d).label} (${d.decision ?? d.decision_outcome})` },
                  { label: "Why", value: redacted ? "Hidden (needs iam.policy.read)" : basis.label },
                  { label: "Person", value: who(d.principal_id) },
                  { label: "Action", value: <Mono>{d.action_type}</Mono> },
                  { label: "Legal entity", value: d.legal_entity_id ? <Mono>{d.legal_entity_id}</Mono> : "—" },
                  { label: "Resource", value: d.resource_type ? `${d.resource_type} ${d.resource_id ?? ""}`.trim() : "—" },
                  { label: "Decided", value: formatDateTime(d.decided_at) },
                  { label: "Decision ID", value: <Mono>{d.access_decision_id}</Mono> },
                ]}
              />
              {!redacted && (
                <DrawerNote>
                  {basis.meaning}
                  {basis.nextStep && <span className="mt-1 block text-slate-500 dark:text-slate-400">{basis.nextStep}</span>}
                </DrawerNote>
              )}
            </>
          ) : (
            <DrawerFacts
              items={[
                { label: "Basis as stored", value: <Mono>{d.decision_basis}</Mono> },
                { label: "Matched grants", value: d.matched_grants?.length ? <Mono>{d.matched_grants.join(", ")}</Mono> : "—" },
                { label: "On behalf of", value: d.on_behalf_of ? who(d.on_behalf_of) : "—" },
                { label: "Session", value: d.session_kind ? `${humanizeKey(d.session_kind.toLowerCase())} ${short(d.session_id)}` : "—" },
                { label: "Sign-in assurance", value: d.session_assurance || "—" },
                { label: "Conditions attached", value: d.obligations?.length ? d.obligations.join(", ") : "—" },
                { label: "Reason codes", value: d.reason_codes?.length ? d.reason_codes.join(", ") : "—" },
                { label: "Policy version", value: d.policy_set_version || "—" },
                { label: "Correlation ID", value: <Mono>{d.correlation_id}</Mono> },
              ]}
            />
          )}
        </DetailDrawer>
      );
    },
  };
}
