// Display formatting for backend values.
//
// Server and client both import this, so it must stay free of Node- and
// DOM-specific APIs. Intl is available in both.

const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Money, with the currency the backend actually stored. Amounts in different
 *  currencies are never combined — no service in the suite holds an FX rate. */
export function formatMoney(
  amount: number,
  currency: string,
  options: { maximumFractionDigits?: number } = {},
): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: options.maximumFractionDigits ?? 2,
    }).format(amount);
  } catch {
    // Intl throws RangeError on a currency code it does not recognise, and
    // several services accept any string in that column. A stored typo should
    // render as a number, not blank the whole panel.
    return `${amount.toLocaleString("en-GB")} ${currency}`;
  }
}

/**
 * A calendar date or a timestamp, rendered as a date.
 *
 * Values from a Postgres DATE column arrive as "YYYY-MM-DD" and are formatted in
 * UTC deliberately. Parsing one yields UTC midnight, so formatting it in a
 * timezone behind UTC would show the previous day — a contract effective from
 * the 1st would read as starting on the 31st.
 */
export function formatDate(value: string): string {
  const isCalendarDate = CALENDAR_DATE_RE.test(value);
  const date = new Date(isCalendarDate ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(isCalendarDate ? { timeZone: "UTC" } : {}),
  }).format(date);
}

/** A timestamp, to the minute. Used where the time of an action matters — when
 *  a contract was signed, when a version was appended. */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Shorten an opaque backend identifier for display.
 *
 * Contract ids are "ctr-" plus a UUID and principal ids are bare UUIDs; neither
 * fits a table cell. The full value stays available as a title attribute at the
 * call site rather than being thrown away here.
 */
export function shortId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}
