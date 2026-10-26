import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { SectionNav } from "@/components/admin/authorization/kit/SectionNav";
import { SignInAgain } from "@/components/admin/authorization/kit";
import { approvalItems, currentSession, loadRegisters, sessionTrust } from "@/lib/authz-inbox";

/** Read once per request, outside render, so a re-render cannot change it. */
function requestTimeSeconds(): number {
  return Date.now() / 1000;
}

function clock(epochSeconds: number) {
  return new Date(epochSeconds * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * The Authorization area: who may do what, and the record of every decision.
 * One secondary navigation for its ten jobs, and a strip that says, before
 * anything else, whether this session can make changes at all.
 */
export default async function AuthorizationLayout({ children }: { children: ReactNode }) {
  const current = await currentSession();
  if (!current) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SignInAgain />
        </div>
      </div>
    );
  }
  const trust = sessionTrust(current.session);
  const now = requestTimeSeconds();
  const expired = trust.signed && !!trust.expiresAt && trust.expiresAt < now;
  const registers = await loadRegisters(current.identity);
  const waiting = approvalItems(registers, current.identity.principalId ?? "").filter((i) => !i.notYours).length;
  const stepUpFresh = trust.mfa && !!trust.authTime && now - trust.authTime < 15 * 60;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Governance platform</p>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Authorization</p>
        </div>
        <div
          className={
            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium " +
            (!trust.signed || expired
              ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
              : stepUpFresh
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300")
          }
        >
          {!trust.signed || expired ? (
            <>
              <ShieldX className="h-3.5 w-3.5" />
              {expired ? "Secure session ended" : "Not signed in through identity service"} ·{" "}
              <Link href="/login?redirect=/admin/authorization" className="underline">
                Sign in
              </Link>
            </>
          ) : stepUpFresh ? (
            <>
              <ShieldCheck className="h-3.5 w-3.5" /> Verified with two-step until {clock(trust.authTime! + 15 * 60)}
            </>
          ) : (
            <>
              <ShieldAlert className="h-3.5 w-3.5 text-slate-400" /> Signed in · session until {trust.expiresAt ? clock(trust.expiresAt) : "—"}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <SectionNav approvals={waiting} />
        </aside>
        <main className="min-w-0 space-y-6">{children}</main>
      </div>
    </div>
  );
}
