import { ArrowUpRight, Inbox } from "lucide-react";
import { ButtonLink, DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { KIND_LABEL, type ApprovalItem, type ApprovalKind } from "@/lib/authz-inbox";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AuthzData } from "./data";
import { Chip, Command, PersonCell, href, short, who, type RegisterSpec } from "./register";

/** The register an approval's record lives in, when its ID opens a row there. */
const HOME: Partial<Record<ApprovalKind, string>> = {
  grant: "grants",
  jit: "elevated",
  break_glass: "elevated",
  sod_rule: "sod",
  abac_rule: "conditions",
  limit: "limits",
};

const DECIDER = {
  you: { label: "Awaiting you", tone: "warning" },
  other: { label: "Someone else decides", tone: "neutral" },
} as const;

export function approvalsRegister(data: AuthzData): RegisterSpec {
  const items = data.approvals;
  const byKey = new Map(items.map((i) => [i.key, i]));

  return {
    noun: "requests",
    what: "pending approvals",
    idColumn: "Request",
    columns: [{ label: "What is asked" }, { label: "Type" }, { label: "Requested by" }, { label: "Requested" }, { label: "Lapses" }, { label: "Decision" }],
    searchPlaceholder: "Search request, person or ID",
    empty: "Nothing is waiting for a second person.",
    filters: [
      { name: "kind", allLabel: "All types", options: Object.entries(KIND_LABEL) as [string, string][] },
      {
        name: "whose",
        allLabel: "Anyone's",
        options: [
          ["you", "Yours to decide"],
          ["other", "Someone else decides"],
        ],
      },
    ],
    rows: items.map((i) => ({
      id: i.key,
      idLabel: short(i.id),
      search: [i.id, i.title, i.detail, who(i.requestedBy), who(i.subject), KIND_LABEL[i.kind]].join(" "),
      facets: { kind: i.kind, whose: i.notYours ? "other" : "you" },
      cells: [
        <TwoLine key="t" primary={i.title} secondary={i.detail || undefined} />,
        <span key="k" className="whitespace-nowrap">{KIND_LABEL[i.kind]}</span>,
        <PersonCell key="b" id={i.requestedBy} />,
        <span key="a" className="whitespace-nowrap tabular-nums">{i.requestedAt ? formatDate(i.requestedAt) : "—"}</span>,
        <span key="e" className="whitespace-nowrap tabular-nums">{i.expiresAt ? formatDate(i.expiresAt) : "—"}</span>,
        <Chip key="d" {...DECIDER[i.notYours ? "other" : "you"]} />,
      ],
    })),
    drawer: (key, links) => {
      const i = byKey.get(key);
      if (!i) return null;
      return (
        <DetailDrawer
          heading="Request details"
          closeHref={links.close}
          icon={Inbox}
          title={i.title}
          subtitle={`${KIND_LABEL[i.kind]} · ${short(i.id)}`}
          status={{ label: "Awaiting approval", tone: "warning" }}
          actions={approvalActions(i)}
        >
          <DrawerFacts
            items={[
              { label: "Type", value: KIND_LABEL[i.kind] },
              { label: "Requested by", value: who(i.requestedBy) },
              { label: "About", value: i.subject ? who(i.subject) : "—" },
              { label: "Requested", value: i.requestedAt ? formatDateTime(i.requestedAt) : "—" },
              { label: "Lapses", value: i.expiresAt ? formatDateTime(i.expiresAt) : "—" },
              { label: "Details", value: i.detail || "—" },
              { label: "Approver's two-step", value: i.stepUp ? "Required, last 15 minutes" : "Not required" },
            ]}
          />
          {i.notYours && <DrawerNote>You asked for this, or it is about you, so someone independent decides it.</DrawerNote>}
        </DetailDrawer>
      );
    },
  };
}

/** Approve and reject, for anyone who is neither the maker nor the subject. */
function approvalActions(i: ApprovalItem) {
  const home = HOME[i.kind];
  const open = home ? <ButtonLink href={href({ tab: home, id: i.id })} icon={ArrowUpRight}>Open record</ButtonLink> : null;
  if (i.notYours) return open;
  const footnote = i.stepUp ? "Approving needs your own two-step sign-in from the last 15 minutes; you will be asked for a code if it is older." : undefined;
  return (
    <>
      <Command command={i.reject} id={i.id} label="Reject" title="Reject this request" reasons="reject" version={i.version} tone="danger" />
      <Command
        command={i.approve}
        id={i.id}
        label="Approve"
        title="Approve this request"
        description={i.title}
        reasons="approve"
        version={i.version}
        tone="accent"
        footnote={footnote}
      />
    </>
  );
}
