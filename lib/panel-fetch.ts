// Client-side read of one list from the console's /api/v1 proxy.
//
// A failed read throws with the reason the proxy reported, so a panel shows an
// error rather than an empty register: "no records" and "the service refused
// or could not be reached" must never look the same. Import-free so it can be
// unit-tested with node --test.

const PANEL_TIMEOUT_MS = 10_000;

export async function fetchPanelList<T>(path: string, key: string, service: string): Promise<T[]> {
  let res: Response;
  try {
    res = await fetch(path, { signal: AbortSignal.timeout(PANEL_TIMEOUT_MS) });
  } catch {
    throw new Error(`${service} could not be reached through the console API.`);
  }
  const body: unknown = await res.json().catch(() => null);
  return listFromResponse<T>(res.status, body, key, service);
}

/**
 * For summary tiles: the list, or null when it could not be read. A tile shows
 * null as "Unavailable", never as zero or a stand-in figure.
 */
export async function fetchPanelListOrNull<T>(path: string, key: string): Promise<T[] | null> {
  try {
    return await fetchPanelList<T>(path, key, path);
  } catch {
    return null;
  }
}

/** The list under `key`, or an Error naming why there is none. */
export function listFromResponse<T>(status: number, body: unknown, key: string, service: string): T[] {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (status < 200 || status >= 300) {
    if (status === 401) throw new Error("Your session has expired. Sign in again to load this panel.");
    const reason = typeof record?.error === "string" && record.error ? record.error : `HTTP ${status}`;
    throw new Error(`${service}: ${reason}`);
  }
  const items = record?.[key];
  if (!Array.isArray(items)) throw new Error(`${service} returned a response without a "${key}" list.`);
  return items as T[];
}
