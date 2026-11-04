"use client";

// How a governed search result is rendered, wherever it is rendered.
//
// Moved out of SearchForms when the search box moved from the Search page to
// the top bar, so there is one rendering of a result and not two that can
// drift. Two rules from AB-001 live here and must survive any restyling:
//
//  - Withheld candidates are COUNTED, never named (TC-06). A suppression that
//    identified what was withheld would be an existence disclosure.
//  - Snippets are rendered as the service sent them. It escapes stored markup
//    first and only then adds its own <mark> tags, so escaping again here
//    would show the tags as text, and not escaping there would let stored
//    markup execute.

import { Badge } from "@/components/ui";
import { REASON_MEANINGS, type SearchResponse } from "@/lib/api/search";

export function ReasonBadge({ code }: { code?: string }) {
  if (!code) return null;
  return (
    <Badge tone="neutral" title={REASON_MEANINGS[code] ?? code}>
      {code} · {REASON_MEANINGS[code] ?? "refused"}
    </Badge>
  );
}

/** What the result set does not say on its face: what was withheld, and
 *  whether the total can be trusted. */
export function SearchOutcomeNotes({ response }: { response: SearchResponse }) {
  return (
    <>
      {response.suppressions && response.suppressions.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium">Withheld candidates</p>
          {response.suppressions.map((s) => (
            <p key={s.reason_code} className="text-xs">
              <span className="font-mono">{s.reason_code}</span> {s.meaning} — {s.count}
            </p>
          ))}
          <p className="text-xs opacity-80">
            Withheld records are not named. A suppression that identified them would be an existence
            disclosure.
          </p>
        </div>
      )}

      {!response.total_is_exact && (
        <p className="text-xs opacity-80">
          The total is approximate: once anything is withheld, the engine&apos;s count no longer
          describes what you may see, and adjusting it downward would say exactly how much you may
          not.
        </p>
      )}
    </>
  );
}

export function SearchResultList({ response }: { response: SearchResponse }) {
  return (
    <div className="space-y-2">
      {response.results.map((r) => (
        <div
          key={`${r.source_type}:${r.source_id}`}
          className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <code className="text-xs text-slate-500 dark:text-slate-400">
              {r.source_type}/{r.source_id}
            </code>
            <Badge tone="neutral">v{r.source_version}</Badge>
            <Badge tone="neutral">{r.retrieval_class}</Badge>
            {/* §7.1: index content is not a trusted current value for
                material records, so the reader must see which this is. */}
            <Badge tone={r.freshness === "SOURCE" ? "success" : "neutral"}>
              {r.freshness === "SOURCE" ? "current source" : "indexed copy"}
            </Badge>
          </div>

          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {Object.entries(r.fields).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                <dd className="min-w-0 truncate text-slate-800 dark:text-slate-200">{String(v)}</dd>
              </div>
            ))}
          </dl>

          {r.snippets &&
            Object.entries(r.snippets).map(([field, fragments]) => (
              <div key={field} className="mt-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">{field}</p>
                {fragments.map((f, i) => (
                  <p
                    key={i}
                    className="text-sm text-slate-700 [&_mark]:rounded [&_mark]:bg-amber-100 [&_mark]:px-0.5 dark:text-slate-300 dark:[&_mark]:bg-amber-500/20"
                    // Safe only because the service escaped the fragment before
                    // adding its own <mark> tags — see the note at the top.
                    dangerouslySetInnerHTML={{ __html: f }}
                  />
                ))}
              </div>
            ))}

          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Served by {r.index_generation}
          </p>
        </div>
      ))}
    </div>
  );
}
