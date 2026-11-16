// siem-integration-svc stores every event with status "DELIVERED" and counts
// it in the exporter's events_sent, but it has no delivery code: nothing is
// sent to the exporter's endpoint. Wherever the console shows a stored event,
// its status or that count, it says this.

export const SIEM_NO_DELIVERY = "recorded by siem-integration-svc — no external delivery is configured";

/** The stored status, only ever beside what it means. */
export function siemStatusText(stored: string): string {
  return `${SIEM_NO_DELIVERY} (stored status: ${stored})`;
}
