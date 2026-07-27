import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth";
import { LoginBrandPanel, LoginForm } from "@/components/login";
import { ThemeToggle } from "@/components/theme";

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
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <LoginBrandPanel />
      <div className="relative flex items-center justify-center bg-white px-6 py-16 dark:bg-slate-950">
        <ThemeToggle className="absolute right-6 top-6" />
        <LoginForm redirectTo={redirectTo && redirectTo.startsWith("/admin") ? redirectTo : "/admin"} />
      </div>
    </div>
  );
}
