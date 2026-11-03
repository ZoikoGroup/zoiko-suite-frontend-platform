"use client";

// The signed-in person's own second factors: add a passkey (WebAuthn) or set
// up an authenticator app. Adding a factor beside one you already hold needs
// a fresh verification with that factor, so a stolen password alone cannot
// add the thief's device; the dialog asks for it and then carries on.

import { useEffect, useRef, useState, useTransition } from "react";
import { KeyRound, QrCode, X } from "lucide-react";
import {
  beginEnrolmentAction,
  beginPasskeyAction,
  beginPasskeyStepUpAction,
  confirmEnrolmentAction,
  finishPasskeyAction,
  finishPasskeyStepUpAction,
  stepUpAction,
  type EnrolOutcome,
} from "@/app/admin/account/actions";
import { createPasskey, getPasskeyAssertion, passkeysSupported } from "@/lib/webauthn-browser";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";

const PRIMARY = "inline-flex h-10 items-center gap-2 rounded-lg bg-gold-500 px-4 text-sm font-semibold text-white shadow-sm shadow-gold-600/20 hover:bg-gold-600 disabled:opacity-60";
const SECONDARY =
  "inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

function Shell({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-0 text-navy-950 shadow-xl backdrop:bg-slate-900/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
    >
      {open && (
        <div>
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4 px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/** A fresh verification with a code or a passkey; resolves true once the session is stepped up. */
function VerifyFirst({ onVerified, busy, run }: { onVerified: () => void; busy: boolean; run: (fn: () => Promise<void>) => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s+/g, "");
        run(async () => {
          const v = await stepUpAction(code);
          if (!v.ok) return setMsg(v.message);
          onVerified();
        });
      }}
      className="space-y-3"
    >
      <p className="text-[13px] text-slate-600 dark:text-slate-300">
        You already have a second factor. Verify with it first, so nobody with only your password can add one.
      </p>
      <div>
        <label htmlFor="verify-code" className={LABEL}>
          Code from your authenticator app
        </label>
        <input id="verify-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123 456" className={cn(FIELD, "font-mono")} />
      </div>
      {msg && (
        <p role="alert" className="text-[13px] text-rose-700 dark:text-rose-300">
          {msg}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {passkeysSupported() && (
          <button
            type="button"
            disabled={busy}
            className={cn(SECONDARY, "mr-auto")}
            onClick={() =>
              run(async () => {
                const b = await beginPasskeyStepUpAction();
                if (!b.ok) return setMsg(b.message);
                let assertion: unknown;
                try {
                  assertion = await getPasskeyAssertion(b.ceremony.options);
                } catch {
                  return setMsg("The passkey prompt was cancelled or timed out.");
                }
                const v = await finishPasskeyStepUpAction(b.ceremony.ceremony, assertion);
                if (!v.ok) return setMsg(v.message);
                onVerified();
              })
            }
          >
            <KeyRound className="h-4 w-4" />
            Use a passkey
          </button>
        )}
        <button type="submit" disabled={busy} className={SECONDARY}>
          {busy ? "Verifying…" : "Verify"}
        </button>
      </div>
    </form>
  );
}

export function AddPasskeyButton() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"name" | "verify" | "done">("name");
  const [msg, setMsg] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [busy, start] = useTransition();
  const supported = typeof window === "undefined" ? true : passkeysSupported();

  function close() {
    setOpen(false);
    setPhase("name");
    setMsg(null);
  }

  async function register() {
    const begun = await beginPasskeyAction();
    if (!begun.ok) {
      if (begun.stepUp) return setPhase("verify");
      return setMsg(begun.message);
    }
    let credential: unknown;
    try {
      credential = await createPasskey(begun.ceremony.options);
    } catch {
      return setMsg("The passkey prompt was cancelled, timed out, or this authenticator is already registered.");
    }
    const done = await finishPasskeyAction(begun.ceremony.ceremony, credential, nickname);
    if (!done.ok) return setMsg(done.message);
    setPhase("done");
  }

  return (
    <>
      <button type="button" className={PRIMARY} onClick={() => setOpen(true)} disabled={!supported} title={supported ? undefined : "This browser cannot use passkeys"}>
        <KeyRound className="h-4 w-4" />
        Add a passkey
      </button>
      <Shell open={open} title="Add a passkey" onClose={close}>
        {phase === "done" ? (
          <>
            <p className="text-[13px] text-emerald-700 dark:text-emerald-300">Passkey added. You can use it to sign in and to verify high-risk changes.</p>
            <div className="flex justify-end">
              <button type="button" className={SECONDARY} onClick={close}>
                Done
              </button>
            </div>
          </>
        ) : phase === "verify" ? (
          <VerifyFirst
            busy={busy}
            run={(fn) => start(fn)}
            onVerified={() => {
              setPhase("name");
              start(register);
            }}
          />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setMsg(null);
              start(register);
            }}
            className="space-y-4"
          >
            <p className="text-[13px] text-slate-600 dark:text-slate-300">
              A passkey is the strongest way to sign in: it only works on this site, so a look-alike page cannot capture it. Your device asks for
              your fingerprint, face or PIN.
            </p>
            <div>
              <label htmlFor="pk-name" className={LABEL}>
                Name it <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input id="pk-name" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={100} placeholder="Work laptop" className={FIELD} />
            </div>
            {msg && (
              <p role="alert" className="text-[13px] text-rose-700 dark:text-rose-300">
                {msg}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={SECONDARY} onClick={close}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={PRIMARY}>
                {busy ? "Waiting for your device…" : "Create passkey"}
              </button>
            </div>
          </form>
        )}
      </Shell>
    </>
  );
}

export function SetUpAuthenticatorButton({ hasAuthenticator }: { hasAuthenticator: boolean }) {
  const [open, setOpen] = useState(false);
  const [enrol, setEnrol] = useState<Extract<EnrolOutcome, { ok: true }> | null>(null);
  const [phase, setPhase] = useState<"start" | "verify" | "scan" | "done">("start");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function close() {
    setOpen(false);
    setEnrol(null);
    setPhase("start");
    setMsg(null);
  }

  async function begin() {
    const r = await beginEnrolmentAction();
    if (!r.ok) {
      if (r.stepUp) return setPhase("verify");
      return setMsg(r.message);
    }
    setEnrol(r);
    setPhase("scan");
  }

  return (
    <>
      <button
        type="button"
        className={SECONDARY}
        onClick={() => {
          setOpen(true);
          start(begin);
        }}
      >
        <QrCode className="h-4 w-4" />
        {hasAuthenticator ? "Replace authenticator app" : "Set up authenticator app"}
      </button>
      <Shell open={open} title={hasAuthenticator ? "Replace your authenticator app" : "Set up an authenticator app"} onClose={close}>
        {phase === "verify" ? (
          <VerifyFirst busy={busy} run={(fn) => start(fn)} onVerified={() => start(begin)} />
        ) : phase === "done" ? (
          <>
            <p className="text-[13px] text-emerald-700 dark:text-emerald-300">Two-step verification is on with this app.</p>
            <div className="flex justify-end">
              <button type="button" className={SECONDARY} onClick={close}>
                Done
              </button>
            </div>
          </>
        ) : phase === "scan" && enrol ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s+/g, "");
              start(async () => {
                const r = await confirmEnrolmentAction(enrol.enrollment.factor_id, code);
                if (!r.ok) return setMsg(r.message);
                setPhase("done");
              });
            }}
            className="space-y-4"
          >
            <p className="text-[13px] text-slate-600 dark:text-slate-300">Scan this with your authenticator app, then enter the code it shows.</p>
            {/* The SVG is generated server-side from the otpauth:// URI by the qrcode package. */}
            <div className="mx-auto w-48 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: enrol.qrSvg }} />
            <p className="break-all text-center font-mono text-[11px] text-slate-500">{enrol.enrollment.secret}</p>
            <div>
              <label htmlFor="totp-code" className={LABEL}>
                Code
              </label>
              <input id="totp-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className={cn(FIELD, "font-mono")} />
            </div>
            {msg && (
              <p role="alert" className="text-[13px] text-rose-700 dark:text-rose-300">
                {msg}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={SECONDARY} onClick={close}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={PRIMARY}>
                {busy ? "Checking…" : "Turn on"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-[13px] text-slate-600 dark:text-slate-300">{msg ?? "Preparing your secret…"}</p>
        )}
      </Shell>
    </>
  );
}
