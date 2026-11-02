import Link from "next/link";
import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import type { SessionPayload } from "@/lib/auth";
import { sessionTrust } from "@/lib/authz-inbox";
import { cn } from "@/lib/utils";

/** How long a two-step check counts as fresh for the service's step-up rule. */
const STEP_UP_WINDOW = 15 * 60;

function clock(epochSeconds: number) {
  return new Date(epochSeconds * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Whether this session can make changes at all, said before anything else on
 * the page: unsigned or expired (nothing will be accepted), freshly verified
 * with two-step (high-risk approvals go straight through), or plainly signed in.
 */
export function SessionChip({ session, now }: { session: SessionPayload; now: number }) {
  const trust = sessionTrust(session);
  const seconds = now / 1000;
  const expired = trust.signed && !!trust.expiresAt && trust.expiresAt < seconds;
  const fresh = trust.mfa && !!trust.authTime && seconds - trust.authTime < STEP_UP_WINDOW;
  const bad = !trust.signed || expired;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        bad
          ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          : fresh
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
      )}
    >
      {bad ? (
        <>
          <ShieldX className="h-3.5 w-3.5" />
          {expired ? "Secure session ended" : "Not signed in through identity service"} ·
          <Link href="/login?redirect=/admin/authorization" className="underline">
            Sign in
          </Link>
        </>
      ) : fresh ? (
        <>
          <ShieldCheck className="h-3.5 w-3.5" /> Two-step verified until {clock(trust.authTime! + STEP_UP_WINDOW)}
        </>
      ) : (
        <>
          <ShieldAlert className="h-3.5 w-3.5" /> Signed in · session until {trust.expiresAt ? clock(trust.expiresAt) : "—"}
        </>
      )}
    </div>
  );
}
