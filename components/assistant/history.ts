// Conversation history kept in the visitor's own browser, never sent to the
// service (Doc 02 §10, Doc 06 §11 and §17).
//
// By default history lives in sessionStorage: this tab only, gone when it
// closes, because a long-lived browser transcript is not allowed by default.
// The visitor may opt in to "Remember my chats on this device": history then
// lives in localStorage for at most DEVICE_TTL_MS. Opting out deletes it.
// Questions are stored masked (maskForHistory), so the browser never keeps
// more than the service does.

export const SESSION_KEY = "zoiko-assistant-conversations";
export const DEVICE_KEY = "zoiko-assistant-history-v1";
export const REMEMBER_KEY = "zoiko-assistant-remember";
export const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_MAX = 10;
export const DEVICE_MAX = 50;

export type SavedConversation = {
  id: string;
  startedAt: number;
  updatedAt?: number;
  turns: { q: string; a: string }[];
};

function store(remember: boolean): Storage | null {
  try {
    return remember ? window.localStorage : window.sessionStorage;
  } catch {
    return null; // storage blocked: history lasts for this page view only
  }
}

/** Whether the visitor opted in to keeping history on this device. */
export function rememberOn(): boolean {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

/** Records the choice. Turning it off deletes the device history. */
export function setRemember(on: boolean) {
  try {
    if (on) window.localStorage.setItem(REMEMBER_KEY, "1");
    else {
      window.localStorage.removeItem(REMEMBER_KEY);
      window.localStorage.removeItem(DEVICE_KEY);
    }
  } catch {
    // storage blocked: nothing is kept
  }
}

function fresh(c: SavedConversation, now: number): boolean {
  return now - (c.updatedAt ?? c.startedAt) < DEVICE_TTL_MS;
}

/** Saved conversations, newest first; expired device entries are dropped. */
export function readHistory(remember: boolean, now = Date.now()): SavedConversation[] {
  const s = store(remember);
  if (!s) return [];
  try {
    const raw = s.getItem(remember ? DEVICE_KEY : SESSION_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    const valid = (list as SavedConversation[]).filter((c) => c && typeof c.id === "string" && Array.isArray(c.turns));
    return remember ? valid.filter((c) => fresh(c, now)) : valid;
  } catch {
    return [];
  }
}

export function writeHistory(list: SavedConversation[], remember: boolean, now = Date.now()) {
  const s = store(remember);
  if (!s) return;
  const key = remember ? DEVICE_KEY : SESSION_KEY;
  const kept = (remember ? list.filter((c) => fresh(c, now)) : list).slice(0, remember ? DEVICE_MAX : SESSION_MAX);
  try {
    if (kept.length) s.setItem(key, JSON.stringify(kept));
    else s.removeItem(key);
  } catch {
    // quota or blocked: keep what is shown in memory only
  }
}

/** Puts entry first, replacing an earlier copy with the same id. */
export function upsert(list: SavedConversation[], entry: SavedConversation): SavedConversation[] {
  return [entry, ...list.filter((c) => c.id !== entry.id)];
}

/** Deletes every copy of the history, in this tab and on the device. */
export function clearAllHistory() {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // blocked
  }
  try {
    window.localStorage.removeItem(DEVICE_KEY);
  } catch {
    // blocked
  }
}
