"use client";

// Every change in the Authorization area goes through this dialog:
//
//   1. the form (fields, and a reason where the service requires one);
//   2. if the service answers step_up_required, a "Verify it's you" code
//      prompt — and the SAME request is sent again once the code is accepted,
//      so a person never re-enters a form because of a security check;
//   3. a result that says in words what happened and what happens next.
//
// A refusal keeps the form open with the explanation beside it, so the person
// can correct and resend. Nothing here decides anything: the service does.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { CheckCircle2, Clock, Fingerprint, LogIn, ShieldAlert, X, XCircle } from "lucide-react";
import { stepUpAction } from "@/app/admin/account/actions";
import { REASONS, type AuthzResult, type ReasonSet } from "@/app/admin/authorization/state";
import { FIELD, LABEL } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";

type Tone = "primary" | "secondary" | "danger" | "ghost" | "approve";

const TRIGGER: Record<Tone, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-800 dark:bg-navy-600 dark:hover:bg-navy-500",
  approve: "bg-emerald-600 text-white hover:bg-emerald-700",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
  danger:
    "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10",
  ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
};

export type ActionDialogProps = {
  label: string;
  icon?: ReactNode;
  tone?: Tone;
  size?: "sm" | "md";
  title: string;
  description?: string;
  /** A server action. */
  action: (prev: AuthzResult, fd: FormData) => Promise<AuthzResult>;
  hidden?: Record<string, string | number | undefined>;
  submitLabel: string;
  /** "drawer" for a form, "modal" for a confirmation. */
  variant?: "modal" | "drawer";
  /** Ask for a reason from this set; the service records it with the change. */
  reasons?: ReasonSet;
  children?: ReactNode;
  /** Shown above the buttons, e.g. "This takes effect only once approved." */
  footnote?: ReactNode;
};

export function ActionDialog({
  label,
  icon,
  tone = "secondary",
  size = "sm",
  title,
  description,
  action,
  hidden,
  submitLabel,
  variant = "modal",
  reasons,
  children,
  footnote,
}: ActionDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"form" | "verify" | "result">("form");
  const [result, setResult] = useState<AuthzResult | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<{ text: string; enrol?: boolean } | null>(null);
  const [saved, setSaved] = useState<FormData | null>(null);
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function reset() {
    setPhase("form");
    setResult(null);
    setVerifyMessage(null);
    setSaved(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function settle(r: AuthzResult) {
    if (r.status === "step_up") {
      setPhase("verify");
      setVerifyMessage(null);
      return;
    }
    setResult(r);
    setPhase(r.status === "done" || r.status === "pending" || r.status === "signin" ? "result" : "form");
  }

  function submit(fd: FormData) {
    setSaved(fd);
    startTransition(async () => settle(await action({ status: "idle", message: "" }, fd)));
  }

  function verify(fd: FormData) {
    const code = String(fd.get("code") ?? "").replace(/\s+/g, "");
    startTransition(async () => {
      const v = await stepUpAction(code);
      if (!v.ok) {
        setVerifyMessage({ text: v.message, enrol: v.notEnrolled });
        if (v.signin) settle({ status: "signin", message: v.message });
        return;
      }
      // Proven. Send the request the person already filled in, unchanged.
      if (saved) settle(await action({ status: "idle", message: "" }, saved));
    });
  }

  const drawer = variant === "drawer";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500",
          size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
          TRIGGER[tone],
        )}
      >
        {icon}
        {label}
      </button>

      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className={cn(
          "m-0 max-h-none max-w-none bg-transparent p-0 backdrop:bg-slate-950/40 backdrop:backdrop-blur-[1px]",
          drawer ? "ml-auto h-full w-full sm:w-[480px]" : "mx-auto mt-[12vh] w-[min(92vw,460px)]",
        )}
      >
        {open && (
          <div
            className={cn(
              "flex flex-col bg-white text-left shadow-2xl dark:bg-slate-900",
              drawer ? "h-full" : "rounded-2xl",
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {phase === "verify" ? "Verify it's you" : title}
                </h2>
                {phase === "form" && description && (
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
                )}
              </div>
              <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            {phase === "form" && (
              <form
                ref={formRef}
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(new FormData(e.currentTarget));
                }}
                className={cn("flex flex-col", drawer && "min-h-0 flex-1")}
              >
                <div className={cn("space-y-4 px-6 py-5", drawer && "flex-1 overflow-y-auto")}>
                  {Object.entries(hidden ?? {}).map(([k, v]) =>
                    v === undefined ? null : <input key={k} type="hidden" name={k} value={String(v)} />,
                  )}
                  {children}
                  {reasons && <ReasonFields set={reasons} />}
                  {result && (result.status === "refused" || result.status === "error") && (
                    <div
                      role="alert"
                      className={cn(
                        "flex gap-2.5 rounded-xl px-3.5 py-3 text-[13px] leading-relaxed",
                        result.status === "refused"
                          ? "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
                          : "bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-200",
                      )}
                    >
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{result.message}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-3 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
                  {footnote && <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{footnote}</p>}
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={close} className="h-10 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className={cn(
                        "inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-medium text-white disabled:opacity-60",
                        tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : tone === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-navy-900 hover:bg-navy-800 dark:bg-navy-600",
                      )}
                    >
                      {busy ? "Working…" : submitLabel}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {phase === "verify" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  verify(new FormData(e.currentTarget));
                }}
                className="space-y-5 px-6 py-6"
              >
                <div className="flex items-start gap-3 rounded-xl bg-navy-50 p-4 dark:bg-navy-500/10">
                  <Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-navy-700 dark:text-navy-300" />
                  <p className="text-[13px] leading-relaxed text-navy-900 dark:text-navy-100">
                    This is a high-risk change, so we need to confirm it&apos;s really you. Enter the 6-digit code from your
                    authenticator app. Your request is kept and sent as soon as you&apos;re verified.
                  </p>
                </div>
                <div>
                  <label htmlFor="stepup-code" className={LABEL}>
                    Authentication code
                  </label>
                  <input
                    id="stepup-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9 ]{6,7}"
                    maxLength={7}
                    required
                    autoFocus
                    placeholder="123 456"
                    className={cn(FIELD, "h-12 text-center font-mono text-xl tracking-[0.4em]")}
                  />
                </div>
                {verifyMessage && (
                  <p role="alert" className="text-[13px] text-rose-700 dark:text-rose-300">
                    {verifyMessage.text}{" "}
                    {verifyMessage.enrol && (
                      <Link href="/admin/account/security" className="font-medium underline">
                        Set up two-step verification
                      </Link>
                    )}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={close} className="h-10 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                    Cancel
                  </button>
                  <button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-5 text-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60 dark:bg-navy-600">
                    {busy ? "Verifying…" : "Verify and continue"}
                  </button>
                </div>
              </form>
            )}

            {phase === "result" && result && <ResultView result={result} returnTo={pathname} onDone={close} />}
          </div>
        )}
      </dialog>
    </>
  );
}

function ReasonFields({ set }: { set: ReasonSet }) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div>
        <label htmlFor="reason_code" className={LABEL}>
          Reason <span className="text-rose-500">*</span>
        </label>
        <select id="reason_code" name="reason_code" required defaultValue="" className={FIELD}>
          <option value="" disabled>
            Choose a reason
          </option>
          {REASONS[set].map(([code, text]) => (
            <option key={code} value={code}>
              {text}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="reason_note" className={LABEL}>
          Note <span className="font-normal text-slate-400">(kept in the audit record)</span>
        </label>
        <input id="reason_note" name="reason_note" autoComplete="off" className={FIELD} />
      </div>
    </div>
  );
}

function ResultView({ result, returnTo, onDone }: { result: AuthzResult; returnTo: string; onDone: () => void }) {
  if (result.status === "signin") {
    return (
      <div className="space-y-5 px-6 py-6">
        <div className="flex items-start gap-3">
          <LogIn className="mt-0.5 h-5 w-5 text-navy-700" />
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-100">Your secure session has ended</p>
            <p className="mt-1 text-[13px] text-slate-500">Nothing was changed. Sign in again, then repeat the request.</p>
          </div>
        </div>
        <div className="flex justify-end">
          <Link href={`/login?redirect=${encodeURIComponent(returnTo)}`} className="inline-flex h-10 items-center rounded-lg bg-navy-900 px-5 text-sm font-medium text-white">
            Sign in again
          </Link>
        </div>
      </div>
    );
  }
  const pending = result.status === "pending";
  return (
    <div className="space-y-5 px-6 py-6">
      <div className="flex items-start gap-3">
        {pending ? (
          <Clock className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
        ) : result.status === "done" ? (
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
        ) : (
          <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
        )}
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-slate-100">{pending ? "Submitted for approval" : "Done"}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">{result.message}</p>
        </div>
      </div>
      {result.details && result.details.length > 0 && (
        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-[13px] dark:divide-slate-800 dark:border-slate-700">
          {result.details.map((d) => (
            <div key={d.label} className="flex justify-between gap-4 px-4 py-2.5">
              <dt className="text-slate-500">{d.label}</dt>
              <dd className="min-w-0 break-all text-right font-medium text-slate-900 dark:text-slate-100">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={onDone} className="h-10 rounded-lg bg-navy-900 px-5 text-sm font-medium text-white hover:bg-navy-800 dark:bg-navy-600">
          Done
        </button>
      </div>
    </div>
  );
}
