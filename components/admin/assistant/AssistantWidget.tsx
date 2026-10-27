"use client";

// ZoikoSuite public assistant widget (Suivo, Release R0).
//
// Doc 01 §06–§11 (layout, states S00–S09), Doc 02 §21 microcopy, Doc 07 §15
// (WCAG 2.2 AA): non-modal panel with no focus trap, Escape closes and returns
// focus to the launcher, polite live region for new replies, 44×44 targets,
// motion only when the user allows it, full-screen sheet on small screens.
//
// Trust rules the UI keeps: links come only from the service's signed route
// and citation registries (never from answer text); the session grant stays in
// memory only; nothing claims a booking, ticket or callback.

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ExternalLink, Loader2, MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  askAssistant,
  endAssistantSession,
  loadAssistantConfig,
  startAssistantSession,
} from "@/app/admin/assistant/actions";
import type { PublicAIConfig, PublicAIError, TurnEnvelope } from "@/lib/api/public-ai";

type Message =
  | { id: string; role: "visitor"; text: string }
  | { id: string; role: "assistant"; turn: TurnEnvelope }
  | { id: string; role: "error"; text: string; retry?: string; requestId?: string };

type Session = { id: string; grant: string };

const MAX_MESSAGE = 2000;

const STARTERS: { label: string; message: string }[] = [
  { label: "Explore capabilities", message: "What modules does ZoikoSuite include?" },
  { label: "Compare plans", message: "What plans are available?" },
  { label: "Book a demo", message: "I'd like to book a demo" },
  { label: "Security & trust", message: "How is data secured?" },
];

const ROUTE_LABELS: Record<string, string> = {
  pricing: "View pricing",
  demo: "Book a demo",
  support: "Contact support",
  core_modules: "Explore modules",
  trust: "Open Trust Center",
  signup_or_trial: "Start a trial",
};

function errorText(e: PublicAIError): string {
  if (e.kind === "http" && e.status === 429) {
    return `You're sending messages quickly. Please wait ${e.retryAfterSeconds ?? "a few"} seconds and try again.`;
  }
  if (e.kind === "http" && e.status === 409) return "I'm still answering your previous message.";
  if (e.kind === "timeout") return "That took too long. Please try again.";
  return "I can't reach the assistant right now. Please try again, or use the official ZoikoSuite pages.";
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<PublicAIConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const session = useRef<Session | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const labelId = useId();

  const name = config?.assistant_display_name ?? "ZoikoSuite assistant";

  useEffect(() => {
    if (!open || config) return;
    loadAssistantConfig()
      .then((r) => r.ok && setConfig(r.data))
      .catch(() => undefined);
  }, [open, config]);

  useEffect(() => {
    if (open) composer.current?.focus();
  }, [open]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  const close = useCallback(() => {
    setOpen(false);
    launcher.current?.focus();
  }, []);

  async function ensureSession(fresh = false): Promise<Session | null> {
    if (session.current && !fresh) return session.current;
    const r = await startAssistantSession(crypto.randomUUID());
    if (!r.ok) return null;
    session.current = { id: r.data.session_id, grant: r.data.session_grant };
    return session.current;
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending || message.length > MAX_MESSAGE) return;
    setSending(true);
    setDraft("");
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "visitor", text: message }]);
    try {
      let s = await ensureSession();
      if (!s) {
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "error", text: errorText({ kind: "unreachable" }), retry: message }]);
        return;
      }
      const turnId = crypto.randomUUID();
      let r = await askAssistant(s.grant, s.id, turnId, message);
      if (!r.ok && r.error.kind === "http" && r.error.status === 401) {
        // Session expired: start a new one and try once more.
        s = await ensureSession(true);
        if (s) r = await askAssistant(s.grant, s.id, crypto.randomUUID(), message);
      }
      if (r.ok) {
        const turn = r.data;
        setMessages((m) => [...m, { id: turn.turn_id, role: "assistant", turn }]);
      } else {
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "error", text: errorText(r.error), retry: message, requestId: r.error.requestId }]);
      }
    } catch {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "error", text: errorText({ kind: "unreachable" }), retry: message }]);
    } finally {
      setSending(false);
      composer.current?.focus();
    }
  }

  async function endChat() {
    const s = session.current;
    session.current = null;
    setMessages([]);
    setDraft("");
    if (s) await endAssistantSession(s.grant, s.id).catch(() => undefined);
    composer.current?.focus();
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  }

  function routeUrl(key: string) {
    return config?.public_routes.find((r) => r.route_key === key)?.url;
  }

  function citationLink(urlKey: string) {
    return config?.citation_links.find((c) => c.url_key === urlKey);
  }

  return (
    <>
      <button
        ref={launcher}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
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
          <header className="flex items-start gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <div className="min-w-0 flex-1">
              <h2 id={labelId} className="truncate text-base font-semibold text-navy-900 dark:text-slate-100">
                {name}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">AI assistant. Product information only.</p>
            </div>
            <button
              type="button"
              onClick={() => void endChat()}
              disabled={messages.length === 0 || sending}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
              aria-label="End chat and clear conversation"
              title="End chat"
            >
              <RotateCcw className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={close}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
              aria-label={`Close ${name}`}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite" aria-relevant="additions" aria-busy={sending}>
            {messages.length === 0 && (
              <div>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Hi — I can answer questions about ZoikoSuite&apos;s products, plans, integrations and security, using approved
                  ZoikoSuite information. I can&apos;t see your account.
                </p>
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Suggested questions">
                  {STARTERS.map((s) => (
                    <li key={s.label}>
                      <button
                        type="button"
                        onClick={() => void send(s.message)}
                        className="min-h-11 rounded-full border border-slate-300 px-4 text-sm text-navy-900 hover:border-navy-400 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
                      >
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
                  {m.role === "assistant" && (
                    <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                      <span className="sr-only">{name}: </span>
                      <p className="whitespace-pre-wrap">{m.turn.text}</p>
                      {m.turn.citations.length > 0 && (
                        <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Sources</p>
                          <ul className="mt-1 space-y-1">
                            {m.turn.citations.map((c) => {
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
                      {m.turn.actions.map((a) => {
                        const url = routeUrl(a.route_key);
                        if (!url) return null; // unpublished route → hide the CTA
                        return (
                          <a
                            key={a.route_key}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800 dark:bg-navy-600 dark:hover:bg-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2"
                          >
                            {ROUTE_LABELS[a.route_key] ?? "Open official page"}
                            <ExternalLink className="h-4 w-4" aria-hidden />
                            <span className="sr-only">(official ZoikoSuite page, opens in a new tab)</span>
                          </a>
                        );
                      })}
                    </div>
                  )}
                  {m.role === "error" && (
                    <div className="max-w-[90%] rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                      <p>{m.text}</p>
                      {m.requestId && <p className="mt-1 text-xs opacity-80">Reference: {m.requestId}</p>}
                      {m.retry && (
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() => {
                            setMessages((all) => all.filter((x) => x.id !== m.id));
                            void send(m.retry!);
                          }}
                          className="mt-2 min-h-11 rounded-lg px-3 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                        >
                          Try again
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
            {sending && (
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
                Checking approved ZoikoSuite sources…
              </p>
            )}
            <div ref={logEnd} />
          </div>

          <form
            className="border-t border-slate-200 px-3 pb-3 pt-2 dark:border-slate-700"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
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
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onComposerKey}
                rows={Math.min(4, Math.max(1, draft.split("\n").length))}
                maxLength={MAX_MESSAGE}
                placeholder="Ask about ZoikoSuite…"
                aria-describedby={`${panelId}-privacy`}
                className="min-h-11 flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={sending || draft.trim().length === 0}
                aria-label="Send message"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-white hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-navy-600 dark:hover:bg-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2"
              >
                {sending ? <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden /> : <Send className="h-5 w-5" aria-hidden />}
              </button>
            </div>
            <p id={`${panelId}-privacy`} className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              Please don&apos;t share passwords, codes, card, bank or ID numbers.
              {draft.length > MAX_MESSAGE - 200 && ` ${MAX_MESSAGE - draft.length} characters left.`}
            </p>
          </form>
        </section>
      )}
    </>
  );
}
