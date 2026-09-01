import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { listClauses, listBoardResolutions, listCorporateActions } from "@/lib/api/legal";
import { FileCode, Vote, Briefcase } from "lucide-react";

export async function ClauseAndResolutionPanels() {
  const [clauseRes, resRes, actionRes] = await Promise.all([
    listClauses(),
    listBoardResolutions(),
    listCorporateActions(),
  ]);

  const clauses = clauseRes.ok ? clauseRes.data : [];
  const resolutions = resRes.ok ? resRes.data : [];
  const corpActions = actionRes.ok ? actionRes.data : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Clause Templates */}
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <FileCode className="h-4 w-4 text-blue-500" />
                Standard Clause Templates
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Approved standard language from clause-template-svc (:8120)
              </CardDescription>
            </div>
            <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              {clauses.length} Templates
            </span>
          </CardHeader>
          <CardContent>
            {clauses.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-800">
                <FileCode className="mb-2 h-6 w-6 text-slate-400" />
                No standard clauses found
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {clauses.map((c) => (
                  <div key={c.clause_id} className="py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{c.title}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {c.category}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{c.body}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Board Resolutions */}
        <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                <Vote className="h-4 w-4 text-emerald-500" />
                Board Resolutions & Voting
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Corporate governance records from board-resolutions-svc (:8122)
              </CardDescription>
            </div>
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              {resolutions.length} Recorded
            </span>
          </CardHeader>
          <CardContent>
            {resolutions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-800">
                <Vote className="mb-2 h-6 w-6 text-slate-400" />
                No board resolutions logged
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {resolutions.map((r) => (
                  <div key={r.resolution_id} className="flex items-center justify-between py-2.5 text-xs">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{r.title}</div>
                      <div className="text-slate-500 text-[11px]">{r.category} • ID: {r.resolution_id.slice(0, 8)}</div>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                        r.status === "PASSED"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Corporate Actions & Equity */}
      <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <Briefcase className="h-4 w-4 text-indigo-500" />
              Corporate Actions & Capital Structure
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Share issuances, dividends and splits from corporate-actions-svc (:8123)
            </CardDescription>
          </div>
          <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
            {corpActions.length} Actions
          </span>
        </CardHeader>
        <CardContent>
          {corpActions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800">
              No recent corporate actions filed
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {corpActions.map((ca) => (
                <div
                  key={ca.action_id}
                  className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-slate-100">
                    <span>{ca.action_type}</span>
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                      {ca.status}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-400 text-[11px]">{ca.description}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
