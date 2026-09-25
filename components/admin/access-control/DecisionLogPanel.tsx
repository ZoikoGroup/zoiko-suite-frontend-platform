"use client";

import { useActionState, useState } from "react";
import { History, Search } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { CopyableId, ResultBanner } from "@/components/admin/shared";
import { CELL, FIELD, HEAD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { searchAccessDecisionsAction } from "@/app/admin/access-control/audit-actions";
import {
  EMPTY_DECISION_FILTERS,
  IDLE_DECISION_SEARCH,
  type DecisionSearchFilters,
  type DecisionSearchState,
} from "@/app/admin/access-control/state";
import { explainDecisionBasis } from "@/lib/api/authorization";
import { AccessDecisionSummary } from "./AccessDecisionSummary";

/**
 * Search the decision history.
 *
 * ── WHY THIS PANEL EXISTS ───────────────────────────────────────────────────
 *
 * The service records every permission check ever made, and the console could
 * read exactly one of them at a time, by reference. That is not a small gap
 * once you notice where a reference comes from: it is returned to the service
 * that was refused, and nowhere else. So "why was this person blocked last
 * Tuesday" began with somebody reading a different service's logs to find a
 * 36-character id to paste into the box next door. The lookup's own hint said
 * as much.
 *
 * The service's obligation is that denials be *retrievable*. By reference
 * alone they were not, and this is what closes that.
 *
 * ── THE ONE THING TO NOTICE ABOUT IT ────────────────────────────────────────
 *
 * A search that comes back empty is NOT the same as "nothing happened", and
 * the empty state says so at length rather than showing a bare "no results".
 * Checks made by services that do not yet identify their organisation are
 * recorded without one, and a record without an organisation is deliberately
 * not readable from inside one — it cannot be attributed. Somebody closing an
 * investigation on an empty table needs to know that.
 *
 * ── PAGING ──────────────────────────────────────────────────────────────────
 *
 * Newest first, and forward-only. The service pages by position rather than by
 * offset, so a check recorded while somebody is reading page one cannot shift
 * page two — a real hazard on a log that takes a row for every permission
 * check on the platform. The trade is that there is no jumping to page five
 * and no going back except by searching again, which for an audit read is the
 * right way round: correctness of the sequence matters and random access does
 * not.
 *
 * The filters are re-submitted with the cursor on every page, because a
 * position only means anything alongside the question that produced it.
 */

export function DecisionLogPanel({
  /** The session's own company, offered as a one-click filter so the common
   *  case needs no reference pasted. */
  legalEntityId,
}: {
  legalEntityId?: string;
}) {
  const [state, action, pending] = useActionState<DecisionSearchState, FormData>(
    searchAccessDecisionsAction,
    IDLE_DECISION_SEARCH,
  );

  // Which row is expanded. One at a time: the full explanation is several
  // paragraphs, and a table with every row open is not a table.
  const [openId, setOpenId] = useState<string | null>(null);

  // The cursor is form state rather than component state so that it travels
  // with the filters in one submission. Reset to "" by every control that
  // changes the question — continuing somebody else's page through a new
  // filter would return a different question's next page and look like an
  // answer to this one.
  const [cursor, setCursor] = useState("");

  const filters: DecisionSearchFilters =
    state.status === "searched" || state.status === "empty"
      ? state.filters
      : EMPTY_DECISION_FILTERS;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        {/* Carries the paging position. Hidden rather than a query parameter
            because this panel is one of several on the route and a URL-level
            cursor would be shared state between all of them. */}
        <input type="hidden" name="cursor" value={cursor} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="decision_principal_id" className={LABEL}>
              Who? <span className={OPTIONAL}>optional</span>
            </label>
            <input
              id="decision_principal_id"
              name="principal_id"
              defaultValue={filters.principalId}
              placeholder="00000000-0000-0000-0000-000000000000"
              className={cn(FIELD, "font-mono text-xs")}
              autoComplete="off"
              onChange={() => setCursor("")}
            />
            <p className={HINT}>
              A person&apos;s reference, to see everything they have been allowed and refused.
              Copy one from the grants register.
            </p>
          </div>

          <div>
            <label htmlFor="decision_outcome" className={LABEL}>
              Allowed or refused? <span className={OPTIONAL}>optional</span>
            </label>
            <select
              id="decision_outcome"
              name="decision_outcome"
              defaultValue={filters.outcome}
              className={FIELD}
              onChange={() => setCursor("")}
            >
              <option value="">Both</option>
              <option value="DENIED">Refused only</option>
              <option value="GRANTED">Allowed only</option>
            </select>
            <p className={HINT}>
              Refusals are the small minority of what is recorded and almost always what
              somebody is looking for.
            </p>
          </div>

          <div>
            <label htmlFor="decision_action_type" className={LABEL}>
              Which action? <span className={OPTIONAL}>optional</span>
            </label>
            <input
              id="decision_action_type"
              name="action_type"
              defaultValue={filters.actionType}
              placeholder="PAYMENT_APPROVE"
              className={cn(FIELD, "font-mono text-xs uppercase")}
              autoComplete="off"
              onChange={() => setCursor("")}
            />
            <p className={HINT}>Matched exactly. Case and spacing are normalised for you.</p>
          </div>

          <div>
            <label htmlFor="decision_legal_entity_id" className={LABEL}>
              Which company? <span className={OPTIONAL}>optional</span>
            </label>
            <input
              id="decision_legal_entity_id"
              name="legal_entity_id"
              defaultValue={filters.legalEntityId || legalEntityId || ""}
              placeholder="Every company"
              className={cn(FIELD, "font-mono text-xs")}
              autoComplete="off"
              onChange={() => setCursor("")}
            />
            <p className={HINT}>Defaults to yours. Clear it to search every company.</p>
          </div>

          <div>
            <label htmlFor="decided_from" className={LABEL}>
              From <span className={OPTIONAL}>optional</span>
            </label>
            <input
              id="decided_from"
              name="decided_from"
              type="date"
              defaultValue={filters.decidedFrom}
              className={FIELD}
              onChange={() => setCursor("")}
            />
            <p className={HINT}>Whole days, and this one is included.</p>
          </div>

          <div>
            <label htmlFor="decided_to" className={LABEL}>
              To <span className={OPTIONAL}>optional</span>
            </label>
            <input
              id="decided_to"
              name="decided_to"
              type="date"
              defaultValue={filters.decidedTo}
              className={FIELD}
              onChange={() => setCursor("")}
            />
            <p className={HINT}>
              Included as well — a whole day, not up to its first second.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            <Search className="h-4 w-4" aria-hidden="true" />
            {pending ? "Searching…" : "Search the history"}
          </Button>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Reads the record. Nothing is written and nobody&apos;s access changes — unlike the
            check above, which records every question it asks.
          </p>
        </div>
      </form>

      {state.status === "invalidFilter" && (
        <ResultBanner tone="warning" message={state.message} />
      )}
      {state.status === "unauthorized" && <ResultBanner tone="error" message={state.message} />}
      {state.status === "error" && <ResultBanner tone="error" message={state.message} />}
      {state.status === "empty" && <ResultBanner tone="neutral" message={state.message} />}

      {state.status === "searched" && (
        <div className="space-y-3">
          <ResultBanner tone="neutral" message={state.message} />

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th scope="col" className={cn(HEAD, "text-left")}>
                    When
                  </th>
                  <th scope="col" className={cn(HEAD, "text-left")}>
                    Who
                  </th>
                  <th scope="col" className={cn(HEAD, "text-left")}>
                    Action
                  </th>
                  <th scope="col" className={cn(HEAD, "text-left")}>
                    Answer
                  </th>
                  <th scope="col" className={cn(HEAD, "text-right")}>
                    <span className="sr-only">Explain</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {state.decisions.map((decision) => {
                  const basis = explainDecisionBasis(decision.decision_basis);
                  const refused = decision.decision_outcome !== "GRANTED";
                  const open = openId === decision.access_decision_id;

                  return [
                    <tr key={decision.access_decision_id}>
                      <td className={cn(CELL, "whitespace-nowrap")}>
                        {formatDateTime(decision.decided_at)}
                      </td>
                      <td className={CELL}>
                        <CopyableId value={decision.principal_id} />
                      </td>
                      <td className={cn(CELL, "font-mono text-xs")}>{decision.action_type}</td>
                      <td className={CELL}>
                        {/* The plain-English label, not the stored basis. A
                            bare "sod:conflict_with=PAYMENT_INITIATE" in a
                            table cell is not an explanation — the stored
                            value is kept, in the expanded row. */}
                        <Badge tone={refused ? "danger" : "success"}>{basis.label}</Badge>
                      </td>
                      <td className={cn(CELL, "text-right")}>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setOpenId(open ? null : decision.access_decision_id)
                          }
                          aria-expanded={open}
                        >
                          {open ? "Hide" : "Why?"}
                        </Button>
                      </td>
                    </tr>,
                    open ? (
                      <tr key={decision.access_decision_id + ":why"}>
                        <td colSpan={5} className="bg-slate-50/70 px-4 py-4 dark:bg-slate-800/40">
                          {/* The same component the by-reference lookup uses,
                              so one decision cannot be explained two
                              different ways depending on how it was found. */}
                          <AccessDecisionSummary decision={decision} />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>

          {state.nextCursor ? (
            <form action={action} className="flex items-center gap-3">
              {/* The filters travel with the cursor. A position is only
                  meaningful alongside the question that produced it, so
                  paging re-sends the whole question rather than the cursor
                  alone. */}
              <input type="hidden" name="cursor" value={state.nextCursor} />
              <input type="hidden" name="principal_id" value={filters.principalId} />
              <input type="hidden" name="decision_outcome" value={filters.outcome} />
              <input type="hidden" name="action_type" value={filters.actionType} />
              <input type="hidden" name="legal_entity_id" value={filters.legalEntityId} />
              <input type="hidden" name="decided_from" value={filters.decidedFrom} />
              <input type="hidden" name="decided_to" value={filters.decidedTo} />
              <Button type="submit" variant="secondary" disabled={pending}>
                <History className="h-4 w-4" aria-hidden="true" />
                {pending ? "Loading…" : "Show older checks"}
              </Button>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Forward only — search again to start from the newest.
              </p>
            </form>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              That is the oldest recorded check matching this search.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

