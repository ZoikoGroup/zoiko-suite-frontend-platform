"use client";

// ZoikoSuite public assistant widget (public-ai-svc, Suivo Release R0).
//
// Doc 01 §06–§11 and master prompt §9: states S00–S09 run through the pure
// reducer in ./state.ts (S00 closed, S01 welcome, S02 composing, S03 waiting
// with cancel, S04 answered, S05 uncertain/clarify, S06 safety, S07
// escalation, S08 error or unavailable with retry + help + reference, S09
// end). W02 mobile back button closes the sheet first. Doc 02 §21 microcopy
// and the page-aware chips come from GET /config. Doc 07 §15 (WCAG 2.2 AA):
// non-modal panel with no focus trap, Escape closes and returns focus to the
// launcher, polite live region, 44×44 targets, status never shown by colour
// alone, motion only when allowed, full-screen sheet on small screens.
//
// Trust rules: links come only from the service's signed route and citation
// registries (never from answer text); the session grant lives in memory only;
// nothing claims a booking, ticket or callback; feedback is enums only; a
// draft that looks like a secret is stopped before it leaves the browser.

import { useCallback, useEffect, useId, useReducer, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  CircleCheck,
  CircleHelp,
  CircleSlash,
  Clock,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  MessageCircle,
  Send,
  ShieldAlert,
  Square,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  askAssistant,
  endAssistantSession,
  loadAssistantConfig,
  rateAssistantAnswer,
  recordAssistantHandoff,
  startAssistantSession,
} from "@/app/admin/assistant/actions";
import { OVERVIEW_OPTION, type Chip, type FeedbackReason, type PublicAIConfig, type PublicAIError, type TurnEnvelope } from "@/lib/api/public-ai";
import { looksSensitive, reduce } from "./state";

type Feedback = { rating?: "useful" | "not_useful"; reason?: FeedbackReason; sent?: boolean };

type Message =
  | { id: string; role: "visitor"; text: string }
  | { id: string; role: "assistant"; turn: TurnEnvelope; feedback: Feedback }
  | { id: string; role: "notice"; text: string }
  | { id: string; role: "error"; text: string; retry?: { text: string; market?: string }; requestId?: string };

type Session = { id: string; grant: string };

const MAX_MESSAGE = 2000;
const COUNTER_FROM = 1800;

// Fallbacks for when /config has not loaded; the service's copy wins.
const STARTERS: Chip[] = [
  { label: "Explore modules", message: "What modules does ZoikoSuite include?" },
  { label: "Pricing & trial", message: "What plans are available, and is there a free trial?" },
  { label: "Book a demo", message: "I'd like to book a demo" },
  { label: "Security & trust", message: "How is data secured?" },
  { label: "Integrations", message: "Which integrations does ZoikoSuite support?" },
  { label: "Get support", message: "I need help from support" },
];

const COPY: Record<string, string> = {
  "ui.header": "ZoikoSuite Assistant",
  "ui.disclosure": "AI assistant. Answers come from approved ZoikoSuite information only.",
  "ui.privacy": "Don't share passwords, payment, tax or account details.",
  "ui.placeholder": "Ask about ZoikoSuite…",
  "ui.welcome":
    "Hi, I can answer questions about ZoikoSuite's products, plans, integrations and security from approved ZoikoSuite information. I can't see your account.",
  "ui.thinking": "Checking approved sources…",
  "ui.clear": "Clear chat",
  "ui.clear.notice": "Clearing the chat ends this session in your browser. It doesn't erase records the service must keep under its retention policy.",
  "ui.sensitive.warning": "Looks like sensitive info. Please remove it before sending.",
  "ui.clarify.overview": "Show general overview",
  "ui.error.unreachable": "I can't reach the assistant right now. Please try again, or use the official ZoikoSuite pages.",
  "ui.error.timeout": "That took too long. Please try again.",
  "ui.error.busy": "I'm still finishing your previous message. Please try again in a moment.",
  "ui.error.rate_limited": "You're sending messages quickly. Please wait a moment and try again.",
  "ui.unavailable": "The assistant is unavailable right now. These official pages have the current information.",
  "ui.feedback.prompt": "Was this helpful?",
  "ui.feedback.thanks": "Thanks for the feedback.",
  "ui.privacy.title": "About this assistant",
  "ui.privacy.body":
    "This assistant uses AI to answer from approved, public ZoikoSuite information. It can't see or change any account. Please don't share personal, payment, tax or account details.",
};

const ROUTE_LABELS: Record<string, string> = {
  pricing: "Compare plans",
  demo: "Book a demo",
  support: "Open support",
  core_modules: "Explore modules",
  trust: "Open Trust Center",
  signup_or_trial: "Start a trial",
};

const STATUS_ICONS: Record<string, typeof Info> = {
  Available: CircleCheck,
  Implemented: CircleCheck,
  Limited: TriangleAlert,
  "Partner-Supported": Info,
  Planned: Clock,
  "In Validation": Clock,
  "Not Available": CircleSlash,
  Unverified: CircleHelp,
  Readiness: Info,
  "Current Architecture": Info,
  MARKET_DEPENDENT: Globe,
};

const REASONS: { value: FeedbackReason; label: string }[] = [
  { value: "incorrect", label: "Incorrect" },
  { value: "incomplete", label: "Incomplete" },
  { value: "not_relevant", label: "Not relevant" },
  { value: "unclear", label: "Unclear" },
];

const iconButton =
  "flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500";
const chipButton =
  "min-h-11 rounded-full border border-slate-300 px-4 text-sm text-navy-900 hover:border-navy-400 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500";

function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function Badge({ icon: Icon, children }: { icon: typeof Info; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </span>
  );
}

export function AssistantWidget() {
  const [ui, dispatch] = useReducer(reduce, "S00_CLOSED");
  const [config, setConfig] = useState<PublicAIConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [showPrivacy, setShowPrivacy] = useState(false);
  const session = useRef<Session | null>(null);
  const inFlight = useRef<string | null>(null); // id of the visitor message awaiting a reply
  const pushedHistory = useRef(false);
  const returnFocus = useRef(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const labelId = useId();

  const open = ui !== "S00_CLOSED";
  const sending = ui === "S03_WAITING";
  const t = (key: string) => config?.microcopy?.[key] ?? COPY[key] ?? "";
  const name = config?.assistant_display_name ?? t("ui.header");
  const starters = config?.chips?.other ?? config?.chips?.home ?? STARTERS;
  const sensitive = looksSensitive(draft);

  useEffect(() => {
    if (!open || config) return;
    loadAssistantConfig()
      .then((r) => r.ok && setConfig(r.data))
      .catch(() => undefined);
  }, [open, config]);

  useEffect(() => {
    if (open) {
      composer.current?.focus();
    } else if (returnFocus.current) {
      // After the panel has closed (the launcher is hidden on small screens
      // while the sheet is open), return focus to it.
      returnFocus.current = false;
      launcher.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  const close = useCallback(() => {
    returnFocus.current = true;
    dispatch({ type: "CLOSE" });
    if (pushedHistory.current) {
      pushedHistory.current = false;
      if (window.history.state?.zoikoAssistant) window.history.back();
    }
  }, []);

  function openPanel() {
    dispatch({ type: "OPEN", hasMessages: messages.length > 0, waiting: inFlight.current !== null });
  }

  // W02: on small screens the device back button closes the sheet first.
  useEffect(() => {
    if (!open || window.innerWidth >= 640) return;
    window.history.pushState({ ...(window.history.state ?? {}), zoikoAssistant: true }, "");
    pushedHistory.current = true;
    const onPop = () => {
      pushedHistory.current = false;
      returnFocus.current = true;
      dispatch({ type: "CLOSE" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  function errorText(e: PublicAIError): string {
    if (e.kind === "http" && e.status === 429) {
      return e.retryAfterSeconds ? `${t("ui.error.rate_limited")} (${e.retryAfterSeconds}s)` : t("ui.error.rate_limited");
    }
    if (e.kind === "http" && e.status === 409) return t("ui.error.busy");
    if (e.kind === "timeout") return t("ui.error.timeout");
    return t("ui.error.unreachable");
  }

  async function ensureSession(fresh = false): Promise<Session | null> {
    if (session.current && !fresh) return session.current;
    const r = await startAssistantSession(crypto.randomUUID());
    if (!r.ok) return null;
    session.current = { id: r.data.session_id, grant: r.data.session_grant };
    return session.current;
  }

  function stop() {
    // S03 cancel: the reply is discarded when it arrives. The service still
    // finishes the turn, so nothing is half-written on its side.
    inFlight.current = null;
    dispatch({ type: "CANCEL" });
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "notice", text: "Stopped. Ask again whenever you're ready." }]);
    composer.current?.focus();
  }

  // send posts one turn. typed is true for the composer, where the pre-send
  // check applies; chips and clarification options send fixed text.
  async function send(text: string, opts: { market?: string; typed?: boolean } = {}) {
    const message = text.trim();
    if (!message || inFlight.current || message.length > MAX_MESSAGE) return;
    if (opts.typed && looksSensitive(message)) return;
    const visitorId = crypto.randomUUID();
    inFlight.current = visitorId;
    dispatch({ type: "SEND" });
    if (opts.typed) setDraft("");
    setMessages((m) => [...m, { id: visitorId, role: "visitor", text: message }]);
    const stillWanted = () => inFlight.current === visitorId;
    const fail = (e: PublicAIError) => {
      if (!stillWanted()) return;
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "error", text: errorText(e), retry: { text: message, market: opts.market }, requestId: e.requestId },
      ]);
      dispatch({ type: "FAIL" });
    };
    try {
      let s = await ensureSession();
      if (!s) return fail({ kind: "unreachable" });
      let r = await askAssistant(s.grant, s.id, crypto.randomUUID(), message, opts.market);
      if (!r.ok && r.error.kind === "http" && r.error.status === 401) {
        s = await ensureSession(true); // session expired: start a new one, try once more
        if (s) r = await askAssistant(s.grant, s.id, crypto.randomUUID(), message, opts.market);
      }
      if (!stillWanted()) return;
      if (r.ok) {
        const turn = r.data;
        setMessages((m) => [...m, { id: turn.turn_id, role: "assistant", turn, feedback: {} }]);
        dispatch({ type: "RESPONSE", status: turn.status });
      } else {
        fail(r.error);
      }
    } catch {
      fail({ kind: "unreachable" });
    } finally {
      if (stillWanted()) {
        inFlight.current = null;
        composer.current?.focus();
      }
    }
  }

  async function endChat() {
    const s = session.current;
    session.current = null;
    inFlight.current = null;
    dispatch({ type: "END" });
    setMessages([]);
    setDraft("");
    if (s) await endAssistantSession(s.grant, s.id).catch(() => undefined);
    composer.current?.focus();
  }

  function setFeedback(turnId: string, fb: Feedback) {
    setMessages((all) => all.map((m) => (m.role === "assistant" && m.turn.turn_id === turnId ? { ...m, feedback: { ...m.feedback, ...fb } } : m)));
  }

  async function rate(turnId: string, rating: "useful" | "not_useful", reason: FeedbackReason = "") {
    const s = session.current;
    if (!s) return;
    setFeedback(turnId, { rating, reason, sent: false });
    const r = await rateAssistantAnswer(s.grant, s.id, turnId, rating, reason).catch(() => null);
    setFeedback(turnId, { sent: !!r?.ok });
  }

  function onRouteClick(routeKey: string) {
    // Doc 05 §21: record the click (route-only; nothing is created). The link
    // itself opens normally, so this never blocks navigation.
    const s = session.current;
    if (s) void recordAssistantHandoff(s.grant, s.id, routeKey).catch(() => undefined);
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft, { typed: true });
    }
  }

  const routeUrl = (key: string) => config?.public_routes.find((r) => r.route_key === key)?.url;
  const citationLink = (urlKey: string) => config?.citation_links.find((c) => c.url_key === urlKey);
  const supportUrl = routeUrl("support");
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  function routeLink(key: string, primary: boolean) {
    const url = routeUrl(key);
    if (!url) return null; // unpublished route → hide the CTA
    return (
      <a
        key={key}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onRouteClick(key)}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2",
          primary
            ? "bg-navy-900 text-white hover:bg-navy-800 dark:bg-navy-600 dark:hover:bg-navy-500"
            : "border border-slate-300 text-navy-900 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700",
        )}
      >
        {ROUTE_LABELS[key] ?? "Open official page"}
        <ExternalLink className="h-4 w-4" aria-hidden />
        <span className="sr-only">(official ZoikoSuite page, opens in a new tab)</span>
      </a>
    );
  }

  return (
    <>
      <button
        ref={launcher}
        type="button"
        onClick={() => (open ? close() : openPanel())}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? `Close ${name}` : "Chat with ZoikoSuite"}
        className={cn(
          "fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full",
          "bg-navy-900 text-white shadow-lg hover:bg-navy-800 dark:bg-navy-600 dark:hover:bg-navy-500",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2",
          "motion-safe:transition-transform motion-safe:hover:-translate-y-0.5",
          open && "max-sm:hidden",
        )}
      >
        {open ? <X className="h-6 w-6" aria-hidden /> : <MessageCircle className="h-6 w-6" aria-hidden />}
      </button>

      {open && (
        <section
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={labelId}
          data-state={ui}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900",
            "inset-0 sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[min(640px,calc(100vh-8rem))] sm:w-[400px]",
            "sm:rounded-2xl sm:border sm:border-slate-200 dark:sm:border-slate-700",
          )}
        >
          <header className="flex items-start gap-1 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <div className="min-w-0 flex-1">
              <h2 id={labelId} className="truncate text-base font-semibold text-navy-900 dark:text-slate-100">
                {name}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">{t("ui.disclosure")}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowPrivacy((v) => !v)}
              aria-expanded={showPrivacy}
              aria-controls={`${panelId}-about`}
              className={iconButton}
              aria-label={t("ui.privacy.title")}
              title={t("ui.privacy.title")}
            >
              <Info className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => void endChat()}
              disabled={messages.length === 0}
              className="min-h-11 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
            >
              {t("ui.clear")}
            </button>
            <button type="button" onClick={close} className={iconButton} aria-label={`Close ${name}`}>
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>

          {showPrivacy && (
            <div id={`${panelId}-about`} className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-start gap-2">
                <h3 className="flex-1 font-semibold text-navy-900 dark:text-slate-100">{t("ui.privacy.title")}</h3>
                <button type="button" onClick={() => setShowPrivacy(false)} className={cn(iconButton, "-m-2")} aria-label="Hide details">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <p className="mt-1 text-slate-700 dark:text-slate-300">{t("ui.privacy.body")}</p>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{t("ui.clear.notice")}</p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite" aria-relevant="additions" aria-busy={sending}>
            {messages.length === 0 && (
              <div>
                {ui === "S09_END" && (
                  <p className="mb-3 text-xs text-slate-600 dark:text-slate-400" role="status">
                    Chat cleared. {t("ui.clear.notice")}
                  </p>
                )}
                <p className="text-sm text-slate-700 dark:text-slate-300">{t("ui.welcome")}</p>
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Suggested questions">
                  {starters.map((s) => (
                    <li key={s.label}>
                      <button type="button" onClick={() => void send(s.message)} className={chipButton}>
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ol className="space-y-3">
              {messages.map((m) => (
                <li key={m.id} className={cn("flex", m.role === "visitor" ? "justify-end" : "justify-start")}>
                  {m.role === "visitor" && (
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-navy-900 px-3 py-2 text-sm text-white dark:bg-navy-600">
                      <span className="sr-only">You: </span>
                      {m.text}
                    </p>
                  )}
                  {m.role === "notice" && <p className="text-xs italic text-slate-500 dark:text-slate-400">{m.text}</p>}
                  {m.role === "assistant" && (
                    <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                      <span className="sr-only">{name}: </span>
                      {m.turn.status === "REFUSED_ACTION" && (
                        <p className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                          <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                          Not something I can do here
                        </p>
                      )}
                      <p className="whitespace-pre-wrap">{m.turn.text}</p>

                      {/* Qualifier: governed status and market, text + icon (never colour alone). */}
                      {(m.turn.status_label || m.turn.market_code) && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {m.turn.status_label && (
                            <Badge icon={STATUS_ICONS[m.turn.status_label] ?? Info}>
                              <span className="sr-only">Status: </span>
                              {t(`ui.status.${m.turn.status_label}`) || m.turn.status_label}
                            </Badge>
                          )}
                          {m.turn.market_code && (
                            <Badge icon={Globe}>
                              <span className="sr-only">Applies to: </span>
                              {regionName(m.turn.market_code)}
                            </Badge>
                          )}
                        </div>
                      )}

                      {m.turn.status === "CLARIFY" && m.turn.clarification && m.id === lastAssistant && (
                        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Choose an answer">
                          {m.turn.clarification.options.map((opt) => {
                            const label = opt === OVERVIEW_OPTION ? t("ui.clarify.overview") : regionName(opt);
                            return (
                              <li key={opt}>
                                <button
                                  type="button"
                                  disabled={sending}
                                  onClick={() => void send(label, opt === OVERVIEW_OPTION ? {} : { market: opt })}
                                  className={chipButton}
                                >
                                  {label}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {m.turn.citations.length > 0 && (
                        <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Sources</p>
                          <ul className="mt-1 space-y-1">
                            {m.turn.citations.slice(0, 3).map((c) => {
                              const link = citationLink(c.url_key);
                              return (
                                <li key={c.source_version_id} className="text-xs">
                                  {link ? (
                                    <a
                                      href={link.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex min-h-6 items-center gap-1 text-navy-700 underline underline-offset-2 hover:text-navy-900 dark:text-navy-300"
                                    >
                                      {link.title}
                                      <span className="text-slate-500 no-underline dark:text-slate-400">({new URL(link.url).hostname})</span>
                                      <ExternalLink className="h-3 w-3" aria-hidden />
                                      <span className="sr-only">(opens in a new tab)</span>
                                    </a>
                                  ) : (
                                    <span className="text-slate-600 dark:text-slate-400">{c.url_key}</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}

                      {/* At most one primary CTA, from the signed route registry. */}
                      {m.turn.actions.length > 0 && <div className="mt-3">{routeLink(m.turn.actions[0].route_key, true)}</div>}

                      {m.turn.status === "UNAVAILABLE" && (
                        <div className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-700">
                          <p className="text-xs text-slate-600 dark:text-slate-400">{t("ui.unavailable")}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {["pricing", "demo", "support"]
                              .filter((k) => !m.turn.actions.some((a) => a.route_key === k))
                              .map((k) => routeLink(k, false))}
                          </div>
                        </div>
                      )}

                      {(m.turn.status === "ANSWERED" || m.turn.status === "ABSTAIN") && (
                        <div className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-700">
                          {m.feedback.sent ? (
                            <p className="text-xs text-slate-600 dark:text-slate-400" role="status">
                              {t("ui.feedback.thanks")}
                            </p>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="mr-1 text-xs text-slate-600 dark:text-slate-400">{t("ui.feedback.prompt")}</span>
                              <button
                                type="button"
                                aria-pressed={m.feedback.rating === "useful"}
                                aria-label="Yes, this was helpful"
                                onClick={() => void rate(m.turn.turn_id, "useful")}
                                className={cn(iconButton, "h-9 w-9", m.feedback.rating === "useful" && "text-navy-700 dark:text-navy-300")}
                              >
                                <ThumbsUp className="h-4 w-4" aria-hidden />
                              </button>
                              <button
                                type="button"
                                aria-pressed={m.feedback.rating === "not_useful"}
                                aria-label="No, this wasn't helpful"
                                onClick={() => setFeedback(m.turn.turn_id, { rating: "not_useful" })}
                                className={cn(iconButton, "h-9 w-9", m.feedback.rating === "not_useful" && "text-navy-700 dark:text-navy-300")}
                              >
                                <ThumbsDown className="h-4 w-4" aria-hidden />
                              </button>
                              {m.feedback.rating === "not_useful" && (
                                <ul className="mt-1 flex w-full flex-wrap gap-1" aria-label="What was wrong?">
                                  {REASONS.map((r) => (
                                    <li key={r.value}>
                                      <button
                                        type="button"
                                        onClick={() => void rate(m.turn.turn_id, "not_useful", r.value)}
                                        className="min-h-9 rounded-full border border-slate-300 px-3 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
                                      >
                                        {r.label}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {m.role === "error" && (
                    <div className="max-w-[90%] rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                      <p className="flex items-start gap-1">
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        {m.text}
                      </p>
                      {m.requestId && <p className="mt-1 text-xs opacity-80">Reference: {m.requestId}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-3">
                        {m.retry && (
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => {
                              setMessages((all) => all.filter((x) => x.id !== m.id));
                              void send(m.retry!.text, { market: m.retry!.market });
                            }}
                            className="min-h-11 rounded-lg px-1 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                          >
                            Try again
                          </button>
                        )}
                        {supportUrl && (
                          <a
                            href={supportUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center gap-1 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                          >
                            Get help
                            <ExternalLink className="h-3 w-3" aria-hidden />
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            {sending && (
              <div className="mt-3 flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
                <span>{t("ui.thinking")}</span>
                <button
                  type="button"
                  onClick={stop}
                  className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-3 font-medium text-navy-700 hover:bg-slate-100 dark:text-navy-300 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
                >
                  <Square className="h-3.5 w-3.5" aria-hidden />
                  Stop
                </button>
              </div>
            )}
            <div ref={logEnd} />
          </div>

          <form
            className="border-t border-slate-200 px-3 pb-3 pt-2 dark:border-slate-700"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft, { typed: true });
            }}
          >
            <label htmlFor={`${panelId}-composer`} className="sr-only">
              Message
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id={`${panelId}-composer`}
                ref={composer}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  dispatch({ type: "TYPE" });
                }}
                onKeyDown={onComposerKey}
                rows={Math.min(4, Math.max(1, draft.split("\n").length))}
                maxLength={MAX_MESSAGE}
                placeholder={t("ui.placeholder")}
                aria-invalid={sensitive}
                aria-describedby={`${panelId}-privacy${sensitive ? ` ${panelId}-sensitive` : ""}`}
                className={cn(
                  "min-h-11 flex-1 resize-none rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-slate-100",
                  sensitive
                    ? "border-amber-500 focus:border-amber-500 focus:ring-amber-500"
                    : "border-slate-300 focus:border-navy-500 focus:ring-navy-500 dark:border-slate-600",
                )}
              />
              <button
                type="submit"
                disabled={sending || sensitive || draft.trim().length === 0}
                aria-label="Send message"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-navy-600 dark:hover:bg-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2"
              >
                {sending ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden /> : <Send className="h-5 w-5" aria-hidden />}
              </button>
            </div>
            {sensitive && (
              <p id={`${panelId}-sensitive`} role="alert" className="mt-2 flex items-start gap-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {t("ui.sensitive.warning")}
              </p>
            )}
            <p id={`${panelId}-privacy`} className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              {t("ui.privacy")}
              {draft.length >= COUNTER_FROM && (
                <span aria-live="polite"> {MAX_MESSAGE - draft.length} characters left.</span>
              )}
            </p>
          </form>
        </section>
      )}
    </>
  );
}
