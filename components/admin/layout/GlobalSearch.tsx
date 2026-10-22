"use client";

// The top-bar search box — search-indexer-svc's governed search, on every page.
//
// It replaces a decorative input that searched nothing. The rules it keeps all
// come from AB-001, and each one is a reason this is not a type-ahead:
//
//  - Search runs on Enter, never per keystroke. Autocomplete "follows the same
//    security boundary as full search" and is "separately budgeted", and every
//    search here is a governed access that writes its own evidence row. A
//    keystroke stream would be one evidence row per letter.
//  - One surface at a time. Cross-domain global search is a named surface of
//    its own in the spec, not something the console may assemble by querying
//    every surface and merging the counts.
//  - A partial result set is amber, never green (INV-24), and withheld
//    candidates are counted, never named (TC-06) — SearchResults.tsx.
//
// The surface list is read the first time the box is used, not on every page
// render: a search-indexer-svc outage must not slow pages that never search.

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { Loader2, Search, Settings2, X } from "lucide-react";
import { ResultBanner, type BannerTone } from "@/components/admin/shared";
import { ReasonBadge, SearchOutcomeNotes, SearchResultList } from "@/components/admin/search/SearchResults";
import { loadSearchSurfaces, submitSearch, type SearchSurfaceOption } from "@/app/admin/search/actions";
import { IDLE_SEARCH, type SearchState } from "@/app/admin/search/state";

const REMEMBERED_SURFACE = "zoiko_search_surface";

function readRemembered(): string {
  try {
    return window.localStorage.getItem(REMEMBERED_SURFACE) ?? "";
  } catch {
    return "";
  }
}

function remember(scope: string) {
  try {
    window.localStorage.setItem(REMEMBERED_SURFACE, scope);
  } catch {
    // A blocked store only means the choice is not remembered.
  }
}

function toneOf(state: SearchState): BannerTone {
  switch (state.status) {
    case "ok":
      return "success";
    case "partial":
    case "refused":
      return "warning";
    case "error":
      return "error";
    default:
      return "neutral";
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function GlobalSearch() {
  const [state, action, pending] = useActionState(submitSearch, IDLE_SEARCH);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("");
  const [surfaces, setSurfaces] = useState<SearchSurfaceOption[] | null>(null);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  const [loadingSurfaces, startLoading] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formId = useId();

  function ensureSurfaces() {
    if (surfaces !== null || loadingSurfaces) return;
    startLoading(async () => {
      const result = await loadSearchSurfaces();
      if (!result.ok) {
        setSurfaceError(result.message);
        setSurfaces([]);
        return;
      }
      setSurfaceError(null);
      setSurfaces(result.surfaces);
      const remembered = readRemembered();
      setScope(
        result.surfaces.some((s) => s.scope === remembered)
          ? remembered
          : (result.surfaces[0]?.scope ?? ""),
      );
    });
  }

  // "/" or Ctrl/Cmd+K focuses the box from anywhere that is not already a
  // field — the two shortcuts people expect of a search box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const slash = e.key === "/" && !isTypingTarget(e.target);
      const commandK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (slash || commandK) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const response = state.response;
  const noSurfaces = surfaces !== null && surfaces.length === 0;

  return (
    <div ref={containerRef} className="relative hidden max-w-xl flex-1 sm:block">
      {/* Controlled inputs: a form with an action is reset when the action
          finishes, and a search box that cleared itself after every search
          would make refining a query impossible. */}
      <form
        id={formId}
        role="search"
        action={action}
        onSubmit={() => setOpen(true)}
        className="flex items-center rounded-lg border border-slate-200 bg-slate-50 transition-colors focus-within:border-navy-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-navy-500/15 dark:border-slate-700 dark:bg-slate-800/60 dark:focus-within:border-navy-400 dark:focus-within:bg-slate-800"
      >
        <input type="hidden" name="snippets" value="on" />
        <select
          name="scope"
          aria-label="Search surface"
          value={scope}
          onFocus={ensureSurfaces}
          onPointerDown={ensureSurfaces}
          onChange={(e) => {
            setScope(e.target.value);
            remember(e.target.value);
          }}
          className="h-9 max-w-38 shrink-0 truncate rounded-l-lg border-r border-slate-200 bg-transparent pl-2 pr-1 text-xs text-slate-600 outline-none dark:border-slate-700 dark:text-slate-300"
        >
          {surfaces === null && <option value="">{loadingSurfaces ? "Loading…" : "Surface"}</option>}
          {noSurfaces && <option value="">None serving</option>}
          {surfaces?.map((s) => (
            <option key={s.scope} value={s.scope}>
              {s.scope}
            </option>
          ))}
        </select>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            ref={inputRef}
            type="search"
            name="query"
            aria-label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Focus alone is not enough: a page without window focus gets no
            // focus event for el.focus(), so the first keystroke or click also
            // asks for the surface list.
            onFocus={ensureSurfaces}
            onPointerDown={ensureSurfaces}
            onKeyDown={ensureSurfaces}
            minLength={2}
            required
            autoComplete="off"
            placeholder="Search…  ( / )"
            className="h-9 w-full bg-transparent pl-8 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200 dark:placeholder:text-slate-500"
          />
        </div>
        {/* Never disabled for a missing surface: the action answers "choose a
            search surface", which says why, where a dead Enter key says nothing. */}
        <button type="submit" className="sr-only" disabled={pending}>
          Search
        </button>
      </form>

      {open && (
        <div
          role="region"
          aria-label="Search results"
          aria-live="polite"
          className="absolute left-0 top-full z-40 mt-2 max-h-[70vh] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {state.submitted?.scope ? `Results in ${state.submitted.scope}` : "Search"}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close search results"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {noSurfaces ? (
            // An unreachable service is an error; an empty catalogue is a
            // state the admin page explains — so the two get different tones.
            <ResultBanner
              tone={surfaceError ? "error" : "warning"}
              message={
                surfaceError ??
                "No search surface is serving yet. A surface needs a published index contract and an active generation."
              }
            />
          ) : pending ? (
            <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </p>
          ) : (
            <div className="space-y-3">
              <ResultBanner tone={toneOf(state)} message={state.message}>
                {state.reasonCode && <ReasonBadge code={state.reasonCode} />}
                {response && <SearchOutcomeNotes response={response} />}
              </ResultBanner>
              {response && response.results.length > 0 && <SearchResultList response={response} />}
              {response?.next_cursor && (
                // Submits the same form with the cursor added. The cursor is
                // bound to this query and surface, so changing either first is
                // refused (ESR-015) rather than paging through something else.
                <button
                  type="submit"
                  form={formId}
                  name="cursor"
                  value={response.next_cursor}
                  className="text-xs font-medium text-navy-700 hover:underline dark:text-navy-300"
                >
                  Next {response.results.length} results
                </button>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
            <span className="text-slate-400 dark:text-slate-500">
              Each search is recorded as governed access; the query is kept as a digest, not text.
            </span>
            <Link
              href="/admin/search"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 font-medium text-navy-700 hover:underline dark:text-navy-300"
            >
              <Settings2 className="h-3.5 w-3.5" /> Manage search
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
