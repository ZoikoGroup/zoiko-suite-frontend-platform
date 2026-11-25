// Status colours of the Governance Log. They are STATUS colours (approved,
// pending, escalated, denied), not a categorical palette, so they appear only
// where the mark means that status — and never alone: every chart pairs them
// with a label and a count, and the trend lines also differ by dash pattern,
// because approved/pending sit close together for protan vision (validated
// with the dataviz validator: adjacent ΔE 6.5, floor band → secondary
// encoding required). Denied is grey on purpose: a refusal is neutral, not an
// alarm. Light and dark steps are chosen separately.

export type StatusKey = "approved" | "pending" | "escalated" | "denied";

export const STATUS_ORDER: StatusKey[] = ["approved", "pending", "escalated", "denied"];

export const STATUS_LABEL: Record<StatusKey, string> = {
  approved: "Approved",
  pending: "Pending",
  escalated: "Escalated",
  denied: "Denied",
};

/** CSS custom properties, light then dark, set once on a wrapper. */
export const STATUS_VARS =
  "[--gd-approved:#15803d] [--gd-pending:#d97706] [--gd-escalated:#e11d48] [--gd-denied:#64748b] " +
  "dark:[--gd-approved:#22a35a] dark:[--gd-pending:#d98a0b] dark:[--gd-escalated:#f0506e] dark:[--gd-denied:#94a3b8]";

export const STATUS_COLOR: Record<StatusKey, string> = {
  approved: "var(--gd-approved)",
  pending: "var(--gd-pending)",
  escalated: "var(--gd-escalated)",
  denied: "var(--gd-denied)",
};

/** Line dash per status: the secondary encoding for colour-blind readers. */
export const STATUS_DASH: Record<StatusKey, string | undefined> = {
  approved: undefined,
  pending: "6 4",
  escalated: undefined,
  denied: "2 4",
};
