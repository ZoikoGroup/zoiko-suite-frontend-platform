// The Evaluations register (and, filtered to MISSING, the Missing tab): every
// determination the gate recorded, newest first, each with what was asserted,
// what fell short and the requirement set it was tested against — frozen at
// decision time, so it stays true after the catalogue changes.

import Link from "next/link";
import { ScrollText } from "lucide-react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import {
  actionLabel,
  describeEvidenceType,
  domainLabel,
  explainEvidenceOutcome,
  explainUnmetReason,
  readPresentArtifacts,
  readUnmet,
  type EvidenceEvaluation,
} from "@/lib/api/evidence";
import { formatDateTime } from "@/lib/format";
import type { EvidenceData } from "./data";
import { EvidenceReadProblem } from "./problem";
import { BASE, href } from "./shared";

export function evaluationsRegister(data: EvidenceData, opts: { missingOnly?: boolean } = {}): RegisterSpec {
  const all = data.evaluations.rows;
  const rows: EvidenceEvaluation[] = opts.missingOnly ? all.filter((e) => e.outcome === "MISSING") : all;
  const byId = new Map(rows.map((e) => [e.evaluation_id, e]));
  const domains = [...new Set(rows.map((e) => e.domain_code))].sort();

  return {
    base: BASE,
    problem: (error) => <EvidenceReadProblem error={error} what="the evaluation ledger" />,
    noun: opts.missingOnly ? "blocked checks" : "evaluations",
    what: "the evaluation ledger",
    idColumn: "Evaluation",
    columns: [{ label: "Action" }, { label: "Outcome" }, { label: "Short of" }, { label: "For" }, { label: "Recorded" }],
    searchPlaceholder: "Search action, area or reference",
    empty: opts.missingOnly
      ? "No check has been blocked for missing evidence."
      : "No evidence check has been recorded yet. Run one with “Check evidence”.",
    error: data.evaluations.error,
    note: data.evaluations.more ? "Showing the latest 1,000 evaluations." : undefined,
    filters: [
      ...(opts.missingOnly
        ? []
        : [
            {
              name: "outcome",
              allLabel: "Any outcome",
              options: [
                ["SATISFIED", "Can go ahead"],
                ["MISSING", "Must be blocked"],
                ["NO_REQUIREMENTS_DEFINED", "Not being checked"],
              ] as const,
            },
          ]),
      { name: "domain", allLabel: "All areas", options: domains.map((d) => [d, domainLabel(d)] as const) },
    ],
    rows: rows.map((e) => {
      const unmet = readUnmet(e.unmet_payload);
      const outcome = explainEvidenceOutcome(e.outcome, unmet.length);
      return {
        id: e.evaluation_id,
        idLabel: short(e.evaluation_id),
        search: [e.evaluation_id, e.domain_code, e.action_type, actionLabel(e.action_type), domainLabel(e.domain_code), e.correlation_id].join(" "),
        facets: { outcome: e.outcome, domain: e.domain_code },
        cells: [
          <span key="a" className="block min-w-0">
            <span className="block truncate font-medium text-navy-950 dark:text-slate-100">{actionLabel(e.action_type)}</span>
            <span className="block truncate text-[11.5px] text-slate-500">{domainLabel(e.domain_code)}</span>
          </span>,
          <Chip key="o" label={outcome.shortLabel} tone={outcome.tone} />,
          unmet.length ? `${unmet.length} requirement${unmet.length === 1 ? "" : "s"}` : <span key="u" className="text-slate-400">—</span>,
          who(e.evaluated_for_principal_id),
          <span key="t" className="whitespace-nowrap tabular-nums">{formatDateTime(e.evaluated_at)}</span>,
        ],
      };
    }),
    drawer: (id, links) => {
      const e = byId.get(id);
      if (!e) return null;
      const unmet = readUnmet(e.unmet_payload);
      const artifacts = readPresentArtifacts(e.present_artifacts_payload);
      const outcome = explainEvidenceOutcome(e.outcome, unmet.length);
      const pane = links.pane || "decision";
      return (
        <DetailDrawer
          heading="Evaluation"
          closeHref={links.close}
          icon={ScrollText}
          title={outcome.headline}
          subtitle={`${domainLabel(e.domain_code)} · ${actionLabel(e.action_type)}`}
          status={{ label: outcome.shortLabel, tone: outcome.tone }}
          panes={[
            { key: "decision", label: "Decision", href: links.paneHref("decision") },
            { key: "unmet", label: `Short of (${unmet.length})`, href: links.paneHref("unmet") },
            { key: "asserted", label: `Asserted (${artifacts.length})`, href: links.paneHref("asserted") },
            { key: "tested", label: `Tested against (${e.requirement_ids?.length ?? 0})`, href: links.paneHref("tested") },
          ]}
          activePane={pane}
        >
          {pane === "decision" && (
            <>
              <DrawerFacts
                items={[
                  { label: "Outcome", value: <Mono>{e.outcome}</Mono> },
                  { label: "Action", value: <Mono>{`${e.domain_code} · ${e.action_type}`}</Mono> },
                  { label: "Legal entity", value: <Mono>{e.legal_entity_id}</Mono> },
                  { label: "For", value: who(e.evaluated_for_principal_id) },
                  { label: "Recorded", value: formatDateTime(e.evaluated_at) },
                  { label: "Correlation", value: <Mono>{e.correlation_id}</Mono> },
                  { label: "Reference", value: <Mono>{e.evaluation_id}</Mono> },
                ]}
              />
              <DrawerNote>{outcome.meaning}</DrawerNote>
            </>
          )}
          {pane === "unmet" &&
            (unmet.length === 0 ? (
              <DrawerNote>Nothing fell short.</DrawerNote>
            ) : (
              <ul className="space-y-2">
                {unmet.map((u) => {
                  const x = explainUnmetReason(u.reason, u.evidence_type);
                  return (
                    <li key={u.evidence_requirement_id + u.reason} className="rounded-lg border border-slate-200 p-3 text-[12.5px] dark:border-slate-700">
                      <p className="font-medium text-navy-950 dark:text-slate-100">{x.headline}</p>
                      {x.rejected && <p className="mt-1 text-slate-600 dark:text-slate-300">{x.rejected}</p>}
                      {x.description && <p className="mt-1 text-slate-500">{x.description}</p>}
                      <p className="mt-1 font-mono text-[11px] text-slate-400" title={x.raw}>
                        {describeEvidenceType(u.evidence_type).raw} · {short(u.evidence_requirement_id)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ))}
          {pane === "asserted" &&
            (artifacts.length === 0 ? (
              <DrawerNote>The caller asserted no evidence.</DrawerNote>
            ) : (
              <DrawerFacts
                items={artifacts.map((a, i) => ({
                  label: `${i + 1}. ${describeEvidenceType(a.evidence_type).label}`,
                  value: (
                    <span>
                      <Mono>{a.reference_id || "(empty)"}</Mono>
                      <span className="ml-2 text-[11px] text-slate-500">
                        {describeEvidenceType(a.evidence_type).verifiedBy ?? "caller's word"}
                      </span>
                    </span>
                  ),
                }))}
              />
            ))}
          {pane === "tested" &&
            ((e.requirement_ids?.length ?? 0) === 0 ? (
              <DrawerNote>No requirement was in force for this action when it was checked.</DrawerNote>
            ) : (
              <ul className="space-y-1.5 text-[12.5px]">
                {(e.requirement_ids ?? []).map((rid) => (
                  <li key={rid}>
                    <Link href={href({ tab: "requirements", id: rid })} className="font-mono text-navy-700 hover:underline dark:text-navy-300">
                      {rid}
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
        </DetailDrawer>
      );
    },
  };
}
