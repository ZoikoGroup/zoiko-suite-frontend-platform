export type Kpi = {
  label: string;
  value: string;
  delta: string;
  direction: "up" | "down" | "flat";
  tone: "positive" | "negative" | "neutral";
  helper: string;
};

export const KPIS: Kpi[] = [
  {
    label: "Active Legal Entities",
    value: "12",
    delta: "+2",
    direction: "up",
    tone: "positive",
    helper: "vs. last quarter",
  },
  {
    label: "Open Governance Exceptions",
    value: "3",
    delta: "-4",
    direction: "down",
    tone: "positive",
    helper: "vs. last week",
  },
  {
    label: "Pending Approvals",
    value: "18",
    delta: "+5",
    direction: "up",
    tone: "neutral",
    helper: "since this morning",
  },
  {
    label: "Compliance Score",
    value: "96.4%",
    delta: "+0.8 pts",
    direction: "up",
    tone: "positive",
    helper: "across all jurisdictions",
  },
];

export const GOVERNED_ACTIONS_TREND = [
  { day: "Jul 10", authorized: 412, escalated: 24 },
  { day: "Jul 11", authorized: 438, escalated: 19 },
  { day: "Jul 12", authorized: 401, escalated: 31 },
  { day: "Jul 13", authorized: 389, escalated: 22 },
  { day: "Jul 14", authorized: 456, escalated: 17 },
  { day: "Jul 15", authorized: 470, escalated: 21 },
  { day: "Jul 16", authorized: 448, escalated: 26 },
  { day: "Jul 17", authorized: 492, escalated: 15 },
  { day: "Jul 18", authorized: 511, escalated: 18 },
  { day: "Jul 19", authorized: 486, escalated: 23 },
  { day: "Jul 20", authorized: 468, escalated: 20 },
  { day: "Jul 21", authorized: 503, escalated: 14 },
  { day: "Jul 22", authorized: 527, escalated: 16 },
  { day: "Jul 23", authorized: 318, escalated: 9 },
];

export const APPROVAL_OUTCOMES = [
  { name: "Authorized", value: 82, color: "var(--color-navy-600)" },
  { name: "Escalated", value: 12, color: "var(--color-gold-400)" },
  { name: "Denied", value: 6, color: "#c2483d" },
];

export type DecisionOutcome = "authorized" | "escalated" | "denied";

export type DecisionLogEntry = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  outcome: DecisionOutcome;
  note?: string;
  timeAgo: string;
};

export const DECISION_LOG: DecisionLogEntry[] = [
  {
    id: "evt-8841",
    actor: "A. Fernandes",
    action: "payroll.run.release",
    entity: "Zoiko Group — Singapore Pte Ltd",
    outcome: "authorized",
    timeAgo: "2 min ago",
  },
  {
    id: "evt-8840",
    actor: "System · Tax Engine",
    action: "filing.prepared",
    entity: "Zoiko Group — UK Ltd",
    outcome: "authorized",
    timeAgo: "18 min ago",
  },
  {
    id: "evt-8837",
    actor: "R. Mehta",
    action: "contract.execute",
    entity: "Zoiko Group — India Pvt Ltd",
    outcome: "escalated",
    note: "Awaiting CFO approval — value exceeds signatory threshold",
    timeAgo: "41 min ago",
  },
  {
    id: "evt-8833",
    actor: "System · Compliance Engine",
    action: "obligation.overdue",
    entity: "Zoiko Group — UAE FZE",
    outcome: "denied",
    note: "Blocked pending evidence sufficiency check",
    timeAgo: "1 hr ago",
  },
  {
    id: "evt-8829",
    actor: "N. Whitfield",
    action: "intercompany.entry.post",
    entity: "Zoiko Group — US Inc",
    outcome: "authorized",
    timeAgo: "2 hr ago",
  },
  {
    id: "evt-8821",
    actor: "System · Payroll Tax Engine",
    action: "tax.liability.updated",
    entity: "Zoiko Group — Germany GmbH",
    outcome: "authorized",
    timeAgo: "3 hr ago",
  },
];

export type Obligation = {
  id: string;
  title: string;
  entity: string;
  dueInDays: number;
};

export const UPCOMING_OBLIGATIONS: Obligation[] = [
  {
    id: "obl-1",
    title: "VAT Return — Q2",
    entity: "Zoiko Group — UK Ltd",
    dueInDays: 3,
  },
  {
    id: "obl-2",
    title: "Corporate Tax Estimate",
    entity: "Zoiko Group — Singapore Pte Ltd",
    dueInDays: 6,
  },
  {
    id: "obl-3",
    title: "Annual Board Resolution Filing",
    entity: "Zoiko Group — US Inc",
    dueInDays: 9,
  },
  {
    id: "obl-4",
    title: "Payroll Tax Remittance",
    entity: "Zoiko Group — India Pvt Ltd",
    dueInDays: 14,
  },
];
