// The Requirements register: the catalogue of effective-dated preconditions,
// retired ones included (an auditor reading a past decision needs them).

import { ClipboardList } from "lucide-react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { Chip, Mono, short, who, type RegisterSpec } from "@/components/admin/authorization/console/register";
import {
  actionLabel,
  describeEvidenceType,
  describeRequirement,
  describeRequirementScope,
  describeRequirementStatus,
  domainLabel,
  readSpec,
} from "@/lib/api/evidence";
import { formatDateTime } from "@/lib/format";
import type { EvidenceData } from "./data";
import { EvidenceReadProblem } from "./problem";
import { RetireRequirementDialog } from "./forms";
import { BASE, type EvidenceCtx } from "./shared";

function stateOf(status: ReturnType<typeof describeRequirementStatus>): string {
  if (status.inForce) return "in_force";
  return status.label === "Not started yet" ? "future" : "retired";
}

export function requirementsRegister(data: EvidenceData, ctx: EvidenceCtx): RegisterSpec {
  const rows = data.requirements.rows;
  const byId = new Map(rows.map((r) => [r.evidence_requirement_id, r]));
  const domains = [...new Set(rows.map((r) => r.domain_code))].sort();
  const types = [...new Set(rows.map((r) => r.evidence_type))].sort();

  return {
    base: BASE,
    problem: (error) => <EvidenceReadProblem error={error} what="the requirement catalogue" />,
    noun: "requirements",
    what: "the requirement catalogue",
    idColumn: "Requirement",
    columns: [{ label: "Action" }, { label: "Requires" }, { label: "Applies to" }, { label: "From" }, { label: "State" }],
    searchPlaceholder: "Search action, area or evidence",
    empty: "No requirement has been added. Until one is, every action checked is answered “not being checked”.",
    error: data.requirements.error,
    note: data.requirements.more ? "The catalogue is longer than this console reads at once." : undefined,
    filters: [
      { name: "state", allLabel: "Any state", options: [["in_force", "In force"], ["future", "Not started"], ["retired", "Withdrawn"]] },
      { name: "domain", allLabel: "All areas", options: domains.map((d) => [d, domainLabel(d)] as const) },
      { name: "type", allLabel: "All evidence", options: types.map((t) => [t, describeEvidenceType(t).label] as const) },
    ],
    rows: rows.map((r) => {
      const status = describeRequirementStatus(r, ctx.now);
      return {
        id: r.evidence_requirement_id,
        idLabel: short(r.evidence_requirement_id),
        search: [r.evidence_requirement_id, r.domain_code, r.action_type, r.evidence_type, actionLabel(r.action_type), domainLabel(r.domain_code)].join(" "),
        facets: { state: stateOf(status), domain: r.domain_code, type: r.evidence_type },
        cells: [
          <span key="a" className="block min-w-0">
            <span className="block truncate font-medium text-navy-950 dark:text-slate-100">{actionLabel(r.action_type)}</span>
            <span className="block truncate text-[11.5px] text-slate-500">{domainLabel(r.domain_code)}</span>
          </span>,
          describeRequirement(r),
          describeRequirementScope(r).label,
          <span key="f" className="whitespace-nowrap tabular-nums">{formatDateTime(r.effective_from)}</span>,
          <Chip key="s" label={status.label} tone={status.tone} />,
        ],
      };
    }),
    drawer: (id, links) => {
      const r = byId.get(id);
      if (!r) return null;
      const status = describeRequirementStatus(r, ctx.now);
      const spec = readSpec(r.requirement_payload);
      const type = describeEvidenceType(r.evidence_type);
      return (
        <DetailDrawer
          heading="Requirement"
          closeHref={links.close}
          icon={ClipboardList}
          title={describeRequirement(r)}
          subtitle={`${domainLabel(r.domain_code)} · ${actionLabel(r.action_type)}`}
          status={{ label: status.label, tone: status.tone }}
          actions={
            status.inForce || status.label === "Not started yet" ? (
              <RetireRequirementDialog id={r.evidence_requirement_id} version={r.record_version} />
            ) : null
          }
        >
          <DrawerFacts
            items={[
              { label: "Action", value: <Mono>{`${r.domain_code} · ${r.action_type}`}</Mono> },
              { label: "Evidence", value: `${type.label} (${r.evidence_type})` },
              { label: "Checked by", value: type.verifiedBy ?? "Taken on the caller's word" },
              { label: "Minimum", value: String(spec.minimum_count && spec.minimum_count > 0 ? spec.minimum_count : 1) },
              { label: "Subtype", value: spec.artifact_subtype ?? "—" },
              { label: "Applies to", value: r.legal_entity_id ? <Mono>{r.legal_entity_id}</Mono> : "Every company in the business" },
              { label: "From", value: formatDateTime(r.effective_from) },
              { label: "Until", value: r.effective_to ? formatDateTime(r.effective_to) : "Open-ended" },
              { label: "Added by", value: who(r.created_by_principal_id) },
              { label: "Version", value: `v${r.record_version}` },
              { label: "Reference", value: <Mono>{r.evidence_requirement_id}</Mono> },
            ]}
          />
          {spec.description && <DrawerNote>{spec.description}</DrawerNote>}
          <DrawerNote>{status.meaning}</DrawerNote>
        </DetailDrawer>
      );
    },
  };
}
