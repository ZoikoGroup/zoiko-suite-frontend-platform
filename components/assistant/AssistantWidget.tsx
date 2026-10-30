"use client";

// ZoikoSuite Assistant widget (public-ai-svc, Release R0).
//
// Layout and sizes follow Document 01 (§06 IA, §07 W01 desktop, §08 W02
// mobile, §10 states S00–S09, §17 accessibility). Every size is a token in
// ./assistant.css; docs/ui-spec.md marks which are Doc01 rules and which are
// proposed. Desktop: right-side panel beside the launcher. Mobile: bottom
// sheet (full viewport at <= 360 px) that keeps the composer above the
// keyboard (VisualViewport), closes on the device Back button and restores
// focus and page scroll.
//
// The widget is anonymous on every page: calls go to the same-origin
// /public-ai/v1/* route with credentials "omit" (lib/api/public-ai.ts). It
// never reads the site's cookies, tokens, storage, dashboard state or DOM.
//
// One question = one visitor bubble, keyed by its client_turn_id. A failed
// send keeps that bubble (sending → failed → sent) and "Try again" resends
// the SAME client_turn_id, so the service replays its stored answer. Only
// after a stored UNAVAILABLE or ABSTAIN answer does a retry use a fresh id,
// still in the same bubble.

import "./assistant.css";
import { useCallback, useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowDown,
  CircleCheck,
  CircleHelp,
  CircleSlash,
  Clock,
  ChevronLeft,
  Copy,
  ExternalLink,
  FilePen,
  Globe,
  Handshake,
  History,
  Info,
  LayoutGrid,
  Maximize2,
  Menu,
  Minimize2,
  Moon,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Square,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import {
  OTHER_OPTION,
  OVERVIEW_OPTION,
  askAssistant,
  validEnvelope,
  validMenu,
  endAssistantSession,
  loadAssistantConfig,
  loadAssistantMenu,
  rateAssistantAnswer,
  recordAssistantHandoff,
  startAssistantSession,
  type AssistantMenu,
  type Chip,
  type FeedbackReason,
  type PublicAIConfig,
  type PublicAIError,
  type PublicAIResult,
  type TurnEnvelope,
} from "@/lib/api/public-ai";
import { ASSISTANT_LABEL, ASSISTANT_SUBTITLE, ASSISTANT_TITLE, LOGO_FULL_URL, LOGO_MARK_URL, type AssistantLogos } from "./branding";
import { Markdown } from "./markdown";
import { answerTitle, menuFromChips, menuFromServer, type MenuTopic } from "./menu";
import { looksSensitive, reduce } from "./state";
import { useLauncherOffset } from "./useLauncherOffset";
import { FullLogo, ZTile } from "./ZTile";

type Feedback = { rating?: "useful" | "not_useful"; reason?: FeedbackReason; sent?: boolean };
type FailKind = "network" | "rate_limited" | "busy" | "timeout";

type VisitorMessage = {
  id: string; // stable bubble id
  role: "visitor";
  text: string;
  market?: string;
  turnId: string; // client_turn_id = Idempotency-Key of the current attempt
  state: "sending" | "failed" | "sent" | "stopped";
  fail?: { kind: FailKind; reference: string; retryAfter?: number };
};
type Message =
  | VisitorMessage
  | { id: string; role: "assistant"; turn: TurnEnvelope; feedback: Feedback; replyTo: string }
  | { id: string; role: "notice"; text: string };

type Session = { id: string; grant: string };

const MAX_MESSAGE = 2000;
const COUNTER_FROM = 1800;
const MAX_STARTERS = 4; // Doc01 §06: max four quick-action prompts
const MOBILE_STARTERS = 3; // Doc01 §06: 2-3 visible chips at a time on mobile
const MOTION_MS = 180;
// Per-visitor theme choice (a convenience only: the widget works without it).
const THEME_KEY = "zoiko-assistant-theme";
type Theme = "light" | "dark";
// The topic menu shown in the conversation: the main menu or one topic's questions.
type MenuView = { kind: "main" } | { kind: "topic"; key: string };

// Fallback copy for when /config has not loaded; the service's copy wins.
const STARTERS: Chip[] = [
  { label: "Pricing and trial", message: "What plans are available, and is there a free trial?" },
  { label: "Explore modules", message: "What modules does ZoikoSuite include?" },
  { label: "Book a demo", message: "I'd like to book a demo" },
  { label: "Security and trust", message: "How is data secured?" },
  { label: "Integrations", message: "Which integrations does ZoikoSuite support?" },
  { label: "Get support", message: "I need help from support" },
];

const COPY: Record<string, string> = {
  "ui.header.title": ASSISTANT_TITLE,
  "ui.header.subtitle": ASSISTANT_SUBTITLE,
  "ui.header.subtitle_short": "AI assistant. Public information only.",
  "ui.launcher.open": "Chat with ZoikoSuite",
  "ui.launcher.close": "Close chat",
  "ui.welcome.greeting": "Hi, I can explain ZoikoSuite plans, modules, trust and integrations. I can't see or change any account.",
  "ui.welcome.disclosure": "AI assistant. Answers use public ZoikoSuite information only.",
  "ui.more_topics": "More topics",
  "ui.privacy": "Don't share passwords, payment, tax or account details.",
  "ui.privacy.link": "Privacy and AI notice",
  "ui.placeholder": "Ask about ZoikoSuite",
  "ui.thinking": "Checking approved sources…",
  "ui.clear": "Clear chat",
  "ui.clear.notice": "Clearing the chat ends this session in your browser. It doesn't erase records the service must keep under its retention policy.",
  "ui.sensitive.warning": "Looks like sensitive info. Remove it before sending.",
  "ui.sensitive.remove": "Remove it",
  "ui.empty": "Type a question first.",
  "ui.clarify.overview": "Show general overview",
  "ui.clarify.other": "Other",
  "ui.uncertain": "I couldn't verify that.",
  "ui.error.unreachable": "I can't reach the assistant right now. Check your connection, then try again.",
  "ui.error.timeout": "That took too long. Please try again.",
  "ui.error.busy": "I'm still finishing your previous message. Please try again in a moment.",
  "ui.error.rate_limited": "You're sending messages quickly. Wait a moment and try again.",
  "ui.unavailable": "The assistant is unavailable right now. These official pages can help in the meantime.",
  "ui.offline": "You're offline. Check your connection, then try again.",
  "ui.timeout": "Your public chat session has ended. Start a new conversation to continue.",
  "ui.retry": "Try again",
  "ui.jump": "Jump to latest",
  "ui.feedback.prompt": "Was this helpful?",
  "ui.feedback.thanks": "Thanks for the feedback.",
  "ui.end.title": "Before you clear the chat",
  "ui.end.prompt": "Was this chat helpful?",
  "ui.end.keep": "Keep chatting",
  "ui.menu": "Menu",
  "ui.menu.topics": "Browse topics",
  "ui.menu.main": "Choose a topic",
  "ui.menu.back": "Back to Main Menu",
  "ui.menu.related": "Related questions",
  "ui.history": "Chat history",
  "ui.history.empty": "Questions you ask in this chat appear here. They're cleared when you clear the chat.",
  "ui.theme.light": "Switch to light theme",
  "ui.theme.dark": "Switch to dark theme",
  "ui.strip": "AI · Source-grounded · Governed",
  "ui.retention.link": "Retention notice",
  "ui.privacy.title": "Privacy and AI notice",
  "ui.privacy.body":
    "This assistant uses AI to answer from approved, public ZoikoSuite information. It can't see or change any account. Your messages are processed to answer you and to keep the service safe. Please don't share personal, payment, tax or account details.",
  "ui.privacy.retention": "Chat records are kept for [period from signed policy], then deleted.",
  "ui.draft": "Draft content",
  "ui.status.VERIFIED": "Verified",
  "ui.status.Partner-Supported": "Partner-supported",
  "ui.status.Not Available": "Not available",
  "ui.status.MARKET_DEPENDENT": "Depends on your country",
};

const ROUTE_LABELS: Record<string, string> = {
  pricing: "Compare plans",
  demo: "Book a demo",
  support: "Open support",
  core_modules: "Explore modules",
  trust: "Open Trust Center",
  signup_or_trial: "Start a trial",
};

/** Shown in place of a message the service classed as sensitive (X03). */
export const SENSITIVE_REMOVED = "Sensitive details removed from this message.";

// S07: the expected channel, never a wait time (Doc01 §10).
const CHANNELS: Record<string, string> = {
  // Doc 10 §08 "Enquiry route only" copy: no follow-up is implied.
  demo: "Open our secure demo form to send your request.",
  support: "This opens the official support page.",
  trust: "This opens the official trust and security page.",
  pricing: "This opens the official pricing page.",
};

// Official pages offered whenever the assistant cannot answer (S08), shown
// only when the route registry has a real URL for them.
const FALLBACK_ROUTES: { key: string; label: string }[] = [
  { key: "pricing", label: "Pricing" },
  { key: "core_modules", label: "Core modules" },
  { key: "trust", label: "Trust center" },
  { key: "support", label: "Support" },
];

const STATUS_ICONS: Record<string, typeof Info> = {
  VERIFIED: ShieldCheck,
  Available: CircleCheck,
  Implemented: CircleCheck,
  Limited: TriangleAlert,
  "Partner-Supported": Handshake,
  Planned: Clock,
  "In Validation": Clock,
  "Not Available": CircleSlash,
  Unverified: CircleHelp,
  Readiness: Info,
  "Current Architecture": Info,
  MARKET_DEPENDENT: Globe,
};
const WARN_LABELS = new Set(["Unverified", "Limited", "Not Available"]);

// S05 (Doc01 §10) is for a claim the service could not verify. Scope,
// boundary and route replies (off-topic, other products, residency,
// roadmap, AI, competitors) also come back as ABSTAIN but are not S05.
const UNVERIFIED_REASONS = new Set(["NO_EVIDENCE", "CLAIM_CONFLICT", "EXPIRED_SOURCE", "SOURCE_REVOKED", "UNSUPPORTED_GUARANTEE", "VALIDATION_FAILED", "MARKET_NOT_COVERED"]);

function isUnverified(turn: TurnEnvelope): boolean {
  return turn.status === "ABSTAIN" && (!turn.reason || UNVERIFIED_REASONS.has(turn.reason));
}

/** Doc01 §10 S05 Uncertain offers "Retry, open source, handoff"; scope and
 * boundary replies are not S05, and retrying them repeats the same reply. */
function canRetry(turn: TurnEnvelope): boolean {
  return isUnverified(turn);
}

const REASONS: { value: FeedbackReason; label: string }[] = [
  { value: "incorrect", label: "Incorrect" },
  { value: "incomplete", label: "Incomplete" },
  { value: "not_relevant", label: "Not relevant" },
  { value: "unclear", label: "Unclear" },
];

function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Placeholder hosts (*.invalid, *.example, *.test, localhost) are never shown or linked. */
export function isPlaceholderUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  return /(^|\.)(invalid|example|test|localhost)$/.test(host) || host === "example.com" || host.endsWith(".example.com");
}

function failKind(e: PublicAIError): FailKind {
  if (e.kind === "http" && e.status === 429) return "rate_limited";
  if (e.kind === "http" && e.status === 409) return "busy";
  if (e.kind === "timeout") return "timeout";
  return "network";
}

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

function Badge({ icon: Icon, tone, children }: { icon: typeof Info; tone?: "warn"; children: ReactNode }) {
  return (
    <span className="za-badge" data-tone={tone}>
      <Icon size={14} aria-hidden />
      {children}
    </span>
  );
}

// S08: polite failure with retry, official help links and a correlation id.
function ErrorPanel(props: {
  text: string;
  links: ReactNode[];
  retryLabel: string;
  disabled: boolean;
  reference: string;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div data-testid="assistant-unavailable" className="za-bubble za-bubble-assistant" data-tone="error" role="group" aria-label="Assistant unavailable">
      <p style={{ display: "flex", gap: 6, margin: 0 }}>
        <TriangleAlert size={18} aria-hidden style={{ flex: "none", marginTop: 2 }} />
        {props.text}
      </p>
      {props.links.length > 0 && <div className="za-chips" style={{ marginTop: 8 }}>{props.links}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 }}>
        <button type="button" className="za-chip" disabled={props.disabled} onClick={props.onRetry}>
          <RotateCcw size={16} aria-hidden style={{ display: "inline", marginRight: 6, verticalAlign: "-3px" }} />
          {props.retryLabel}
        </button>
      </div>
      <p className="za-meta" style={{ marginTop: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }} data-testid="assistant-reference">
        <span style={{ whiteSpace: "nowrap" }}>Reference:</span>
        <code style={{ minWidth: 0, overflowWrap: "anywhere" }}>{props.reference}</code>
        <button
          type="button"
          className="za-thumb"
          aria-label={copied ? "Reference copied" : "Copy reference"}
          onClick={() => {
            void navigator.clipboard?.writeText(props.reference).then(
              () => setCopied(true),
              () => undefined,
            );
          }}
        >
          <Copy size={14} aria-hidden />
        </button>
        {copied && <span role="status">Copied</span>}
      </p>
    </div>
  );
}

// Kairos-style guided menu: the service's topic grid, then one topic's
// questions and "Back to Main Menu". Picking a question sends its fixed
// message like a typed one. Fallback chips (no /menu) send directly.
function TopicMenu(props: {
  topics: MenuTopic[];
  all: MenuTopic[];
  view: MenuView;
  disabled: boolean;
  showMore: boolean;
  copy: { main: string; back: string; more: string };
  onView: (v: MenuView) => void;
  onMore: () => void;
  onPick: (message: string) => void;
}) {
  const { view } = props;
  const topic = view.kind === "topic" ? props.all.find((x) => x.key === view.key) : undefined;
  if (!topic) {
    return (
      <div className="za-menublock" data-testid="assistant-menu">
        <p className="za-menu-heading">{props.copy.main}</p>
        <ul className="za-grid" aria-label="Suggested questions">
          {props.topics.map((tp) => (
            <li key={tp.key}>
              <button
                type="button"
                className="za-chip za-option"
                disabled={props.disabled}
                onClick={() => (tp.send ? props.onPick(tp.send) : props.onView({ kind: "topic", key: tp.key }))}
              >
                <span aria-hidden="true" className="za-option-icon">
                  {tp.icon}
                </span>
                <span className="za-option-label">{tp.label}</span>
              </button>
            </li>
          ))}
        </ul>
        {props.showMore && (
          <button type="button" className="za-linkbutton" style={{ marginTop: 4 }} onClick={props.onMore}>
            {props.copy.more}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="za-menublock" data-testid="assistant-menu">
      <p className="za-menu-heading">
        <span aria-hidden="true">{topic.icon}</span> {topic.label}
      </p>
      <ul className="za-grid" aria-label={`${topic.label} questions`}>
        {topic.questions.map((q) => (
          <li key={q.message}>
            <button type="button" className="za-chip za-option" disabled={props.disabled} onClick={() => props.onPick(q.message)}>
              <span className="za-option-label">{q.label}</span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="za-option za-option-back" onClick={() => props.onView({ kind: "main" })}>
            <ChevronLeft size={16} aria-hidden />
            {props.copy.back}
          </button>
        </li>
      </ul>
    </div>
  );
}

export function AssistantWidget({
  logos = { mark: LOGO_MARK_URL, full: LOGO_FULL_URL },
  pageContext = "other",
  launcherOffset = 0,
}: {
  logos?: AssistantLogos;
  pageContext?: string;
  /** LAUNCHER_BOTTOM_OFFSET (px): lifts the launcher above page chrome. */
  launcherOffset?: number;
}) {
  const [ui, dispatch] = useReducer(reduce, "S00_CLOSED");
  const [config, setConfig] = useState<PublicAIConfig | null>(null);
  // The service's guided menu (ADR-008); null until loaded or when it is off.
  const [serverMenu, setServerMenu] = useState<AssistantMenu | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [emptyHint, setEmptyHint] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreTopics, setMoreTopics] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [unread, setUnread] = useState(false);
  const [jump, setJump] = useState(false);
  const [online, setOnline] = useState(true);
  // Doc 02 §21 ui.timeout: the server session expired and a new one began,
  // so earlier context is gone ("no surprise persistence").
  const [sessionEnded, setSessionEnded] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [endRating, setEndRating] = useState<Feedback>({});
  const [theme, setTheme] = useState<Theme>("dark");
  // History lists this session's questions only; nothing outlives Clear chat.
  const [showHistory, setShowHistory] = useState(false);
  const [menuView, setMenuView] = useState<MenuView | null>(null);
  const session = useRef<Session | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const inFlight = useRef<string | null>(null); // turnId of the attempt awaiting a reply
  // Aborts the in-flight request on Stop, so the service cancels the model call (Doc 05 §12).
  const abortTurn = useRef<AbortController | null>(null);
  const shownSeq = useRef({ session: "", seq: 0 }); // highest turn_sequence shown (CT-014)
  const pushedHistory = useRef(false);
  const returnFocus = useRef(false);
  const atBottom = useRef(true);
  const savedScroll = useRef<number | null>(null);
  const pageScroll = useRef(0);
  const openRef = useRef(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const convo = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const panelId = useId();
  const isMobile = useMedia("(max-width: 767.98px)");
  const offset = useLauncherOffset(launcherOffset);

  const open = ui !== "S00_CLOSED";
  const sending = ui === "S03_WAITING";
  const t = (key: string) => config?.microcopy?.[key] ?? COPY[key] ?? "";
  const title = t("ui.header.title") || ASSISTANT_TITLE;
  const allStarters = (config?.chips?.[pageContext] ?? config?.chips?.other ?? STARTERS).slice(0, 6);
  const visibleCount = isMobile ? MOBILE_STARTERS : MAX_STARTERS;
  const menu = serverMenu ? menuFromServer(serverMenu) : menuFromChips(allStarters);
  const visibleTopics = moreTopics ? menu : menu.slice(0, visibleCount);
  const sensitive = looksSensitive(draft);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Theme: the visitor's saved choice, else the site's dark class or the OS
  // preference, read again on each open so it follows the page.
  useEffect(() => {
    if (!open) return;
    const init = () => {
      let saved: string | null = null;
      try {
        saved = window.localStorage.getItem(THEME_KEY);
      } catch {
        // storage blocked: fall through to the page's own theme
      }
      const pageDark = document.documentElement.classList.contains("dark") || window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(saved === "light" || saved === "dark" ? saved : pageDark ? "dark" : "light");
    };
    init();
  }, [open]);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setMoreOpen(false);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // not saved; the choice still applies for this page view
    }
  }

  // A menu opened mid-conversation: bring it into view.
  useEffect(() => {
    const el = convo.current;
    if (menuView && el && messagesRef.current.length > 0) el.scrollTop = el.scrollHeight;
  }, [menuView]);

  // All message changes go through update, which applies them to the ref
  // synchronously so async handlers always read the latest list.
  const update = useCallback((fn: (all: Message[]) => Message[]) => {
    const next = fn(messagesRef.current);
    messagesRef.current = next;
    setMessages(next);
  }, []);

  useEffect(() => {
    if (!open || config) return;
    loadAssistantConfig()
      .then((r) => r.ok && setConfig(r.data))
      .catch(() => undefined);
    // 404 while structured responses are off: the starter chips stay.
    loadAssistantMenu()
      .then((r) => r.ok && validMenu(r.data) && setServerMenu(r.data))
      .catch(() => undefined);
  }, [open, config]);

  // Offline detection (S08 banner).
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    on();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  // Focus on open: composer on desktop, heading on mobile (no unasked
  // keyboard). On close: back to the launcher.
  useEffect(() => {
    if (open) {
      if (window.matchMedia("(min-width: 768px) and (pointer: fine)").matches) composer.current?.focus();
      else heading.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      launcher.current?.focus();
    }
  }, [open]);

  // Scroll retention: restore where the visitor was when the panel reopens.
  useLayoutEffect(() => {
    if (open && convo.current && savedScroll.current !== null) {
      convo.current.scrollTop = savedScroll.current;
      savedScroll.current = null;
    }
  }, [open]);

  // Mobile: lock background scroll while the sheet is open and restore the
  // page position on close; keep the composer above the keyboard.
  useEffect(() => {
    if (!open || !isMobile) return;
    pageScroll.current = window.scrollY;
    document.documentElement.dataset.zaLock = "true";
    const vv = window.visualViewport;
    const onViewport = () => {
      if (!vv || !panel.current) return;
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      panel.current.style.setProperty("--za-kb-inset", `${inset}px`);
    };
    onViewport();
    vv?.addEventListener("resize", onViewport);
    vv?.addEventListener("scroll", onViewport);
    return () => {
      vv?.removeEventListener("resize", onViewport);
      vv?.removeEventListener("scroll", onViewport);
      delete document.documentElement.dataset.zaLock;
      window.scrollTo(0, pageScroll.current);
    };
  }, [open, isMobile]);

  const finishClose = useCallback(() => {
    if (convo.current) savedScroll.current = convo.current.scrollTop;
    returnFocus.current = true;
    setClosing(false);
    setMoreOpen(false);
    dispatch({ type: "CLOSE" });
  }, []);

  const close = useCallback(() => {
    if (pushedHistory.current) {
      pushedHistory.current = false;
      if (window.history.state?.zoikoAssistant) window.history.back();
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishClose();
      return;
    }
    setClosing(true);
    window.setTimeout(finishClose, MOTION_MS);
  }, [finishClose]);

  function openPanel() {
    setUnread(false);
    dispatch({ type: "OPEN", hasMessages: messagesRef.current.length > 0, waiting: inFlight.current !== null });
  }

  // W02: on small screens the device back button closes the sheet first.
  useEffect(() => {
    if (!open || !isMobile) return;
    window.history.pushState({ ...(window.history.state ?? {}), zoikoAssistant: true }, "");
    pushedHistory.current = true;
    const onPop = () => {
      pushedHistory.current = false;
      finishClose();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, isMobile, finishClose]);

  // Composer grows to four lines, then scrolls inside.
  useLayoutEffect(() => {
    const el = composer.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [draft, open]);

  function onConversationScroll() {
    const el = convo.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (atBottom.current) setJump(false);
  }

  function scrollToLatest() {
    const el = convo.current;
    if (el) el.scrollTop = el.scrollHeight;
    setJump(false);
    composer.current?.focus(); // the pill goes away: keep focus in the panel
  }

  // A new answer: show its START, unless the visitor scrolled up (then the
  // "Jump to latest" pill). A new question: follow it down.
  const lastCount = useRef(0);
  useLayoutEffect(() => {
    const el = convo.current;
    if (!el || messages.length === lastCount.current) return;
    const grew = messages.length > lastCount.current;
    lastCount.current = messages.length;
    if (!grew) return;
    const last = messages[messages.length - 1];
    if (last.role === "assistant") {
      if (!atBottom.current) {
        setJump(true);
        return;
      }
      const li = el.querySelector<HTMLElement>(`[data-msg="${CSS.escape(last.id)}"]`);
      if (li) el.scrollTop = Math.max(0, li.offsetTop - 8);
    } else {
      el.scrollTop = el.scrollHeight;
      atBottom.current = true;
    }
  }, [messages]);

  async function ensureSession(fresh = false): Promise<Session | null> {
    if (session.current && !fresh) return session.current;
    const r = await startAssistantSession(crypto.randomUUID());
    if (!r.ok) return null;
    session.current = { id: r.data.session_id, grant: r.data.session_grant };
    return session.current;
  }

  function setVisitor(id: string, patch: Partial<VisitorMessage>) {
    update((all) => all.map((m) => (m.role === "visitor" && m.id === id ? { ...m, ...patch } : m)));
  }

  function stop() {
    // S02 cancel: the request is aborted; the service cancels the model call,
    // frees the turn slot and stores nothing for it (Doc 05 §12).
    abortTurn.current?.abort();
    abortTurn.current = null;
    const stopped = messagesRef.current.find((m) => m.role === "visitor" && m.turnId === inFlight.current);
    inFlight.current = null;
    dispatch({ type: "CANCEL" });
    if (stopped) setVisitor(stopped.id, { state: "stopped" });
    update((m) => [...m, { id: crypto.randomUUID(), role: "notice", text: "Stopped. Ask again whenever you're ready." }]);
    setAnnounce("Stopped.");
    composer.current?.focus();
  }

  // attempt sends (or resends) one visitor message under its current
  // client_turn_id. fresh=true starts a new attempt id, used only when the
  // service has stored an answer for the old one.
  async function attempt(visitorId: string, fresh = false) {
    const msg = messagesRef.current.find((m): m is VisitorMessage => m.role === "visitor" && m.id === visitorId);
    if (!msg || inFlight.current) return;
    const turnId = fresh ? crypto.randomUUID() : msg.turnId;
    inFlight.current = turnId;
    setVisitor(visitorId, { turnId, state: "sending", fail: undefined });
    dispatch({ type: "SEND" });
    setAnnounce(t("ui.thinking"));
    const stillWanted = () => inFlight.current === turnId;
    const failed = (e: PublicAIError) => {
      if (!stillWanted()) return;
      // Doc01 §10 S08: a correlation id. The server's request id when there
      // is one, otherwise the client_turn_id this attempt was sent with.
      setVisitor(visitorId, { state: "failed", fail: { kind: failKind(e), reference: e.requestId ?? turnId, retryAfter: e.retryAfterSeconds } });
      dispatch({ type: "FAIL" });
      setAnnounce(failText(failKind(e)));
    };
    try {
      let s = await ensureSession();
      if (!s) return failed({ kind: "unreachable" });
      abortTurn.current = new AbortController();
      let r: PublicAIResult<TurnEnvelope> = await askAssistant(s.grant, s.id, turnId, msg.text, msg.market, pageContext, abortTurn.current.signal);
      if (!r.ok && r.error.kind === "http" && r.error.status === 401) {
        // Session expired: a new session needs a new turn id; same bubble.
        s = await ensureSession(true);
        setSessionEnded(true);
        setAnnounce(t("ui.timeout"));
        if (s) {
          const renewed = crypto.randomUUID();
          inFlight.current = renewed;
          setVisitor(visitorId, { turnId: renewed });
          r = await askAssistant(s.grant, s.id, renewed, msg.text, msg.market, pageContext, abortTurn.current?.signal);
          if (inFlight.current !== renewed) return;
          inFlight.current = turnId; // keep stillWanted() true for the shared exit below
        }
      }
      if (!stillWanted()) return;
      if (!r.ok) return failed(r.error);
      // Doc 05 §10: an unsupported schema version or unknown status is never shown.
      if (!validEnvelope(r.data)) return failed({ kind: "malformed" });
      const turn = r.data;
      // CT-014: a reply older than one already shown is out of order; never
      // render it over newer state (the server keeps the canonical order).
      if (shownSeq.current.session === s?.id && turn.turn_sequence < shownSeq.current.seq) return failed({ kind: "malformed" });
      shownSeq.current = { session: s?.id ?? "", seq: turn.turn_sequence };
      // Doc 01 §16 / Doc 06 §20: input the service classed as sensitive is
      // never re-displayed; the bubble keeps a neutral notice instead.
      setVisitor(visitorId, turn.reason === "SENSITIVE_INPUT" ? { state: "sent", text: SENSITIVE_REMOVED } : { state: "sent" });
      update((all) => {
        const reply: Message = { id: turn.turn_id, role: "assistant", turn, feedback: {}, replyTo: visitorId };
        const i = all.findIndex((m) => m.role === "assistant" && m.replyTo === visitorId);
        return i >= 0 ? all.map((m, j) => (j === i ? reply : m)) : [...all, reply];
      });
      dispatch({ type: "RESPONSE", status: turn.status });
      setAnnounce(`Assistant said: ${turn.status === "UNAVAILABLE" ? t("ui.unavailable") : turn.text}`);
      if (!openRef.current) setUnread(true); // a deliberate reply while closed
    } catch {
      failed({ kind: "unreachable" });
    } finally {
      if (stillWanted()) inFlight.current = null;
    }
  }

  // send adds ONE visitor bubble for a new question. typed is true for the
  // composer, where the empty and pre-send checks apply.
  function send(text: string, opts: { market?: string; typed?: boolean } = {}) {
    const message = text.trim();
    if (opts.typed && !message) {
      setEmptyHint(true);
      composer.current?.focus();
      return;
    }
    if (!message || inFlight.current || message.length > MAX_MESSAGE) return;
    if (opts.typed && looksSensitive(message)) return;
    const id = crypto.randomUUID();
    update((m) => [...m, { id, role: "visitor", text: message, market: opts.market, turnId: id, state: "sending" }]);
    if (opts.typed) setDraft("");
    setEmptyHint(false);
    setMenuView(null);
    void attempt(id);
  }

  // S09: the end card first; Clear chat there resets.
  function startEnd() {
    setMoreOpen(false);
    setEndRating({});
    dispatch({ type: "END" });
  }

  async function confirmClear() {
    const s = session.current;
    session.current = null;
    inFlight.current = null;
    update(() => []);
    setDraft("");
    setMoreTopics(false);
    setMenuView(null);
    setShowHistory(false);
    setSessionEnded(false);
    dispatch({ type: "RESET" });
    if (s) await endAssistantSession(s.grant, s.id).catch(() => undefined);
    heading.current?.focus();
  }

  function lastAnswerId(): string | undefined {
    return [...messagesRef.current].reverse().find((m) => m.role === "assistant")?.id;
  }

  async function rateEnd(rating: "useful" | "not_useful", reason: FeedbackReason = "") {
    setEndRating({ rating, reason });
    const s = session.current;
    const last = messagesRef.current.find((m) => m.role === "assistant" && m.id === lastAnswerId());
    if (!s || !last || last.role !== "assistant") return;
    const r = await rateAssistantAnswer(s.grant, s.id, last.turn.turn_id, rating, reason).catch(() => null);
    setEndRating({ rating, reason, sent: !!r?.ok });
  }

  function setFeedback(turnId: string, fb: Feedback) {
    update((all) => all.map((m) => (m.role === "assistant" && m.turn.turn_id === turnId ? { ...m, feedback: { ...m.feedback, ...fb } } : m)));
  }

  async function rate(turnId: string, rating: "useful" | "not_useful", reason: FeedbackReason = "") {
    const s = session.current;
    if (!s) return;
    setFeedback(turnId, { rating, reason, sent: false });
    const r = await rateAssistantAnswer(s.grant, s.id, turnId, rating, reason).catch(() => null);
    setFeedback(turnId, { sent: !!r?.ok });
  }

  function onRouteClick(routeKey: string) {
    // Doc05 §21: record the click (route-only; nothing is created).
    const s = session.current;
    if (s) void recordAssistantHandoff(s.grant, s.id, routeKey).catch(() => undefined);
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter is a newline, IME composition never sends.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      send(draft, { typed: true });
    }
  }

  // Escape closes (or the More menu first); on the mobile sheet Tab stays inside.
  function onPanelKey(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (moreOpen) setMoreOpen(false);
      else if (showHistory) setShowHistory(false);
      else close();
      return;
    }
    if (e.key !== "Tab" || !isMobile || !panel.current) return;
    const focusable = Array.from(
      panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Links resolve only through the signed registries, and never to placeholders.
  const routeUrl = (key: string) => {
    const url = config?.public_routes.find((r) => r.route_key === key)?.url;
    return url && !isPlaceholderUrl(url) ? url : undefined;
  };
  const citationOf = (urlKey: string) => config?.citation_links.find((c) => c.url_key === urlKey);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  function routeLink(key: string, label: string, primary: boolean, given?: string) {
    const url = given && !isPlaceholderUrl(given) ? given : routeUrl(key);
    if (!url) return null; // no real URL → no link and no CTA
    return (
      <a
        key={key}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onRouteClick(key)}
        className={primary ? "za-cta" : "za-chip"}
        style={primary ? undefined : { display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
      >
        {label}
        <ExternalLink size={16} aria-hidden />
        <span className="za-sr-only">(official ZoikoSuite page, opens in a new tab)</span>
      </a>
    );
  }

  const fallbackLinks = FALLBACK_ROUTES.map((r) => routeLink(r.key, r.label, false)).filter(Boolean);

  function failText(kind: FailKind): string {
    switch (kind) {
      case "rate_limited":
        return t("ui.error.rate_limited");
      case "busy":
        return t("ui.error.busy");
      case "timeout":
        return t("ui.error.timeout");
      default:
        return t("ui.error.unreachable");
    }
  }

  function qualifier(turn: TurnEnvelope) {
    // S05: an abstention without a governed label reads "Unverified".
    const label = turn.status_label ?? (isUnverified(turn) ? "Unverified" : undefined);
    const market = turn.market_code;
    if (!label && !market && !turn.draft) return null;
    const labelText = label ? t(`ui.status.${label}`) || label : "";
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
        {(label || market) && (
          <Badge icon={label ? (STATUS_ICONS[label] ?? Info) : Globe} tone={label && WARN_LABELS.has(label) ? "warn" : undefined}>
            <span className="za-sr-only">Status: </span>
            {label && market ? `${labelText} · ${market}` : labelText || regionName(market!)}
          </Badge>
        )}
        {turn.draft && (
          <Badge icon={FilePen}>
            <span className="za-sr-only">Note: </span>
            {t("ui.draft")}
          </Badge>
        )}
      </div>
    );
  }

  function chipList(label: string, chips: { label: string; onClick: () => void }[]) {
    return (
      <ul className="za-chips" aria-label={label}>
        {chips.map((c) => (
          <li key={c.label}>
            <button type="button" className="za-chip" disabled={sending} onClick={c.onClick}>
              {c.label}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  function feedbackRow(m: Extract<Message, { role: "assistant" }>) {
    if (m.feedback.sent) {
      return (
        <p className="za-meta" role="status">
          {t("ui.feedback.thanks")}
        </p>
      );
    }
    return (
      <div className="za-feedback">
        <span className="za-meta" style={{ marginRight: 4 }}>
          {t("ui.feedback.prompt")}
        </span>
        <button
          type="button"
          className="za-thumb"
          aria-pressed={m.feedback.rating === "useful"}
          aria-label="Yes, this was helpful"
          onClick={() => void rate(m.turn.turn_id, "useful")}
        >
          <ThumbsUp size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="za-thumb"
          aria-pressed={m.feedback.rating === "not_useful"}
          aria-label="No, this wasn't helpful"
          onClick={() => setFeedback(m.turn.turn_id, { rating: "not_useful" })}
        >
          <ThumbsDown size={16} aria-hidden />
        </button>
        {m.feedback.rating === "not_useful" &&
          chipList(
            "What was wrong?",
            REASONS.map((r) => ({ label: r.label, onClick: () => void rate(m.turn.turn_id, "not_useful", r.value) })),
          )}
      </div>
    );
  }

  function answer(m: Extract<Message, { role: "assistant" }>) {
    const turn = m.turn;
    const tone = turn.status === "REFUSED_ACTION" ? "warn" : undefined;
    const sources = Array.from(new Map(turn.citations.map((c) => [c.url_key, c])).values()).slice(0, 3);
    // The service's CTA when it sends one (ADR-008), else the first action.
    const primary = turn.cta?.primary;
    const cta = primary
      ? routeLink(primary.route_key, primary.label, true, primary.url)
      : turn.actions[0] && routeLink(turn.actions[0].route_key, ROUTE_LABELS[turn.actions[0].route_key] ?? "Open official page", true);
    const secondary = turn.cta?.secondary && routeLink(turn.cta.secondary.route_key, turn.cta.secondary.label, false, turn.cta.secondary.url);
    const asked = messages.find((x) => x.role === "visitor" && x.id === m.replyTo);
    const topic = turn.status === "ANSWERED" && asked?.role === "visitor" ? answerTitle(menu, turn.intent_id, asked.text) : undefined;
    return (
      <div className="za-row-assistant">
        <ZTile src={logos.mark} size={24} radius={6} className="za-avatar" />
        <div className="za-answer-col">
        <p className="za-speaker" aria-hidden="true">{ASSISTANT_LABEL}</p>
        <div data-testid="assistant-answer" data-status={turn.status} className="za-bubble za-bubble-assistant" data-tone={tone}>
          <span className="za-sr-only">Assistant said: </span>
          {topic && (
            <p className="za-card-title">
              <span aria-hidden="true">{topic.icon}</span> {topic.label}
            </p>
          )}
          {turn.status === "REFUSED_ACTION" && (
            <p className="za-meta" style={{ display: "flex", alignItems: "center", gap: 4, margin: "0 0 4px", fontWeight: 600 }}>
              <ShieldAlert size={14} aria-hidden />
              Not something I can do here
            </p>
          )}
          {isUnverified(turn) && (
            <p className="za-meta" style={{ display: "flex", alignItems: "center", gap: 4, margin: "0 0 4px", fontWeight: 600 }}>
              <CircleHelp size={14} aria-hidden />
              {t("ui.uncertain")}
            </p>
          )}
          <Markdown text={turn.text} />

          {qualifier(turn)}

          {turn.status === "CLARIFY" &&
            turn.clarification &&
            m.id === lastAssistant &&
            chipList(
              "Choose an answer",
              turn.clarification.options.map((opt) => {
                const label = opt === OVERVIEW_OPTION ? t("ui.clarify.overview") : opt === OTHER_OPTION ? t("ui.clarify.other") : regionName(opt);
                const market = opt === OVERVIEW_OPTION || opt === OTHER_OPTION ? undefined : opt;
                return { label, onClick: () => send(label, { market }) };
              }),
            )}

          {turn.suggestions &&
            turn.suggestions.length > 0 &&
            m.id === lastAssistant &&
            chipList(
              "Suggested questions",
              turn.suggestions.map((s) => ({ label: s.label, onClick: () => send(s.message) })),
            )}

          {sources.length > 0 && (
            <div className="za-section">
              <p className="za-meta" style={{ margin: 0 }}>
                Sources
              </p>
              <ul className="za-sources" data-testid="assistant-sources">
                {sources.map((c) => {
                  // The service resolves title and url (ADR-008); /config links cover older replies.
                  const link = citationOf(c.url_key);
                  const name = c.title || link?.title || "Approved ZoikoSuite source";
                  const raw = c.url || link?.url || "";
                  const url = raw && !isPlaceholderUrl(raw) ? raw : "";
                  return (
                    <li key={c.url_key}>
                      {url ? (
                        <a className="za-source" href={url} target="_blank" rel="noopener noreferrer">
                          <span>{name}</span>
                          <ExternalLink size={14} aria-hidden />
                          <span className="za-sr-only">(opens in a new tab)</span>
                        </a>
                      ) : (
                        <span className="za-source">{name}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* One primary CTA, only with a real URL from the signed route registry. */}
          {cta}
          {secondary && <div style={{ marginTop: 8 }}>{secondary}</div>}

          {turn.status === "HANDOFF" && turn.actions[0] && CHANNELS[turn.actions[0].route_key] && (
            <p className="za-meta za-channel">{CHANNELS[turn.actions[0].route_key]}</p>
          )}

          {canRetry(turn) && m.id === lastAssistant && (
            <div style={{ marginTop: 8 }}>
              <button type="button" className="za-chip" disabled={sending} onClick={() => void attempt(m.replyTo, true)}>
                <RotateCcw size={16} aria-hidden style={{ display: "inline", marginRight: 6, verticalAlign: "-3px" }} />
                {t("ui.retry")}
              </button>
            </div>
          )}

          {(turn.status === "ANSWERED" || turn.status === "ABSTAIN") && <div className="za-section">{feedbackRow(m)}</div>}
        </div>
        </div>
      </div>
    );
  }

  function menuBlock(view: MenuView) {
    return (
      <TopicMenu
        topics={messages.length === 0 ? visibleTopics : menu}
        all={menu}
        view={view}
        disabled={sending}
        showMore={messages.length === 0 && !moreTopics && menu.length > visibleCount}
        copy={{ main: t("ui.menu.main"), back: t("ui.menu.back"), more: t("ui.more_topics") }}
        onView={setMenuView}
        onMore={() => setMoreTopics(true)}
        onPick={send}
      />
    );
  }

  // After the latest answer: the service's approved follow-ups (never
  // chosen here), minus questions already asked, and the way back to the menu.
  function followUpBlock(m: Extract<Message, { role: "assistant" }>) {
    if (m.id !== lastAssistant || sending || menuView || ui === "S09_END") return null;
    if (m.turn.status === "CLARIFY" || m.turn.status === "UNAVAILABLE") return null;
    const asked = new Set(messages.flatMap((x) => (x.role === "visitor" ? [x.text.trim().toLowerCase()] : [])));
    const related = (m.turn.followups ?? []).filter((q) => !asked.has(q.message.trim().toLowerCase()));
    return (
      <div className="za-followups" data-testid="assistant-followups">
        <ul className="za-grid" aria-label={t("ui.menu.related")}>
          {related.map((q) => (
            <li key={q.message}>
              <button type="button" className="za-chip za-option" onClick={() => send(q.message)}>
                <span className="za-option-label">{q.label}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="za-option za-option-back" onClick={() => setMenuView({ kind: "main" })}>
              <LayoutGrid size={16} aria-hidden />
              {t("ui.menu.back")}
            </button>
          </li>
        </ul>
      </div>
    );
  }

  const endCard = (
    <div data-testid="assistant-end" className="za-bubble za-bubble-assistant" style={{ maxWidth: "100%", marginTop: 16 }} role="group" aria-label={t("ui.end.title")}>
      <p style={{ margin: 0, fontWeight: 600 }}>{t("ui.end.title")}</p>
      {endRating.sent ? (
        <p className="za-meta" role="status" style={{ marginTop: 8 }}>
          {t("ui.feedback.thanks")}
        </p>
      ) : (
        <div className="za-feedback" style={{ marginTop: 8 }}>
          <span className="za-meta" style={{ marginRight: 4 }}>
            {t("ui.end.prompt")}
          </span>
          <button type="button" className="za-thumb" aria-pressed={endRating.rating === "useful"} aria-label="Yes, this chat was helpful" onClick={() => void rateEnd("useful")}>
            <ThumbsUp size={16} aria-hidden />
          </button>
          <button
            type="button"
            className="za-thumb"
            aria-pressed={endRating.rating === "not_useful"}
            aria-label="No, this chat wasn't helpful"
            onClick={() => setEndRating({ rating: "not_useful" })}
          >
            <ThumbsDown size={16} aria-hidden />
          </button>
          {endRating.rating === "not_useful" &&
            chipList(
              "What was wrong?",
              REASONS.map((r) => ({ label: r.label, onClick: () => void rateEnd("not_useful", r.value) })),
            )}
        </div>
      )}
      <p className="za-meta" style={{ marginTop: 8 }}>
        {t("ui.clear.notice")}{" "}
        <button type="button" className="za-linkbutton" style={{ minHeight: 24, padding: 0 }} onClick={() => setShowPrivacy(true)}>
          {t("ui.retention.link")}
        </button>
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        <button type="button" className="za-chip" onClick={() => void confirmClear()}>
          {t("ui.clear")}
        </button>
        <button type="button" className="za-linkbutton" onClick={() => dispatch({ type: "TYPE" })}>
          {t("ui.end.keep")}
        </button>
      </div>
    </div>
  );

  const showWelcome = messages.length === 0;
  const showEnd = ui === "S09_END" && messages.length > 0;

  return (
    <div data-za-root="" data-za-theme={theme}>
      {/* Launcher: the Z tile itself. Open, it keeps the tile and shows a close badge. */}
      <button
        ref={launcher}
        type="button"
        onClick={() => (open ? close() : openPanel())}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t("ui.launcher.close") : t("ui.launcher.open")}
        title={open ? t("ui.launcher.close") : t("ui.launcher.open")}
        data-testid="assistant-launcher"
        className="za-launcher"
        style={{ ["--za-launcher-offset" as string]: `${offset}px` }}
      >
        <ZTile src={logos.mark} size={56} radius={16} />
        {open && (
          <span data-testid="launcher-close-badge" aria-hidden="true" className="za-close-badge">
            <X size={12} strokeWidth={3} />
          </span>
        )}
        {!open && unread && <span data-testid="launcher-unread" aria-hidden="true" className="za-unread" />}
        {!open && unread && <span className="za-sr-only">New reply</span>}
      </button>

      {open && (
        <section
          ref={panel}
          id={panelId}
          role="dialog"
          aria-modal={isMobile ? "true" : "false"}
          aria-label={ASSISTANT_TITLE}
          data-state={ui}
          data-expanded={expanded}
          data-closing={closing}
          onKeyDown={onPanelKey}
          className="za-panel"
          style={{ ["--za-launcher-offset" as string]: `${offset}px` }}
        >
          <div className="za-handle" aria-hidden="true" />
          <header className="za-header">
            <ZTile src={logos.mark} size={32} radius={8} className="za-header-tile" />
            <h2 ref={heading} tabIndex={-1} className="za-title">
              {title}
            </h2>
            <div className="za-controls">
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setShowHistory((v) => !v);
                }}
                aria-expanded={showHistory}
                aria-controls={`${panelId}-history`}
                className="za-control za-collapsible"
                aria-label={t("ui.history")}
                title={t("ui.history")}
              >
                <History aria-hidden />
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="za-control za-collapsible"
                aria-label={theme === "dark" ? t("ui.theme.light") : t("ui.theme.dark")}
                title={theme === "dark" ? t("ui.theme.light") : t("ui.theme.dark")}
              >
                {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
              </button>
              <span className="za-more">
                <button
                  type="button"
                  className="za-control za-menu-button"
                  aria-label={t("ui.menu")}
                  title={t("ui.menu")}
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((v) => !v)}
                >
                  <Menu aria-hidden />
                  <span className="za-menu-label" aria-hidden="true">
                    {t("ui.menu")}
                  </span>
                </button>
                {moreOpen && (
                  <div className="za-menu" role="menu" aria-label={t("ui.menu")}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        setMenuView({ kind: "main" });
                      }}
                    >
                      <LayoutGrid size={18} aria-hidden />
                      {t("ui.menu.topics")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="za-menu-folded"
                      onClick={() => {
                        setMoreOpen(false);
                        setShowHistory(true);
                      }}
                    >
                      <History size={18} aria-hidden />
                      {t("ui.history")}
                    </button>
                    <button type="button" role="menuitem" className="za-menu-folded" onClick={toggleTheme}>
                      {theme === "dark" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
                      {theme === "dark" ? t("ui.theme.light") : t("ui.theme.dark")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        setShowPrivacy(true);
                      }}
                    >
                      <Info size={18} aria-hidden />
                      {t("ui.privacy.title")}
                    </button>
                    <button type="button" role="menuitem" disabled={messages.length === 0} onClick={startEnd}>
                      <Trash2 size={18} aria-hidden />
                      {t("ui.clear")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="za-wide-only"
                      onClick={() => {
                        setMoreOpen(false);
                        setExpanded((v) => !v);
                      }}
                    >
                      {expanded ? <Minimize2 size={18} aria-hidden /> : <Maximize2 size={18} aria-hidden />}
                      {expanded ? "Minimize chat" : "Expand chat"}
                    </button>
                    <button type="button" role="menuitem" className="za-wide-only" onClick={close}>
                      <X size={18} aria-hidden />
                      {t("ui.launcher.close")}
                    </button>
                  </div>
                )}
              </span>
              <button type="button" onClick={close} className="za-control za-narrow-only" aria-label={t("ui.launcher.close")} title={t("ui.launcher.close")}>
                <X aria-hidden />
              </button>
            </div>
            <p data-testid="assistant-subtitle" className="za-subtitle">
              <Zap size={12} aria-hidden className="za-subtitle-icon" />
              <span className="za-subtitle-full">{t("ui.header.subtitle")}</span>
              <span className="za-subtitle-short">{t("ui.header.subtitle_short")}</span>
            </p>
          </header>

          {!online && (
            <div className="za-banner" data-tone="error" role="status" data-testid="assistant-offline">
              <WifiOff size={16} aria-hidden />
              {t("ui.offline")}
            </div>
          )}

          {sessionEnded && (
            <div className="za-banner" role="status" data-testid="assistant-session-ended">
              {t("ui.timeout")}
            </div>
          )}

          {showPrivacy && (
            <div
              id={`${panelId}-about`}
              role="region"
              aria-label={t("ui.privacy.title")}
              className="za-banner"
              style={{ display: "block", borderBottom: "1px solid var(--za-border)", background: "var(--za-surface-muted)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FullLogo src={logos.full} />
                <h3 style={{ flex: 1, margin: 0, fontSize: "var(--za-font-title)", fontWeight: 600 }}>{t("ui.privacy.title")}</h3>
                <button type="button" onClick={() => setShowPrivacy(false)} className="za-control" aria-label="Hide notice">
                  <X aria-hidden />
                </button>
              </div>
              <p style={{ margin: "8px 0 0" }}>{t("ui.privacy.body")}</p>
              <p style={{ margin: "8px 0 0" }}>{t("ui.privacy.retention")}</p>
              <p className="za-meta" style={{ margin: "8px 0 0" }}>
                {t("ui.clear.notice")}
              </p>
            </div>
          )}

          {showHistory && (
            <div id={`${panelId}-history`} role="region" aria-label={t("ui.history")} className="za-banner za-history" data-testid="assistant-history">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <History size={18} aria-hidden />
                <h3 style={{ flex: 1, margin: 0, fontSize: "var(--za-font-title)", fontWeight: 600 }}>{t("ui.history")}</h3>
                <button type="button" onClick={() => setShowHistory(false)} className="za-control" aria-label="Hide chat history">
                  <X aria-hidden />
                </button>
              </div>
              {messages.some((m) => m.role === "visitor") ? (
                <ol className="za-history-list">
                  {messages.map((m) =>
                    m.role === "visitor" ? (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setShowHistory(false);
                            const el = convo.current;
                            const li = el?.querySelector<HTMLElement>(`[data-msg="${CSS.escape(m.id)}"]`);
                            if (el && li) el.scrollTop = Math.max(0, li.offsetTop - 8);
                          }}
                        >
                          {m.text}
                        </button>
                      </li>
                    ) : null,
                  )}
                </ol>
              ) : (
                <p className="za-meta" style={{ margin: "8px 0 0" }}>
                  {t("ui.history.empty")}
                </p>
              )}
            </div>
          )}

          <div
            ref={convo}
            className="za-conversation"
            onScroll={onConversationScroll}
            data-testid="assistant-conversation"
            role="log"
            aria-live="off"
            aria-label="Conversation"
          >
            {showWelcome && (
              <div data-testid="assistant-welcome" className="za-welcome">
                {ui === "S09_END" && (
                  <p className="za-meta" role="status" style={{ marginBottom: 12 }}>
                    Chat cleared.
                  </p>
                )}
                <ZTile src={logos.mark} size={48} radius={12} />
                <p className="za-welcome-title">{title}</p>
                <p style={{ margin: "4px 0 0" }}>{t("ui.welcome.greeting")}</p>
                <p className="za-meta" style={{ margin: "4px 0 0" }}>
                  {t("ui.welcome.disclosure")}
                </p>
                {menuBlock(menuView ?? { kind: "main" })}
              </div>
            )}

            {/* Visual list only; answers are announced once each by the live region below. */}
            <ol className="za-list">
              {messages.map((m) => (
                <li key={m.id} data-msg={m.id} data-role={m.role}>
                  {m.role === "visitor" && (
                    <div className="za-row-visitor">
                      <p data-testid="visitor-bubble" data-state={m.state} className="za-bubble za-bubble-visitor" style={{ margin: 0 }}>
                        <span className="za-sr-only">You said: </span>
                        {m.text}
                      </p>
                      {m.state === "failed" && m.fail && (
                        <div style={{ alignSelf: "stretch", marginTop: 8 }}>
                          <ErrorPanel
                            text={failText(m.fail.kind)}
                            links={fallbackLinks}
                            retryLabel={t("ui.retry")}
                            disabled={sending}
                            reference={m.fail.reference}
                            onRetry={() => void attempt(m.id)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {m.role === "notice" && <p className="za-meta" style={{ fontStyle: "italic", margin: 0 }}>{m.text}</p>}
                  {m.role === "assistant" && m.turn.status === "UNAVAILABLE" && (
                    <ErrorPanel
                      text={t("ui.unavailable")}
                      links={fallbackLinks}
                      retryLabel={t("ui.retry")}
                      disabled={sending}
                      reference={m.turn.request_id}
                      onRetry={() => void attempt(m.replyTo, true)}
                    />
                  )}
                  {m.role === "assistant" && m.turn.status !== "UNAVAILABLE" && answer(m)}
                  {m.role === "assistant" && followUpBlock(m)}
                </li>
              ))}
            </ol>

            {!showWelcome && menuView && !sending && menuBlock(menuView)}

            {sending && (
              <div data-testid="assistant-thinking" className="za-meta" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                <span className="za-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span>{t("ui.thinking")}</span>
              </div>
            )}

            {showEnd && endCard}

            {jump && (
              <button type="button" className="za-jump" data-testid="assistant-jump" onClick={scrollToLatest}>
                <ArrowDown size={16} aria-hidden />
                {t("ui.jump")}
              </button>
            )}
          </div>

          <div className="za-sr-only" aria-live="polite" data-testid="assistant-announcer">
            {announce}
          </div>

          <form
            noValidate
            className="za-composer"
            onSubmit={(e) => {
              e.preventDefault();
              if (sending) stop();
              else send(draft, { typed: true });
            }}
          >
            {sensitive && (
              <div id={`${panelId}-sensitive`} role="alert" className="za-warning" data-testid="assistant-sensitive">
                <ShieldAlert size={16} aria-hidden style={{ flex: "none", marginTop: 2 }} />
                <span style={{ flex: 1 }}>{t("ui.sensitive.warning")}</span>
                <button type="button" className="za-linkbutton" style={{ minHeight: 24, padding: 0, color: "inherit" }} onClick={() => setDraft("")}>
                  {t("ui.sensitive.remove")}
                </button>
              </div>
            )}
            {emptyHint && !sensitive && (
              <p id={`${panelId}-empty`} role="alert" className="za-warning" style={{ margin: "0 0 8px" }}>
                {t("ui.empty")}
              </p>
            )}
            <label htmlFor={`${panelId}-composer`} className="za-sr-only">
              Message
            </label>
            <div className="za-input-row">
              <div className="za-input">
              <textarea
                id={`${panelId}-composer`}
                ref={composer}
                className="za-textarea"
                value={draft}
                rows={1}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (e.target.value.trim()) setEmptyHint(false);
                  dispatch({ type: "TYPE" });
                }}
                onKeyDown={onComposerKey}
                maxLength={MAX_MESSAGE}
                placeholder={t("ui.placeholder")}
                aria-invalid={sensitive || emptyHint}
                aria-describedby={[`${panelId}-privacy`, sensitive && `${panelId}-sensitive`, emptyHint && `${panelId}-empty`].filter(Boolean).join(" ")}
              />
              <button type="button" className="za-input-icon" disabled={messages.length === 0} onClick={startEnd} aria-label={t("ui.clear")} title={t("ui.clear")}>
                <Trash2 size={18} aria-hidden />
              </button>
              </div>
              {sending ? (
                <button type="submit" className="za-send" data-mode="stop" aria-label="Stop" title="Stop">
                  <Square size={16} aria-hidden />
                </button>
              ) : (
                <button type="submit" className="za-send" disabled={sensitive} aria-label="Send message" title="Send">
                  <Send size={20} aria-hidden />
                </button>
              )}
            </div>
            <p id={`${panelId}-privacy`} className="za-footer">
              <span className="za-footer-full">
                {t("ui.privacy")}{" "}
                <button type="button" className="za-linkbutton" style={{ minHeight: 24, padding: 0, fontSize: "inherit" }} onClick={() => setShowPrivacy(true)}>
                  {t("ui.privacy.link")}
                </button>
              </span>
              <span className="za-footer-compact">
                <button type="button" className="za-thumb" aria-label={t("ui.privacy.link")} onClick={() => setShowPrivacy(true)}>
                  <Info size={16} aria-hidden />
                </button>
              </span>
              {draft.length >= COUNTER_FROM && <span aria-live="polite"> {MAX_MESSAGE - draft.length} characters left.</span>}
            </p>
            <p className="za-strip" data-testid="assistant-strip">
              <span className="za-strip-dot" aria-hidden="true" />
              {ASSISTANT_LABEL} {t("ui.strip")}
            </p>
          </form>
        </section>
      )}
    </div>
  );
}
