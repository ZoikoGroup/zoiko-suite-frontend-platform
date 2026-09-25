"use server";

// Server Actions behind the topbar notification bell.
//
// Separate from actions.ts, which serves the admin send form. That file's
// actions are operator tools guarded by a NOTIFICATION_SEND grant on a legal
// entity; these two are the signed-in user reading and acknowledging their OWN
// inbox, which needs no grant at all and must never be able to read anyone
// else's. Keeping them apart keeps that difference visible rather than leaving
// it to whoever next edits a shared helper.
//
// The session is decoded here rather than trusted from the client for the same
// reason actions.ts does it: a client component can pass anything it likes.

import { cookies } from "next/headers";

import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import {
  getUnreadCount,
  listNotifications,
  markNotificationRead,
  type Notification,
} from "@/lib/api/notifications";

/** What the bell renders. */
export type BellState = {
  /** Unread in-app notices for the signed-in principal. */
  unread: number;
  /** The most recent unread notices, newest first. */
  items: BellItem[];
  /**
   * Set when the inbox could not be read. The bell shows this instead of a
   * count — an unreadable inbox is not an empty one, and a silent zero would
   * tell the user they have nothing waiting when nobody knows whether they do.
   */
  error?: string;
};

export type BellItem = {
  id: string;
  subject: string;
  createdAt: string;
  sourceEventType?: string;
};

const MAX_ITEMS = 8;

async function requirePrincipal() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId) return null;
  return {
    principalId: session.principalId,
    tenantId: session.tenantId ?? "",
  };
}

/**
 * Read the caller's unread count and the notices behind it.
 *
 * Two calls rather than one: the count is authoritative and cheap, and the
 * list is capped at MAX_ITEMS for the dropdown. Deriving the badge from the
 * list length would cap the badge at 8 too, so a user with 40 unread notices
 * would be told they had 8.
 */
export async function loadBell(): Promise<BellState> {
  const identity = await requirePrincipal();
  if (!identity) {
    // Not signed in, or the session expired. Not an error worth showing in a
    // badge — the surrounding page will redirect.
    return { unread: 0, items: [] };
  }

  const [countResult, listResult] = await Promise.all([
    getUnreadCount(identity),
    listNotifications({ identity, unreadOnly: true }),
  ]);

  if (!countResult.ok) {
    return { unread: 0, items: [], error: countResult.error.message };
  }

  // The count succeeded and the list did not: show the number, skip the
  // preview. A working badge with an empty dropdown is more useful than
  // throwing away a count that is known to be correct.
  const items: BellItem[] = listResult.ok
    ? listResult.data.slice(0, MAX_ITEMS).map(toItem)
    : [];

  return { unread: countResult.data.unread_count, items };
}

function toItem(n: Notification): BellItem {
  return {
    id: n.notification_id,
    subject: n.subject,
    createdAt: n.created_at,
    sourceEventType: n.source_event_type,
  };
}

/**
 * Acknowledge one notice and return the refreshed bell.
 *
 * The service enforces that only the recipient may do this, so a forged id
 * from the client is refused there rather than trusted here. Returning the new
 * state in the same round trip keeps the badge and the list from disagreeing
 * after an optimistic update.
 */
export async function acknowledge(notificationId: string): Promise<BellState> {
  const identity = await requirePrincipal();
  if (!identity) return { unread: 0, items: [] };

  const result = await markNotificationRead(notificationId, identity);
  if (!result.ok) {
    // Re-read anyway: the mark may have failed because it was already read,
    // in which case the fresh state is still the right thing to show.
    const state = await loadBell();
    return { ...state, error: result.error.message };
  }
  return loadBell();
}
