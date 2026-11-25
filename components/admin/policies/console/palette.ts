// Status colours of the Policies & Controls page. They are STATUS colours,
// not a categorical palette: green means effective / active / completed,
// amber partial / under review / in progress, red ineffective / suspended /
// overdue, blue draft, grey not tested / retired. They never stand alone —
// every chart pairs them with a label and a count, and the review lines also
// differ by dash. Light and dark steps are set separately on one wrapper.

export const PC_VARS =
  "[--pc-green:#16a34a] [--pc-amber:#f59e0b] [--pc-red:#ef4444] [--pc-blue:#3b82f6] [--pc-grey:#94a3b8] [--pc-navy:#2563eb] " +
  "dark:[--pc-green:#22c55e] dark:[--pc-amber:#fbbf24] dark:[--pc-red:#f87171] dark:[--pc-blue:#60a5fa] dark:[--pc-grey:#64748b] dark:[--pc-navy:#60a5fa]";

export const C = {
  green: "var(--pc-green)",
  amber: "var(--pc-amber)",
  red: "var(--pc-red)",
  blue: "var(--pc-blue)",
  grey: "var(--pc-grey)",
  navy: "var(--pc-navy)",
} as const;

/** The Control Reviews lines: colour plus dash, for colour-blind readers. */
export const REVIEW_SERIES = [
  { key: "completed", label: "Completed", color: C.green, dash: undefined },
  { key: "inProgress", label: "In Progress", color: C.amber, dash: "6 4" },
  { key: "overdue", label: "Overdue", color: C.red, dash: "2 4" },
] as const;
