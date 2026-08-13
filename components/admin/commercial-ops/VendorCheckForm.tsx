"use client";

import { useActionState } from "react";
import { ShieldAlert, ShieldQuestion, Search, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui";
import { CopyableId, ResultBanner, type BannerTone } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { startVendorDueDiligence } from "@/app/admin/commercial-ops/actions";
import {
  IDLE_VENDOR_CHECK_STATE,
  type VendorCheckActionState,
} from "@/app/admin/commercial-ops/state";
import { STUB_DENYLIST } from "@/lib/api/vendor-due-diligence";

/**
 * Tones for the four readings — and the one that matters is `screened-no-match`,
 * which is deliberately NOT `success`.
 *
 * Every other green banner in this console means an action succeeded and its
 * result can be relied on. A no-match here means the vendor's name was compared,
 * character for character, against a hardcoded list of two names, and did not
 * appear on it. Giving that the same green would put it on the same footing as a
 * genuine approval, and an operator reading a screen full of green has no way to
 * tell which is which.
 *
 * So it is `neutral`: recorded, honest, and visibly not an endorsement. `flagged`
 * is `warning` rather than `error` for the mirror-image reason — a match is the
 * control working, not the service failing. Red is reserved for having no result
 * at all, which `failed` and `unconcluded` both are.
 */
const TONE: Record<VendorCheckActionState["status"], BannerTone> = {
  idle: "neutral",
  "screened-no-match": "neutral",
  flagged: "warning",
  unconcluded: "error",
  failed: "error",
  replayed: "neutral",
  error: "error",
};

/**
 * What the screening actually did, in its own words.
 *
 * Shown for every outcome including a no-match. A screening that reports a
 * conclusion without saying what it compared is not auditable, and the operator's
 * next question is always "against what?" — which, here, has an uncomfortable
 * answer that they are entitled to.
 */
function ScreeningFacts({ detail }: { detail: NonNullable<VendorCheckActionState["detail"]> }) {
  return (
    <div className="space-y-2">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <div>
          <dt className="inline opacity-70">Screened: </dt>
          <dd className="inline font-medium">{detail.vendorName}</dd>
        </div>
        {detail.screeningBasis && (
          <div>
            <dt className="inline opacity-70">Basis: </dt>
            <dd className="inline font-medium">{detail.screeningBasis}</dd>
          </div>
        )}
        <div>
          <dt className="inline opacity-70">Evidence recorded: </dt>
          <dd className="inline font-medium tabular-nums">{detail.evidenceCount}</dd>
        </div>
        {detail.documentReference && (
          <div>
            <dt className="inline opacity-70">Document: </dt>
            <dd className="inline font-medium">{detail.documentReference}</dd>
          </div>
        )}
      </dl>

      {detail.screeningSource === STUB_DENYLIST && (
        <p className="flex items-start gap-1.5 text-xs opacity-80">
          <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Screened by <code className="font-mono">STUB_DENYLIST</code> — a hardcoded two-name list
          matched exactly, not a sanctions feed. No such feed exists on this platform yet, so this is
          the whole of the screening that ran.
        </p>
      )}
    </div>
  );
}

/**
 * Screen a counterparty before committing spend to it.
 *
 * Placed above the spend controls and the order flow on purpose: screening a
 * counterparty is the first question in the sequence, not a record kept afterwards.
 * A limit governs how much may be committed; this governs whether the party should
 * be committed to at all.
 */
export function VendorCheckForm() {
  const [state, action, pending] = useActionState<VendorCheckActionState, FormData>(
    startVendorDueDiligence,
    IDLE_VENDOR_CHECK_STATE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="vendor_name" className={LABEL}>
            Vendor name
          </label>
          <input
            id="vendor_name"
            name="vendor_name"
            required
            placeholder="Acme Cloud Infrastructure Inc"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            The only field actually screened, and matched exactly — so a trailing
            &ldquo;Ltd&rdquo; or a different spelling reads as no match. A blank name is refused
            rather than screened.
          </p>
        </div>

        <div>
          <label htmlFor="counterparty_id" className={LABEL}>
            Counterparty ID
          </label>
          <input
            id="counterparty_id"
            name="counterparty_id"
            required
            placeholder="33333333-3333-3333-3333-333333333333"
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            From counterparty-management-svc. The outcome is pushed onto this record — a match sets
            it REJECTED with risk HIGH.
          </p>
        </div>

        <div>
          <label htmlFor="document_reference" className={LABEL}>
            Document reference <span className={OPTIONAL}>(optional)</span>
          </label>
          <input
            id="document_reference"
            name="document_reference"
            placeholder="vault-doc-9f2c"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Supporting material held elsewhere, recorded on the evidence row. Left blank it is
            stored as absent, not as an empty reference.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {!pending && <Search className="h-3.5 w-3.5" aria-hidden="true" />}
          {pending ? "Screening…" : "Screen this counterparty"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Runs to completion in one request. The outcome and its evidence are written in a single
          transaction, so a conclusion can never outlive the evidence for it.
        </p>
      </div>

      <ResultBanner tone={TONE[state.status]} message={state.message}>
        <>
          {/* The readings whose tone alone cannot carry the meaning each get an
              explicit line. A no-match especially: neutral says "not green", but
              it does not say why. */}
          {state.status === "screened-no-match" && (
            <p className="flex items-start gap-1.5 text-xs opacity-80">
              <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Checked, not cleared — a no-match against a two-name list is not a sanctions
              clearance, and nothing here approves this counterparty.
            </p>
          )}
          {state.status === "flagged" && (
            <p className="flex items-start gap-1.5 text-xs opacity-80">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              The control worked. This is a finding, not a failure.
            </p>
          )}
          {(state.status === "failed" || state.status === "unconcluded") && (
            <p className="flex items-start gap-1.5 text-xs opacity-80">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              There is no outcome for this counterparty. Do not read the absence of a finding as the
              absence of a problem.
            </p>
          )}
          {state.detail && <ScreeningFacts detail={state.detail} />}
          {state.checkId && (
            <div className="flex items-center gap-2 text-xs">
              <span className="shrink-0 opacity-70">Check ID</span>
              <CopyableId value={state.checkId} className="text-[11px]" />
            </div>
          )}
        </>
      </ResultBanner>
    </form>
  );
}
