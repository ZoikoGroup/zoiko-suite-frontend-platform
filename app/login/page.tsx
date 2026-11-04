import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth";
import { LoginBrandPanel, LoginForm } from "@/components/login";
import { Logo } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sign in",
};

type LoginPageProps = {
  searchParams: Promise<{ redirect?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const cookieStore = await cookies();
  if (cookieStore.get(SESSION_COOKIE)?.value) {
    redirect("/admin");
  }

  const { redirect: redirectTo } = await searchParams;

  return (
    // Desktop is pinned to the viewport — the page never scrolls. Only on very
    // short windows does the form column scroll internally. Layout is
    // | space | photo | gap | form | space |: photo and form are centred as a
    // group, so the spare width becomes equal side spaces.
    <div className="flex min-h-dvh w-full flex-col bg-slate-100 lg:h-dvh lg:flex-row lg:justify-center lg:gap-6 lg:overflow-hidden lg:px-6 xl:gap-19">
      <LoginBrandPanel />
      {/* Card max width (460px) plus px-2 gutters so its ring and shadow aren't clipped. */}
      <div className="flex flex-1 flex-col px-4 py-6 lg:w-[calc(460px+1rem)] lg:flex-none lg:overflow-y-auto lg:px-2">
        <div className="my-auto flex w-full flex-col items-center gap-6">
          <Logo bare height={44} className="lg:hidden" />
          <LoginForm redirectTo={redirectTo && redirectTo.startsWith("/admin") ? redirectTo : "/admin"} />
        </div>
      </div>
    </div>
  );
}
