"use client";

import { useActionState } from "react";
import {
  ShieldCheck,
  FileCheck2,
  Undo2,
  Search,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Eye,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from "@/components/ui";
import { FIELD, LABEL, HINT, BANNER_SUCCESS, BANNER_ERROR } from "@/components/admin/shared/form";
import { JsonBlock } from "@/components/admin/shared/JsonBlock";
import { ResultBanner } from "@/components/admin/shared/ResultBanner";
import {
  createNoticeAction,
  recordConsentAction,
  withdrawConsentAction,
  lookupConsentStatus,
  setPreferenceAction,
  type ConsentActionState,
} from "@/app/admin/privacy/actions";
import { IDLE_LOOKUP, type LookupState } from "@/components/admin/shared/lookup";

const IDLE_CONSENT: ConsentActionState = { status: "idle" };

export function PrivacyPanels() {
  const [noticeState, noticeSubmit, noticePending] = useActionState(
    createNoticeAction,
    IDLE_CONSENT
  );

  const [consentState, consentSubmit, consentPending] = useActionState(
    recordConsentAction,
    IDLE_CONSENT
  );

  const [withdrawState, withdrawSubmit, withdrawPending] = useActionState(
    withdrawConsentAction,
    IDLE_CONSENT
  );

  const [lookupState, lookupSubmit, lookupPending] = useActionState(
    lookupConsentStatus,
    IDLE_LOOKUP
  );

  const [prefState, prefSubmit, prefPending] = useActionState(
    setPreferenceAction,
    IDLE_CONSENT
  );

  return (
    <div className="space-y-8">
      {/* ── Section 1: Record Consent ────────────────────────────────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>Record Subject Consent (privacy-consent-svc :8152)</CardTitle>
              <CardDescription>
                PRV-02: Capture purpose-bound, immutable consent grants and denials. Writes to append-only evidence log.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={consentSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label htmlFor="subject_ref" className={LABEL}>
                  Data Subject Reference
                </label>
                <input
                  id="subject_ref"
                  name="subject_ref"
                  defaultValue="subject-robert-chen@zoikosuite.com"
                  placeholder="e.g. employee/customer ID or email"
                  className={FIELD}
                  required
                />
                <p className={HINT}>The human principal or customer subject</p>
              </div>

              <div>
                <label htmlFor="purpose_id" className={LABEL}>
                  Purpose ID (PRV-01 Verified)
                </label>
                <input
                  id="purpose_id"
                  name="purpose_id"
                  defaultValue="11111111-2222-3333-4444-555555555555"
                  placeholder="e.g. 11111111-2222-3333-4444-555555555555"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
                <p className={HINT}>Direct Marketing (PRV-01 Published UUID)</p>
              </div>

              <div>
                <label htmlFor="action" className={LABEL}>
                  Consent Decision
                </label>
                <select id="action" name="action" defaultValue="GRANTED" className={FIELD}>
                  <option value="GRANTED">GRANTED (Affirmative Opt-in)</option>
                  <option value="DENIED">DENIED (Explicit Refusal)</option>
                </select>
                <p className={HINT}>Strict binary assertion</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="capture_channel" className={LABEL}>
                  Capture Channel
                </label>
                <select id="capture_channel" name="capture_channel" defaultValue="WEB_PORTAL" className={FIELD}>
                  <option value="WEB_PORTAL">WEB_PORTAL (User Account Center)</option>
                  <option value="MOBILE_APP">MOBILE_APP (Zoiko Authenticator)</option>
                  <option value="EMAIL_OPT_IN">EMAIL_OPT_IN (Double Opt-In Link)</option>
                  <option value="CONTRACT_SIGN">CONTRACT_SIGN (Legal Execution)</option>
                </select>
              </div>

              <div>
                <label htmlFor="notice_version_id" className={LABEL}>
                  Linked Privacy Notice Version ID <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  id="notice_version_id"
                  name="notice_version_id"
                  placeholder="Optional notice version UUID"
                  className={`${FIELD} font-mono text-xs`}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" loading={consentPending} size="sm">
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                {consentPending ? "Recording…" : "Record Consent"}
              </Button>
            </div>

            {consentState.status === "success" && (
              <div className={`flex flex-col gap-2 rounded-lg border p-4 text-sm ${BANNER_SUCCESS}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>{consentState.message}</span>
                </div>
                {consentState.receiptId && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-semibold">Receipt ID:</span>
                    <code className="select-all rounded bg-emerald-100 px-2 py-1 font-mono text-xs font-bold text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200">
                      {consentState.receiptId}
                    </code>
                  </div>
                )}
              </div>
            )}

            {consentState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{consentState.message}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Section 2: Withdraw Consent ──────────────────────────────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
              <Undo2 className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>Withdraw Consent (Right to Revoke)</CardTitle>
              <CardDescription>
                PRV-I10/I11: Withdrawal never deletes past evidence. It adds an immutable WithdrawalReceipt that resolves subsequent decisions to WITHDRAWN.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={withdrawSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="withdraw_receipt_id" className={LABEL}>
                  Consent Receipt ID (UUID to Revoke)
                </label>
                <input
                  id="withdraw_receipt_id"
                  name="consent_receipt_id"
                  defaultValue={consentState.receiptId ?? ""}
                  placeholder="Paste Consent Receipt ID"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
                <p className={HINT}>The specific grant being withdrawn</p>
              </div>

              <div>
                <label htmlFor="withdraw_channel" className={LABEL}>
                  Revocation Channel
                </label>
                <input
                  id="withdraw_channel"
                  name="channel"
                  defaultValue="PRIVACY_PREFERENCES_DASHBOARD"
                  className={FIELD}
                  required
                />
                <p className={HINT}>Channel where subject requested withdrawal</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" loading={withdrawPending} size="sm" variant="secondary">
                <Undo2 className="mr-1.5 h-4 w-4" />
                {withdrawPending ? "Revoking…" : "Withdraw Consent"}
              </Button>
            </div>

            {withdrawState.status === "success" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_SUCCESS}`}>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{withdrawState.message}</span>
              </div>
            )}

            {withdrawState.status === "error" && (
              <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${BANNER_ERROR}`}>
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{withdrawState.message}</span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Section 3: Resolve Consent Status ────────────────────────────────── */}
      <Card className="border-navy-200 dark:border-navy-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
              <Search className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>Resolve Consent Status & Audit Evidence</CardTitle>
              <CardDescription>
                Dynamically resolves the subject&apos;s lawful consent status from the immutable receipt ledger.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={lookupSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="lookup_subject" className={LABEL}>
                  Subject Reference
                </label>
                <input
                  id="lookup_subject"
                  name="subject_ref"
                  defaultValue="subject-robert-chen@zoikosuite.com"
                  placeholder="Subject email / ID"
                  className={FIELD}
                  required
                />
              </div>

              <div>
                <label htmlFor="lookup_purpose" className={LABEL}>
                  Purpose ID
                </label>
                <input
                  id="lookup_purpose"
                  name="purpose_id"
                  defaultValue="11111111-2222-3333-4444-555555555555"
                  placeholder="Purpose UUID"
                  className={`${FIELD} font-mono text-xs`}
                  required
                />
              </div>
            </div>

            <Button type="submit" size="sm" loading={lookupPending}>
              <Eye className="mr-1.5 h-4 w-4" />
              {lookupPending ? "Resolving…" : "Resolve Status"}
            </Button>

            <ResultBanner tone={lookupState.status === "found" ? "success" : lookupState.status === "error" ? "error" : "neutral"} message={lookupState.message}>
              {lookupState.status === "found" && <JsonBlock value={lookupState.record} />}
            </ResultBanner>
          </form>
        </CardContent>
      </Card>

      {/* ── Section 4: Privacy Notices & Preferences ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Notice Registration */}
        <Card className="border-navy-200 dark:border-navy-500/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300">
                <FileCheck2 className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Register Privacy Notice</CardTitle>
                <CardDescription>Register a new governed notice document.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form action={noticeSubmit} className="space-y-3">
              <div>
                <label htmlFor="locale" className={LABEL}>Locale</label>
                <input id="locale" name="locale" defaultValue="en-GB" className={FIELD} required />
              </div>
              <div>
                <label htmlFor="audience" className={LABEL}>Audience</label>
                <select id="audience" name="audience" defaultValue="CUSTOMERS" className={FIELD}>
                  <option value="CUSTOMERS">CUSTOMERS (External Users)</option>
                  <option value="EMPLOYEES">EMPLOYEES (Internal Workforce)</option>
                  <option value="SUPPLIERS">SUPPLIERS (Vendor Principals)</option>
                </select>
              </div>
              <div>
                <label htmlFor="content_hash" className={LABEL}>Content Hash (SHA-256)</label>
                <input id="content_hash" name="content_hash" defaultValue="sha256-gdpr-notice-v1-2026" className={`${FIELD} font-mono text-xs`} required />
              </div>
              <Button type="submit" size="sm" loading={noticePending}>
                {noticePending ? "Registering…" : "Register Notice"}
              </Button>
              {noticeState.message && (
                <p className={`text-xs mt-2 ${noticeState.status === "success" ? "text-emerald-600" : "text-rose-600"}`}>
                  {noticeState.message}
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Preference Assertion */}
        <Card className="border-navy-200 dark:border-navy-500/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300">
                <Sliders className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Subject Preference Assertion</CardTitle>
                <CardDescription>PRV-I12: Preferences tracked independent of consent.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form action={prefSubmit} className="space-y-3">
              <div>
                <label htmlFor="pref_subject" className={LABEL}>Subject Reference</label>
                <input id="pref_subject" name="subject_ref" defaultValue="subject-robert-chen@zoikosuite.com" className={FIELD} required />
              </div>
              <div>
                <label htmlFor="channel_or_purpose" className={LABEL}>Channel or Topic</label>
                <input id="channel_or_purpose" name="channel_or_purpose" defaultValue="MARKETING_EMAIL" className={FIELD} required />
              </div>
              <div>
                <label htmlFor="value" className={LABEL}>Preference Value</label>
                <select id="value" name="value" defaultValue="ENABLED" className={FIELD}>
                  <option value="ENABLED">ENABLED</option>
                  <option value="DISABLED">DISABLED</option>
                  <option value="UNSET">UNSET</option>
                </select>
              </div>
              <Button type="submit" size="sm" loading={prefPending}>
                {prefPending ? "Saving…" : "Save Preference"}
              </Button>
              {prefState.message && (
                <p className={`text-xs mt-2 ${prefState.status === "success" ? "text-emerald-600" : "text-rose-600"}`}>
                  {prefState.message}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
