// Guided topic menu, as served by the assistant (GET /public-ai/v1/menu,
// ADR-008). The widget adds nothing to it: categories, labels and questions
// all come from the service's Doc 02 menu, and follow-ups arrive on each
// turn. Only the icon beside a category is chosen here (presentation).
//
// When the service has structured responses off, /menu is 404 and the
// widget falls back to the /config starter chips, each sending its own
// fixed message directly (no sub-level, no invented questions).

import type { AssistantMenu, Chip, FollowUp } from "@/lib/api/public-ai";

export type MenuTopic = {
  key: string;
  label: string;
  icon: string;
  /** The category's questions; empty for a fallback chip. */
  questions: FollowUp[];
  /** A fallback chip sends this message directly instead of opening a sub-level. */
  send?: string;
};

const ICONS: Record<string, string> = { platform: "🧩", pricing: "💳", trust: "🛡️", demo: "📅", support: "💬" };
const DEFAULT_ICON = "✨";

export function menuFromServer(menu: AssistantMenu): MenuTopic[] {
  return menu.categories.map((c) => ({ key: c.id, label: c.label, icon: ICONS[c.id] ?? DEFAULT_ICON, questions: c.items }));
}

export function menuFromChips(chips: Chip[]): MenuTopic[] {
  return chips.map((c) => ({ key: `chip:${c.label}`, label: c.label, icon: DEFAULT_ICON, questions: [], send: c.message }));
}

/**
 * The answer card's title: the menu question the visitor picked, else the
 * first menu question for the answer's intent, with its category's icon.
 */
export function answerTitle(menu: MenuTopic[], intentId: string, asked: string): { icon: string; label: string } | undefined {
  const text = asked.trim().toLowerCase();
  const match = (pick: (q: FollowUp) => boolean) => {
    for (const t of menu) {
      const q = t.questions.find(pick);
      if (q) return { icon: t.icon, label: q.label };
    }
    return undefined;
  };
  return match((q) => q.message.trim().toLowerCase() === text) ?? match((q) => q.intent_id === intentId);
}
