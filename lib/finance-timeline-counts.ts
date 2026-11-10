// Count logic for the Finance process timeline, kept free of imports so
// tests/finance-timeline-counts.test.mjs can load it with node --test directly.

/** null means the count could not be read, which is not the same as zero. */
export type StepCount = { count: number; capped: boolean } | null;

/**
 * Each timeline stage and the /api/v1 list that measures what its title says.
 *
 * Every stage used to count /api/v1/journal-entries (a route that did not
 * exist) or /api/v1/cash-positions (also missing), so the invoice, payables and
 * intercompany cards would have shown the ledger's journal count under other
 * services' names even had the route resolved.
 */
export const TIMELINE_SOURCES: Record<string, { path: string; key: string }> = {
  "ar-invoice": { path: "ar-invoices", key: "invoices" },
  "gl-posting": { path: "journals?status=FINALIZED", key: "journals" },
  "bank-rec": { path: "bank-reconciliation/statement-lines?status=MATCHED", key: "statement_lines" },
  "ap-settle": { path: "ap-invoices?status=PAYMENT_REQUESTED", key: "invoices" },
  intercompany: { path: "intercompany/entries", key: "entries" },
  close: { path: "fiscal-periods", key: "fiscal_periods" },
};

/**
 * Turn one /api/v1 list response into a stage count. `page_limit` is the page
 * size the service was asked for; a full page means there may be more.
 */
export function stepCountFromResponse(body: unknown, key: string): StepCount {
  const rec = body as Record<string, unknown> | null;
  if (!rec || typeof rec !== "object" || !Array.isArray(rec[key])) return null;
  const count = (rec[key] as unknown[]).length;
  const limit = typeof rec.page_limit === "number" ? rec.page_limit : null;
  return { count, capped: limit !== null && count >= limit };
}

export function stepCountLabel(c: StepCount): string {
  if (c === null) return "unavailable";
  return `${c.count}${c.capped ? "+" : ""} items`;
}
