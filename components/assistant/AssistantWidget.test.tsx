// Unit tests for the ZoikoSuite Assistant widget: Z-tile branding (K10), one
// bubble per question across retries, S08 states, suggestions, placeholder
// URLs never shown, and inline validation. The API client is mocked; nothing
// here talks to a network.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicAIConfig, TurnEnvelope } from "@/lib/api/public-ai";

const api = vi.hoisted(() => ({
  askAssistant: vi.fn(),
  endAssistantSession: vi.fn(),
  loadAssistantConfig: vi.fn(),
  loadAssistantMenu: vi.fn(),
  rateAssistantAnswer: vi.fn(),
  recordAssistantHandoff: vi.fn(),
  startAssistantSession: vi.fn(),
}));
vi.mock("@/lib/api/public-ai", async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }));

import { AssistantWidget } from "./AssistantWidget";

const LOGOS = { mark: "/logo-z.png", full: "/logo.png" };

const config: PublicAIConfig = {
  assistant_display_name: "ZoikoSuite Assistant",
  supported_locales: ["en-US"],
  market_choices: ["US", "GB"],
  public_routes: [],
  // As the service sends it: approved titles, URL blanked for placeholders.
  citation_links: [
    { url_key: "pricing", url: "", title: "Plans and trials" },
    { url_key: "legal", url: "https://pending-review.invalid/legal", title: "Legal and Contracts" },
  ],
};

function envelope(over: Partial<TurnEnvelope>): TurnEnvelope {
  return {
    turn_id: `pub_t_${Math.random().toString(16).slice(2)}`,
    request_id: "req_test",
    turn_sequence: 1,
    status: "ANSWERED",
    intent_id: "I05",
    text: "SYNTHETIC: Starter, Growth and Enterprise plans are available in the United States.",
    citations: [{ source_version_id: "src-plans-v1", claim_ids: ["c-plans-us"], url_key: "pricing" }],
    actions: [{ type: "OPEN_OFFICIAL_ROUTE", route_key: "pricing" }],
    knowledge_release_id: "kb-seed",
    answer_class: "STATUS_QUALIFIED",
    status_label: "Available",
    market_code: "US",
    reason: "ANSWERED",
    ...over,
  };
}

const ok = <T,>(data: T) => ({ ok: true as const, data });

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  Element.prototype.scrollIntoView = vi.fn();
  api.loadAssistantConfig.mockResolvedValue(ok(config));
  // Structured responses off by default: /menu is 404 and the starter chips stay.
  api.loadAssistantMenu.mockResolvedValue({ ok: false, error: { kind: "http", status: 404 } });
  api.startAssistantSession.mockResolvedValue(ok({ session_id: "pub_s_1", session_grant: "grant", expires_at: "" }));
  api.endAssistantSession.mockResolvedValue(ok(undefined));
});
afterEach(cleanup);

async function openWidget() {
  render(<AssistantWidget logos={LOGOS} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Chat with ZoikoSuite" }));
  });
  return screen.getByRole("dialog", { name: "ZoikoSuite Assistant" });
}

async function ask(text: string) {
  const box = screen.getByRole("textbox", { name: "Message" });
  fireEvent.change(box, { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(box, { key: "Enter" });
  });
}

function tileSize(el: Element) {
  const s = (el as HTMLElement).style;
  return { w: s.width, h: s.height, r: s.borderRadius };
}

describe("K10 Z-tile branding", () => {
  it("the closed launcher is the Z tile named \"Chat with ZoikoSuite\" (Doc01)", () => {
    render(<AssistantWidget logos={LOGOS} />);
    const launcher = screen.getByRole("button", { name: "Chat with ZoikoSuite" });
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    const img = within(launcher).getByTestId("ztile") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/logo-z.png");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("width")).toBe("56");
    expect(img.getAttribute("height")).toBe("56");
    expect(tileSize(img)).toEqual({ w: "56px", h: "56px", r: "16px" });
    expect(img.className).toContain("object-contain");
    expect(img.className).not.toMatch(/rounded-full|filter|grayscale|invert/);
    expect(within(launcher).queryByTestId("launcher-close-badge")).toBeNull();
  });

  it("open, the launcher keeps the tile and adds the close badge", async () => {
    await openWidget();
    const launcher = screen.getByTestId("assistant-launcher");
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(launcher.getAttribute("aria-label")).toBe("Close chat");
    expect(within(launcher).getByTestId("ztile").getAttribute("src")).toBe("/logo-z.png");
    expect(within(launcher).getByTestId("launcher-close-badge").className).toContain("za-close-badge"); // 18 px token
  });

  it("welcome card has the 48 px tile, title, greeting and topic menu; header shows the full wordmark", async () => {
    const dialog = await openWidget();
    const welcome = within(dialog).getByTestId("assistant-welcome");
    expect(tileSize(within(welcome).getByTestId("ztile"))).toEqual({ w: "48px", h: "48px", r: "12px" });
    expect(welcome.textContent).toContain("ZoikoSuite Assistant");
    expect(welcome.textContent).toContain("Hi, I can explain ZoikoSuite plans, modules, trust and integrations. I can't see or change any account.");
    // Doc01: at most four quick-action prompts; the rest behind "More topics".
    expect(within(within(welcome).getByRole("list", { name: "Suggested questions" })).getAllByRole("button").map((b) => b.querySelector(".za-option-label")!.textContent)).toEqual([
      "Pricing and trial", "Explore modules", "Book a demo", "Security and trust",
    ]);
    expect(welcome.textContent).toContain("AI assistant. Answers use public ZoikoSuite information only.");
    await act(async () => {
      fireEvent.click(within(welcome).getByRole("button", { name: "More topics" }));
    });
    expect(within(welcome).getByRole("button", { name: /Get support/ })).toBeTruthy();
    const header = dialog.querySelector("header")!;
    expect(within(header).queryByTestId("ztile")).toBeNull(); // the Z tile stays on the launcher only
    expect(within(header).getByTestId("full-logo").querySelector("img")!.getAttribute("src")).toBe("/logo.png");
    expect(within(header).getByRole("heading", { name: "ZoikoSuite Assistant" }).className).toContain("za-title");
    expect(within(header).getByTestId("assistant-subtitle").querySelector(".za-subtitle-full")!.textContent).toBe("AI assistant. Public ZoikoSuite information only.");
    expect(within(header).queryByRole("img")).toBeNull(); // the wordmark is decorative (the title names the dialog)
  });

  it("a failed tile becomes a white Z square of exactly the same size", async () => {
    render(<AssistantWidget logos={LOGOS} />);
    const launcher = screen.getByRole("button", { name: "Chat with ZoikoSuite" });
    const before = tileSize(within(launcher).getByTestId("ztile"));
    await act(async () => {
      fireEvent.error(within(launcher).getByTestId("ztile"));
    });
    const fallback = within(launcher).getByTestId("ztile-fallback");
    expect(fallback.textContent).toBe("Z");
    expect(fallback.className).toContain("bg-white");
    expect(fallback.className).toContain("text-navy-900");
    expect(tileSize(fallback)).toEqual(before);
  });

  it("the full wordmark sits on a white container in the header and the privacy notice", async () => {
    const dialog = await openWidget();
    expect(dialog.querySelector("header")!.querySelector('img[src="/logo.png"]')!.parentElement!.className).toContain("bg-white");
    await act(async () => {
      fireEvent.click(within(dialog).getAllByRole("button", { name: "Privacy and AI notice" })[0]);
    });
    const notice = within(dialog).getByRole("region", { name: "Privacy and AI notice" });
    const wordmark = notice.querySelector('img[src="/logo.png"]')!;
    expect(wordmark.parentElement!.className).toContain("bg-white");
    expect(notice.textContent).toContain("[period from signed policy]");
  });

  it("shows a 24 px avatar and the speaker label beside each assistant answer", async () => {
    api.askAssistant.mockResolvedValueOnce(ok(envelope({})));
    await openWidget();
    await ask("What plans are available?");
    const row = screen.getByTestId("assistant-answer").closest(".za-row-assistant") as HTMLElement;
    expect(tileSize(within(row).getByTestId("ztile"))).toEqual({ w: "24px", h: "24px", r: "6px" });
    expect(row.querySelector(".za-speaker")!.textContent).toBe("ZoikoSuite");
  });

  it("never shows the uncleared working name or a placeholder host", async () => {
    api.askAssistant
      .mockResolvedValueOnce(ok(envelope({ citations: [{ source_version_id: "kb-legal-v1", claim_ids: [], url_key: "legal" }] })))
      .mockResolvedValueOnce(ok(envelope({ status: "UNAVAILABLE", reason: "KILL_SWITCH", citations: [], actions: [] })));
    const dialog = await openWidget();
    await ask("What does Legal and Contracts do?");
    const sources = screen.getByTestId("assistant-sources");
    expect(sources.textContent).toBe("Legal and Contracts"); // title only
    expect(within(sources).queryByRole("link")).toBeNull();
    expect(screen.queryByRole("link", { name: /Compare plans/ })).toBeNull(); // no real URL → no CTA
    await ask("And pricing?");
    await act(async () => {
      fireEvent.click(within(dialog).getAllByRole("button", { name: "Privacy and AI notice" })[0]);
    });
    expect(document.body.innerHTML).not.toMatch(/suivo/i);
    expect(document.body.innerHTML).not.toMatch(/\.invalid|example\.invalid/);
  });
});

describe("one bubble per question", () => {
  it("retries a failed send with the same client_turn_id and no new bubble", async () => {
    api.askAssistant.mockResolvedValueOnce({ ok: false, error: { kind: "unreachable" } }).mockResolvedValueOnce(ok(envelope({})));
    const dialog = await openWidget();
    await ask("What plans are available?");
    expect(screen.getAllByTestId("visitor-bubble")).toHaveLength(1);
    expect(screen.getAllByTestId("visitor-bubble")[0].dataset.state).toBe("failed");
    const panel = screen.getByTestId("assistant-unavailable");
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Try again" }));
    });
    expect(screen.getAllByTestId("visitor-bubble")).toHaveLength(1);
    expect(screen.getAllByTestId("visitor-bubble")[0].dataset.state).toBe("sent");
    const [first, second] = api.askAssistant.mock.calls;
    expect(second[2]).toBe(first[2]); // same client_turn_id = Idempotency-Key
    expect(within(dialog).getAllByTestId("assistant-answer")).toHaveLength(1);
  });

  it("after an UNAVAILABLE answer, Try again keeps one bubble and replaces the reply", async () => {
    api.askAssistant
      .mockResolvedValueOnce(ok(envelope({ status: "UNAVAILABLE", reason: "MODEL_TIMEOUT", citations: [], actions: [] })))
      .mockResolvedValueOnce(ok(envelope({})));
    await openWidget();
    await ask("What plans are available?");
    const panel = screen.getByTestId("assistant-unavailable");
    expect(panel.textContent).toContain("The assistant is unavailable right now. These official pages can help in the meantime.");
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Try again" }));
    });
    expect(screen.getAllByTestId("visitor-bubble")).toHaveLength(1);
    expect(screen.queryByTestId("assistant-unavailable")).toBeNull();
    const [first, second] = api.askAssistant.mock.calls;
    expect(second[2]).not.toBe(first[2]);
  });

  it("ignores a reply whose turn_sequence is older than one already shown (CT-014)", async () => {
    api.askAssistant
      .mockResolvedValueOnce(ok(envelope({ turn_sequence: 2, text: "Newer answer." })))
      .mockResolvedValueOnce(ok(envelope({ turn_sequence: 1, text: "Stale answer." })));
    const dialog = await openWidget();
    await ask("First question?");
    await ask("Second question?");
    const answers = within(dialog).getAllByTestId("assistant-answer").map((a) => a.textContent);
    expect(answers.some((t) => t?.includes("Newer answer."))).toBe(true);
    expect(answers.some((t) => t?.includes("Stale answer."))).toBe(false);
    expect(screen.getAllByTestId("visitor-bubble")[1].dataset.state).toBe("failed");
  });

  it("words rate limiting differently from an outage", async () => {
    api.askAssistant.mockResolvedValueOnce({ ok: false, error: { kind: "http", status: 429 } });
    await openWidget();
    await ask("What plans are available?");
    expect(screen.getByTestId("assistant-unavailable").textContent).toContain("You're sending messages quickly. Wait a moment and try again.");
  });
});

describe("answers", () => {
  it("renders answer, qualifier badge and sources in order; Draft content is labelled", async () => {
    api.askAssistant.mockResolvedValueOnce(ok(envelope({ draft: true })));
    await openWidget();
    await ask("What plans are available?");
    const text = screen.getByTestId("assistant-answer").textContent!;
    expect(text.indexOf("plans are available")).toBeLessThan(text.indexOf("Available · US"));
    expect(text.indexOf("Available · US")).toBeLessThan(text.indexOf("Sources"));
    expect(text).toContain("Draft content");
  });

  it("live-data refusal shows its two chips and no CTA", async () => {
    api.askAssistant.mockResolvedValueOnce(
      ok(
        envelope({
          status: "REFUSED_ACTION",
          intent_id: "X01",
          reason: "LIVE_PLATFORM_DATA",
          text: "I can't see live platform data or account information. I can explain what ZoikoSuite's services and modules do, using public information.",
          citations: [],
          actions: [],
          status_label: undefined,
          market_code: undefined,
          suggestions: [
            { label: "Explore modules", message: "What modules does ZoikoSuite include?" },
            { label: "Get support", message: "I need help from support" },
          ],
        }),
      ),
    );
    await openWidget();
    await ask("What are the Active Microservices");
    const answer = screen.getByTestId("assistant-answer");
    expect(within(within(answer).getByRole("list", { name: "Suggested questions" })).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Explore modules",
      "Get support",
    ]);
    expect(within(answer).queryByRole("link")).toBeNull();
  });

  it("shows clarify chips with Other and Show general overview", async () => {
    api.askAssistant.mockResolvedValueOnce(
      ok(
        envelope({
          status: "CLARIFY",
          text: "Which country are you evaluating ZoikoSuite for?",
          citations: [],
          actions: [],
          status_label: "MARKET_DEPENDENT",
          market_code: undefined,
          clarification: { slot: "market_code", question: "Which country are you evaluating ZoikoSuite for?", options: ["US", "GB", "OTHER", "GENERAL_OVERVIEW"] },
        }),
      ),
    );
    await openWidget();
    await ask("What plans are available, and is there a free trial?");
    const chips = within(screen.getByRole("list", { name: "Choose an answer" })).getAllByRole("button").map((b) => b.textContent);
    expect(chips).toEqual(["United States", "United Kingdom", "Other", "Show general overview"]);
  });

  it("asks for a question instead of sending an empty one", async () => {
    await openWidget();
    await ask("   ");
    expect(screen.getByText("Type a question first.")).toBeTruthy();
    expect(api.askAssistant).not.toHaveBeenCalled();
  });

  it("blocks a draft that looks like a password", async () => {
    await openWidget();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "my password is hunter2x" } });
    expect(screen.getByTestId("assistant-sensitive").textContent).toContain("Looks like sensitive info. Remove it before sending.");
    expect(screen.getByRole("button", { name: "Remove it" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement).disabled).toBe(false); // still editable
    expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("sensitive input flagged by the service (Doc 01 §16, Doc 06 §20)", () => {
  it("replaces the visitor bubble so the value is never re-displayed", async () => {
    api.askAssistant.mockResolvedValueOnce(
      ok(envelope({ status: "REFUSED_ACTION", intent_id: "X03", reason: "SENSITIVE_INPUT", text: "Please do not share passwords, codes, bank details or personal financial or employee records here.", citations: [], actions: [] })),
    );
    await openWidget();
    await ask("my EIN is 12-3456789, which plan fits?");
    const bubble = screen.getAllByTestId("visitor-bubble")[0];
    expect(bubble.textContent).not.toContain("12-3456789");
    expect(bubble.textContent).toContain("Sensitive details removed");
  });
});

describe("S05 Unverified only for verification failures", () => {
  it("an off-topic reply shows no Unverified badge and no Try again", async () => {
    api.askAssistant.mockResolvedValueOnce(
      ok(envelope({ status: "ABSTAIN", reason: "OUT_OF_SCOPE", intent_id: "I29", status_label: undefined, market_code: undefined, citations: [], actions: [],
        text: "I'm here to help with ZoikoSuite capabilities, plans, security, integrations, demos and support." })),
    );
    const dialog = await openWidget();
    await ask("what is the weather");
    const answer = within(dialog).getAllByTestId("assistant-answer").at(-1)!;
    expect(answer.textContent).not.toContain("Unverified");
    expect(answer.textContent).not.toContain("I couldn't verify that.");
    expect(within(answer).queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("a validation failure keeps the Unverified badge and offers Try again", async () => {
    api.askAssistant.mockResolvedValueOnce(
      ok(envelope({ status: "ABSTAIN", reason: "VALIDATION_FAILED", status_label: undefined, market_code: undefined, citations: [], actions: [],
        text: "I couldn't verify that from approved ZoikoSuite sources, so I won't guess." })),
    );
    const dialog = await openWidget();
    await ask("What does Legal do?");
    const answer = within(dialog).getAllByTestId("assistant-answer").at(-1)!;
    expect(answer.textContent).toContain("Unverified");
    expect(within(answer).getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("a clarifying question for an ambiguous term shows its chips", async () => {
    api.askAssistant.mockResolvedValueOnce(
      ok(envelope({ status: "CLARIFY", reason: "AMBIGUOUS_QUESTION", intent_id: "I29", status_label: undefined, market_code: undefined, citations: [], actions: [],
        text: "Do you mean ZoikoSuite plan prices, payroll, or payment workflows in Finance and Payments?",
        suggestions: [{ label: "Plan prices", message: "How much does ZoikoSuite cost?" }, { label: "Payroll", message: "Does ZoikoSuite handle payroll?" }, { label: "Payment workflows", message: "What does Finance and Payments do?" }] })),
    );
    const dialog = await openWidget();
    await ask("what is the pay");
    const answer = within(dialog).getAllByTestId("assistant-answer").at(-1)!;
    for (const name of ["Plan prices", "Payroll", "Payment workflows"]) expect(within(answer).getByRole("button", { name })).toBeTruthy();
    expect(answer.textContent).not.toContain("Unverified");
  });
});

// The service's /menu as public-ai-svc serves it (ADR-008), trimmed.
const serverMenu = {
  schema_version: "1.0",
  categories: [
    {
      id: "pricing",
      label: "Compare plans",
      items: [
        { id: "pricing.plans", label: "Plan differences", intent_id: "I05", message: "What plans are available?" },
        { id: "pricing.trial", label: "Trial terms", intent_id: "I06", message: "Is there a free trial?" },
      ],
    },
    {
      id: "trust",
      label: "Security & trust",
      items: [{ id: "trust.residency", label: "Data residency", intent_id: "I14", message: "Where is ZoikoSuite data stored?" }],
    },
  ],
};

describe("Kairos-style menu, history and theme", () => {
  it("with /menu off, a starter chip sends its own message directly", async () => {
    api.askAssistant.mockResolvedValueOnce(ok(envelope({})));
    const dialog = await openWidget();
    await act(async () => {
      fireEvent.click(within(within(dialog).getByTestId("assistant-welcome")).getByRole("button", { name: /Book a demo/ }));
    });
    expect(api.askAssistant.mock.calls[0][3]).toBe("I'd like to book a demo");
  });

  it("the service's menu: a category opens its questions; a question sends; Back to Main Menu returns", async () => {
    api.loadAssistantMenu.mockResolvedValue(ok(serverMenu));
    api.askAssistant.mockResolvedValueOnce(ok(envelope({})));
    const dialog = await openWidget();
    const welcome = within(dialog).getByTestId("assistant-welcome");
    expect(within(within(welcome).getByRole("list", { name: "Suggested questions" })).getAllByRole("button").map((b) => b.querySelector(".za-option-label")!.textContent)).toEqual([
      "Compare plans",
      "Security & trust",
    ]);
    await act(async () => {
      fireEvent.click(within(welcome).getByRole("button", { name: /Compare plans/ }));
    });
    const questions = within(welcome).getByRole("list", { name: "Compare plans questions" });
    expect(api.askAssistant).not.toHaveBeenCalled(); // opening a category sends nothing
    await act(async () => {
      fireEvent.click(within(questions).getByRole("button", { name: "Back to Main Menu" }));
    });
    await act(async () => {
      fireEvent.click(within(welcome).getByRole("button", { name: /Compare plans/ }));
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Trial terms" }));
    });
    expect(api.askAssistant.mock.calls[0][3]).toBe("Is there a free trial?"); // the item's fixed message, not its label
  });

  it("shows the service's follow-ups, titles, sources and CTA; never invents its own", async () => {
    api.loadAssistantMenu.mockResolvedValue(ok(serverMenu));
    api.askAssistant.mockResolvedValueOnce(
      ok(
        envelope({
          intent_id: "I05",
          citations: [{ source_version_id: "claims-1", claim_ids: ["c1"], url_key: "pricing", title: "Pricing and plans", route_key: "pricing" }],
          actions: [{ type: "OPEN_OFFICIAL_ROUTE", route_key: "pricing" }],
          outcome: "GROUNDED",
          followups: [
            { id: "pricing.trial", label: "Trial terms", intent_id: "I06", message: "Is there a free trial?" },
            { id: "pricing.plans", label: "Plan differences", intent_id: "I05", message: "What plans are available?" },
          ],
          cta: { primary: { route_key: "pricing", label: "Compare plans", url: "https://www.zoikosuite.com/pricing" } },
        }),
      ),
    );
    await openWidget();
    await ask("What plans are available?");
    const answer = screen.getByTestId("assistant-answer");
    expect(answer.querySelector(".za-card-title")!.textContent).toContain("Plan differences"); // the menu question asked, not its category
    expect(within(screen.getByTestId("assistant-sources")).getByText("Pricing and plans")).toBeTruthy();
    expect(within(answer).getByRole("link", { name: /Compare plans/ }).getAttribute("href")).toBe("https://www.zoikosuite.com/pricing");
    const followups = screen.getByTestId("assistant-followups");
    // The question just asked is not offered again.
    expect(within(within(followups).getByRole("list", { name: "Related questions" })).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Trial terms",
      "Back to Main Menu",
    ]);
    await act(async () => {
      fireEvent.click(within(followups).getByRole("button", { name: "Back to Main Menu" }));
    });
    expect(screen.getByTestId("assistant-menu")).toBeTruthy();
    expect(screen.queryByTestId("assistant-followups")).toBeNull();
  });

  it("without service follow-ups shows only Back to Main Menu", async () => {
    api.askAssistant.mockResolvedValueOnce(ok(envelope({})));
    await openWidget();
    await ask("What plans are available?");
    const related = within(screen.getByTestId("assistant-followups")).getAllByRole("button").map((b) => b.textContent);
    expect(related).toEqual(["Back to Main Menu"]);
  });

  it("history lists this session's questions and empties on Clear chat", async () => {
    api.askAssistant.mockResolvedValueOnce(ok(envelope({})));
    const dialog = await openWidget();
    await ask("What plans are available?");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Chat history" }));
    });
    const history = within(dialog).getByRole("region", { name: "Chat history" });
    expect(within(history).getByRole("button", { name: "What plans are available?" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(dialog.querySelector("form")!).getByRole("button", { name: "Clear chat" }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByTestId("assistant-end")).getByRole("button", { name: "Clear chat" }));
    });
    expect(within(dialog).queryByRole("region", { name: "Chat history" })).toBeNull();
    expect(screen.queryByTestId("visitor-bubble")).toBeNull();
  });

  it("the theme button switches light and dark and remembers the choice", async () => {
    window.localStorage.removeItem("zoiko-assistant-theme");
    const dialog = await openWidget();
    const root = dialog.closest("[data-za-root]")!;
    const before = root.getAttribute("data-za-theme");
    const toggle = within(dialog).getByRole("button", { name: before === "dark" ? "Switch to light theme" : "Switch to dark theme" });
    await act(async () => {
      fireEvent.click(toggle);
    });
    const after = before === "dark" ? "light" : "dark";
    expect(root.getAttribute("data-za-theme")).toBe(after);
    expect(window.localStorage.getItem("zoiko-assistant-theme")).toBe(after);
  });

  it("the composer has a clear-chat icon and the footer strip", async () => {
    const dialog = await openWidget();
    const clear = within(dialog.querySelector("form")!).getByRole("button", { name: "Clear chat" }) as HTMLButtonElement;
    expect(clear.disabled).toBe(true); // nothing to clear yet
    expect(within(dialog).getByTestId("assistant-strip").textContent).toBe("ZoikoSuite AI · Source-grounded · Governed");
  });
});

describe("answer format (Doc 01 §12, Doc 02 §16)", () => {
  it("clampWords keeps whole lines and never splits a list item", async () => {
    const { clampWords } = await import("./markdown");
    const item = (n: number) => `- ${Array.from({ length: 50 }, (_, i) => `w${n}x${i}`).join(" ")}`;
    const text = [item(1), item(2), item(3)].join("\n");
    const out = clampWords(text, 120);
    expect(out.clamped).toBe(true);
    expect(out.text).toBe([item(1), item(2)].join("\n"));
    expect(clampWords("short answer", 120)).toEqual({ text: "short answer", clamped: false });
    const long = Array.from({ length: 130 }, (_, i) => `w${i}`).join(" ");
    expect(clampWords(long, 120).text.split(" ")).toHaveLength(120);
  });

  it("shows a long answer's first 120 words with Show more / Show less", async () => {
    const words = Array.from({ length: 150 }, (_, i) => `word${i}`).join(" ");
    api.askAssistant.mockResolvedValueOnce(ok(envelope({ text: words })));
    await openWidget();
    await ask("Tell me everything");
    const answer = screen.getByTestId("assistant-answer");
    expect(answer.textContent).not.toContain("word149");
    const more = within(answer).getByRole("button", { name: "Show more" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      fireEvent.click(more);
    });
    expect(answer.textContent).toContain("word149");
    expect(within(answer).getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("a short answer has no expand control", async () => {
    api.askAssistant.mockResolvedValueOnce(ok(envelope({})));
    await openWidget();
    await ask("What plans are available?");
    expect(within(screen.getByTestId("assistant-answer")).queryByRole("button", { name: "Show more" })).toBeNull();
  });
});

describe('"Other" country (Doc 02 T08)', () => {
  it("is a coverage route: no Unverified badge or retry, and its next steps are offered", async () => {
    api.askAssistant.mockResolvedValueOnce(
      ok(
        envelope({
          status: "ABSTAIN",
          reason: "MARKET_NOT_COVERED",
          answer_class: "HANDOFF_UNKNOWN",
          text: "I can't confirm what's available in that country from approved ZoikoSuite sources. The team can confirm coverage for your country.",
          citations: [],
          actions: [],
          status_label: undefined,
          market_code: undefined,
          suggestions: [
            { label: "Show general overview", message: "Show general overview" },
            { label: "Book a demo", message: "I'd like to book a demo" },
          ],
        }),
      ),
    );
    await openWidget();
    await ask("Other");
    const answer = screen.getByTestId("assistant-answer");
    expect(answer.textContent).not.toContain("I couldn't verify that.");
    expect(answer.textContent).not.toContain("Unverified");
    expect(within(answer).queryByRole("button", { name: "Try again" })).toBeNull();
    expect(within(within(answer).getByRole("list", { name: "Suggested questions" })).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Show general overview",
      "Book a demo",
    ]);
  });
});

describe("typing reveal of the validated answer (Doc 05 §14, Doc 01 §06)", () => {
  const media = (globalThis as unknown as { __media: { reducedMotion: boolean } }).__media;
  afterEach(() => {
    media.reducedMotion = true;
  });

  it("revealWords keeps line breaks and never shows a half bold marker", async () => {
    const { revealWords } = await import("./markdown");
    expect(revealWords("- one two\n- three", 3)).toBe("- one two");
    expect(revealWords("a **bold words** end", 2)).toBe("a **bold**");
    expect(revealWords("a b", 9)).toBe("a b");
  });

  it("reveals the answer word by word, then shows sources and feedback", async () => {
    media.reducedMotion = false;
    const text = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
    api.askAssistant.mockResolvedValueOnce(ok(envelope({ text })));
    await openWidget();
    await ask("What plans are available?");
    const answer = screen.getByTestId("assistant-answer");
    expect(answer.getAttribute("data-typing")).toBe("true");
    expect(answer.textContent).not.toContain("w39");
    expect(screen.queryByTestId("assistant-sources")).toBeNull(); // extras wait for the text
    // The screen reader gets the whole answer at once.
    expect(screen.getByTestId("assistant-announcer").textContent).toContain("w39");
    await screen.findByTestId("assistant-sources", {}, { timeout: 4000 });
    expect(answer.textContent).toContain("w39");
    expect(answer.hasAttribute("data-typing")).toBe(false);
  });

  it("a click shows the whole answer at once", async () => {
    media.reducedMotion = false;
    const text = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
    api.askAssistant.mockResolvedValueOnce(ok(envelope({ text })));
    await openWidget();
    await ask("What plans are available?");
    const answer = screen.getByTestId("assistant-answer");
    await act(async () => {
      fireEvent.click(answer);
    });
    expect(answer.textContent).toContain("w39");
    expect(screen.getByTestId("assistant-sources")).toBeTruthy();
  });

  it("under reduced motion the answer appears complete", async () => {
    api.askAssistant.mockResolvedValueOnce(ok(envelope({})));
    await openWidget();
    await ask("What plans are available?");
    expect(screen.getByTestId("assistant-answer").hasAttribute("data-typing")).toBe(false);
    expect(screen.getByTestId("assistant-sources")).toBeTruthy();
  });
});

describe("expired market claims (Doc 02 T06)", () => {
  it("keeps the Unverified notice but offers the service's next steps instead of a retry", async () => {
    api.askAssistant.mockResolvedValueOnce(
      ok(
        envelope({
          status: "ABSTAIN",
          intent_id: "I06",
          reason: "EXPIRED_SOURCE",
          answer_class: "HANDOFF_UNKNOWN",
          text: "I can't verify the current trial terms for the United Kingdom right now. The official pricing page has the current information.",
          citations: [],
          actions: [],
          status_label: undefined,
          market_code: undefined,
          suggestions: [
            { label: "United States", message: "United States" },
            { label: "Show general overview", message: "Show general overview" },
          ],
        }),
      ),
    );
    await openWidget();
    await ask("United Kingdom");
    const answer = screen.getByTestId("assistant-answer");
    expect(answer.textContent).toContain("I couldn't verify that.");
    expect(within(answer).queryByRole("button", { name: "Try again" })).toBeNull(); // expired stays expired
    expect(within(within(answer).getByRole("list", { name: "Suggested questions" })).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "United States",
      "Show general overview",
    ]);
  });
});

describe("New conversation and tab-only history (Doc 02 §10, §27)", () => {
  beforeEach(() => window.sessionStorage.clear());

  async function openMenu(dialog: HTMLElement) {
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Menu" }));
    });
  }

  it("New conversation is disabled until there is a conversation", async () => {
    const dialog = await openWidget();
    await openMenu(dialog);
    expect((within(dialog).getByRole("menuitem", { name: "New conversation" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("starts fresh, ends the old session and keeps its questions and answers in this tab's history", async () => {
    api.askAssistant.mockResolvedValueOnce(ok(envelope({ text: "Starter, Growth and Enterprise plans are available." })));
    const dialog = await openWidget();
    await ask("What plans are available?");
    await openMenu(dialog);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("menuitem", { name: "New conversation" }));
    });
    expect(screen.queryByTestId("visitor-bubble")).toBeNull(); // fresh conversation
    expect(within(dialog).getByTestId("assistant-welcome")).toBeTruthy();
    expect(api.endAssistantSession).toHaveBeenCalled();
    const stored = JSON.parse(window.sessionStorage.getItem("zoiko-assistant-conversations")!);
    expect(stored[0].turns).toEqual([{ q: "What plans are available?", a: "Starter, Growth and Enterprise plans are available." }]);
    expect(window.localStorage.getItem("zoiko-assistant-conversations")).toBeNull(); // never beyond the tab

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Chat history" }));
    });
    const archive = within(dialog).getByTestId("assistant-archive");
    expect(archive.textContent).toContain("What plans are available?");
    expect(archive.textContent).toContain("Starter, Growth and Enterprise plans are available.");
    expect(within(dialog).getByRole("region", { name: "Chat history" }).textContent).toContain("Kept in this browser tab only");

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Clear history" }));
    });
    expect(within(dialog).queryByTestId("assistant-archive")).toBeNull();
    expect(window.sessionStorage.getItem("zoiko-assistant-conversations")).toBeNull();
  });

  it("Clear chat erases the conversation without keeping it in history", async () => {
    api.askAssistant.mockResolvedValueOnce(ok(envelope({})));
    const dialog = await openWidget();
    await ask("What plans are available?");
    await act(async () => {
      fireEvent.click(within(dialog.querySelector("form")!).getByRole("button", { name: "Clear chat" }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByTestId("assistant-end")).getByRole("button", { name: "Clear chat" }));
    });
    expect(window.sessionStorage.getItem("zoiko-assistant-conversations")).toBeNull();
  });
});
