"use client";

import { useActionState } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
  AlertTriangle,
  Search,
  Building,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from "@/components/ui";
import { FIELD, LABEL, HINT, BANNER_SUCCESS, BANNER_ERROR } from "@/components/admin/shared/form";
import { JsonBlock } from "@/components/admin/shared/JsonBlock";
import { ResultBanner } from "@/components/admin/shared/ResultBanner";
import {
  createIntercompanyAction,
  matchIntercompanyAction,
  disputeIntercompanyAction,
  lookupIntercompanyEntryAction,
  type IntercompanyActionState,
} from "@/app/admin/finance/intercompany-actions";
import { IDLE_LOOKUP, type LookupState } from "@/components/admin/shared/lookup";

const IDLE_ACTION: IntercompanyActionState = { status: "idle" };

export function IntercompanyPanel() {
  const [createState, createSubmit, createPending] = useActionState(
    createIntercompanyAction,
    IDLE_ACTION
  );

  const [matchState, matchSubmit, matchPending] = useActionState(
    matchIntercompanyAction,
    IDLE_ACTION
  );

  const [disputeState, disputeSubmit, disputePending] = useActionState(
    disputeIntercompanyAction,
    IDLE_ACTION
  );

  const [lookupState, lookupSubmit, lookupPending] = useActionState(
    lookupIntercompanyEntryAction,
    IDLE_LOOKUP
  );

  return (
    <div className="space-y-6">
      {/* ── Step 1: Create Intercompany Entry ──────────────────────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300">
              <ArrowLeftRight className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>1. Create Intercompany Entry (intercompany-accounting-svc :8105)</CardTitle>
              <CardDescription>
                ACC-11: Record reciprocal transaction balance between paired group legal entities. Lands in <code className="font-mono text-xs">UNMATCHED</code>.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={createSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="source_legal_entity_id" className={LABEL}>
                  Source Legal Entity ID (Originator)
                </label>
                <select id="source_legal_entity_id" name="source_legal_entity_id" defaultValue="11111111-1111-1111-1111-111111111111" className={FIELD}>
                  <option value="11111111-1111-1111-1111-111111111111">UK Operating Entity (11111111-1111-1111-1111-111111111111)</option>
                  <option value="22222222-2222-2222-2222-222222222222">US Operations Corp (22222222-2222-2222-2222-222222222222)</option>
                </select>
                <p className={HINT}>Entity issuing the intercompany debit</p>
              </div>

              <div>
                <label htmlFor="target_legal_entity_id" className={LABEL}>
                  Target Legal Entity ID (Counterparty)
                </label>
                <select id="target_legal_entity_id" name="target_legal_entity_id" defaultValue="22222222-2222-2222-2222-222222222222" className={FIELD}>
                  <option value="22222222-2222-2222-2222-222222222222">US Operations Corp (22222222-2222-2222-2222-222222222222)</option>
                  <option value="11111111-1111-1111-1111-111111111111">UK Operating Entity (11111111-1111-1111-1111-111111111111)</option>
                </select>
                <p className={HINT}>Must differ from source entity (chk_different_entities)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="source_journal_id" className={LABEL}>
                  Source Journal ID (UUID)
                </label>
                <input
                  id="source_journal_id"
                  name="source_journal_id"
                  defaultValue="3a1b2c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"
                  placeholder="Journal UUID"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
                <p className={HINT}>Posted journal in general-ledger-svc</p>
              </div>

              <div>
                <label htmlFor="amount" className={LABEL}>
                  Amount
                </label>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue="75000.00"
                  className={FIELD}
                  required
                />
                <p className={HINT}>Must be greater than 0.00</p>
              </div>

              <div>
                <label htmlFor="currency_code" className={LABEL}>
                  Currency
                </label>
                <select id="currency_code" name="currency_code" defaultValue="GBP" className={FIELD}>
                  <option value="GBP">GBP (£)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" loading={createPending} size="sm">
                <Building className="mr-1.5 h-4 w-4" />
                {createPending ? "Recording…" : "Record Intercompany Entry"}
              </Button>
            </div>

            {createState.status === "success" && (
              <div className={`flex flex-col gap-2 rounded-lg border p-4 text-sm ${BANNER_SUCCESS}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>{createState.message}</span>
                </div>
                {createState.entryId && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-semibold">Intercompany Entry ID:</span>
                    <code className="select-all rounded bg-emerald-100 px-2 py-1 font-mono text-xs font-bold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200">
                      {createState.entryId}
                    </code>
                  </div>
                )}
              </div>
            )}

            {createState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{createState.message}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Step 2: Reciprocal Balance Matching ────────────────────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <LinkIcon className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>2. Match Reciprocal Counterparty Journal</CardTitle>
              <CardDescription>
                Cross-checks the counterparty posting in <code className="font-mono text-xs">general-ledger-svc (:8098)</code>. Resolves to <code className="font-mono text-xs">MATCHED</code> or flags <code className="font-mono text-xs">MISMATCH</code>.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={matchSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="intercompany_entry_id" className={LABEL}>
                  Intercompany Entry ID (from Step 1)
                </label>
                <input
                  id="intercompany_entry_id"
                  name="intercompany_entry_id"
                  defaultValue={createState.entryId ?? ""}
                  placeholder="Paste Entry UUID"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
                <p className={HINT}>The entry being paired and reconciled</p>
              </div>

              <div>
                <label htmlFor="target_journal_id" className={LABEL}>
                  Counterparty Target Journal ID (UUID)
                </label>
                <input
                  id="target_journal_id"
                  name="target_journal_id"
                  defaultValue="7c8d9e0f-1a2b-3c4d-5e6f-7a8b9c0d1e2f"
                  placeholder="Target Journal UUID"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
                <p className={HINT}>The reciprocal credit/debit in general-ledger-svc</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" loading={matchPending} size="sm">
                <LinkIcon className="mr-1.5 h-4 w-4" />
                {matchPending ? "Evaluating…" : "Match Counterparty Journal"}
              </Button>
            </div>

            {matchState.status === "success" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_SUCCESS}`}>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{matchState.message}</span>
              </div>
            )}

            {matchState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{matchState.message}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Step 3: Dispute Handling (Negative / Exception Path) ─────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>3. Dispute Intercompany Transaction (Negative / Exception Test)</CardTitle>
              <CardDescription>
                Flag an intercompany transaction as <code className="font-mono text-xs">DISPUTED</code> when transfer pricing or allocation amounts conflict.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={disputeSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="dispute_entry_id" className={LABEL}>
                  Intercompany Entry ID
                </label>
                <input
                  id="dispute_entry_id"
                  name="dispute_entry_id"
                  defaultValue={createState.entryId ?? ""}
                  placeholder="Paste Entry UUID"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
              </div>

              <div>
                <label htmlFor="dispute_reason" className={LABEL}>
                  Dispute Reason / Audit Rationale
                </label>
                <input
                  id="dispute_reason"
                  name="dispute_reason"
                  defaultValue="Transfer pricing allocation discrepancy: FX rate spread exceeds agreed group collar"
                  className={FIELD}
                  required
                />
              </div>
            </div>

            <Button type="submit" loading={disputePending} size="sm" variant="secondary" className="border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300">
              <AlertTriangle className="mr-1.5 h-4 w-4" />
              {disputePending ? "Disputing…" : "Raise Dispute"}
            </Button>

            {disputeState.status === "success" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_SUCCESS}`}>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{disputeState.message}</span>
              </div>
            )}

            {disputeState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{disputeState.message}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Step 4: Audit Lookup & Verification ────────────────────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
              <Search className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>4. Look up Intercompany Entry Audit Record</CardTitle>
              <CardDescription>
                Direct query against <code className="font-mono text-xs">intercompany-accounting-svc (:8105)</code> to verify live database state, match status, and timestamps.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={lookupSubmit} className="space-y-4">
            <div>
              <label htmlFor="lookup_entry_id" className={LABEL}>
                Intercompany Entry ID (UUID)
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="lookup_entry_id"
                  name="lookup_entry_id"
                  defaultValue={createState.entryId ?? ""}
                  placeholder="Paste Intercompany Entry UUID"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
                <Button type="submit" size="sm" loading={lookupPending} className="shrink-0">
                  <Search className="mr-1.5 h-3.5 w-3.5" />
                  {lookupPending ? "Reading…" : "Look up Entry"}
                </Button>
              </div>
            </div>

            <ResultBanner tone={lookupState.status === "found" ? "success" : lookupState.status === "error" ? "error" : "neutral"} message={lookupState.message}>
              {lookupState.status === "found" && <JsonBlock value={lookupState.record} />}
            </ResultBanner>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
