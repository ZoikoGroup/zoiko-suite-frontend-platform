import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { LoginForm, LoginScene } from "@/components/login";

export const metadata: Metadata = {
  title: "Sign in",
};

type LoginPageProps = {
  searchParams: Promise<{ redirect?: string; error?: string; reason?: string }>;
};

/** What the reader is told when they land here from a failed or ended sign-in. */
const NOTICES: Record<string, string> = {
  expired: "Your session has ended. Sign in again to carry on where you left off.",
  identity_unavailable:
    "The ZoikoSuite identity service could not be reached. Try again shortly; a local demo account still signs in, but pages that need a verified identity will not work until it is back.",
  state_mismatch: "That sign-in took too long or was started in another tab. Start again.",
  access_denied: "Sign-in was cancelled.",
  context_unresolved:
    "You signed in, but your organisation context could not be established. Contact your administrator.",
  signin_failed: "Sign-in did not complete. Try again.",
  oidc_not_configured: "Single sign-on is not configured for this console. Sign in with a local account.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const cookieStore = await cookies();
  // A valid session only: a stale or tampered cookie must not bounce the
  // reader to /admin, where proxy.ts would send them straight back here.
  if (decodeSession(cookieStore.get(SESSION_COOKIE)?.value)) {
    redirect("/admin");
  }

  const { redirect: redirectTo, error, reason } = await searchParams;
  const target = redirectTo && redirectTo.startsWith("/admin") && !redirectTo.startsWith("//") ? redirectTo : "/admin";

  const noticeKey = reason ?? error;
  const notice = noticeKey ? (NOTICES[noticeKey] ?? NOTICES.signin_failed) : undefined;

  return (
    <LoginScene>
      <LoginForm redirectTo={target} notice={notice} />
    </LoginScene>
  );
}
