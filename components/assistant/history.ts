// Conversation history kept in the visitor's own browser, never sent to the
// service (Doc 02 §10, Doc 06 §11 and §17).
//
// History is kept on this device (localStorage) by default and never expires:
// like a desktop chat app, earlier conversations stay until the visitor
// deletes them (a conversation, or all of them) or turns "Remember my chats
// on this device" off, which deletes the device copy and keeps history for
// this tab only (sessionStorage). Product decision of 2026-11-07, replacing
// the 24-hour device expiry; the privacy notice must say so.
// Questions are stored masked (maskForHistory), so the browser keeps no
// contact details or secrets.

export const SESSION_KEY = "zoiko-assistant-conversations";
export const DEVICE_KEY = "zoiko-assistant-history-v1";
export const REMEMBER_KEY = "zoiko-assistant-remember"; // "0" = opted out
export const SESSION_MAX = 10;
export const DEVICE_MAX = 200;

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

/** Whether history is kept on this device: yes unless the visitor opted out. */
export function rememberOn(): boolean {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return false; // storage blocked: nothing can be kept
  }
}

/** Records the choice. Turning it off deletes the device history. */
export function setRemember(on: boolean) {
  try {
    if (on) window.localStorage.removeItem(REMEMBER_KEY);
    else {
      window.localStorage.setItem(REMEMBER_KEY, "0");
      window.localStorage.removeItem(DEVICE_KEY);
    }
  } catch {
    // storage blocked: nothing is kept
  }
}

/** Saved conversations, newest first. */
export function readHistory(remember: boolean): SavedConversation[] {
  const s = store(remember);
  if (!s) return [];
  try {
    const raw = s.getItem(remember ? DEVICE_KEY : SESSION_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    const valid = (list as SavedConversation[]).filter((c) => c && typeof c.id === "string" && Array.isArray(c.turns));
    return valid;
  } catch {
    return [];
  }
}

export function writeHistory(list: SavedConversation[], remember: boolean) {
  const s = store(remember);
  if (!s) return;
  const key = remember ? DEVICE_KEY : SESSION_KEY;
  const kept = list.slice(0, remember ? DEVICE_MAX : SESSION_MAX);
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
