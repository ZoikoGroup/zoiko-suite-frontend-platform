"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn, AlertCircle, Mail, Lock, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { DEMO_CREDENTIALS } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function LoginForm({ redirectTo = "/admin" }: { redirectTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Unable to sign in. Please try again.");
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setLoading(false);
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setLoading(false);
    }
  }

  function fillDemoCredentials() {
    setEmail(DEMO_CREDENTIALS.email);
    setPassword(DEMO_CREDENTIALS.password);
    setError(null);
  }

  return (
    <div className="w-full max-w-sm animate-scale-in">
      <div className="animate-fade-up">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Sign in to the console</h2>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Access is governed and logged for every session.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className={cn("mt-8 space-y-5", shake && "animate-[shake_0.4s_ease-in-out]")}
      >
        <div className="animate-fade-up" style={{ animationDelay: "60ms" }}>
          <label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Work email
          </label>
          <div
            className={cn(
              "mt-1.5 flex items-center gap-2 rounded-lg border px-3.5 transition-all duration-200",
              "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900",
              emailFocused &&
                "border-navy-500 ring-2 ring-navy-500/20 shadow-[0_0_0_4px_rgba(38,98,156,0.08)]",
            )}
          >
            <Mail
              className={cn(
                "h-4 w-4 shrink-0 transition-colors duration-200",
                emailFocused ? "text-navy-600 dark:text-navy-300" : "text-slate-400",
              )}
            />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              placeholder="you@zoikosuite.com"
              className="block w-full bg-transparent py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Password
            </label>
          </div>
          <div
            className={cn(
              "mt-1.5 flex items-center gap-2 rounded-lg border px-3.5 transition-all duration-200",
              "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900",
              passwordFocused &&
                "border-navy-500 ring-2 ring-navy-500/20 shadow-[0_0_0_4px_rgba(38,98,156,0.08)]",
            )}
          >
            <Lock
              className={cn(
                "h-4 w-4 shrink-0 transition-colors duration-200",
                passwordFocused ? "text-navy-600 dark:text-navy-300" : "text-slate-400",
              )}
            />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              placeholder="••••••••••"
              className="block w-full bg-transparent py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="flex shrink-0 items-center justify-center text-slate-400 transition-all duration-150 hover:scale-110 hover:text-slate-600 dark:hover:text-slate-300"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div
          className="flex items-center justify-between text-sm animate-fade-up"
          style={{ animationDelay: "180ms" }}
        >
          <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-navy-700 transition-transform duration-150 checked:scale-110 focus:ring-navy-500/40 dark:border-slate-600 dark:bg-slate-800"
              defaultChecked
            />
            Remember this device
          </label>
          <button
            type="button"
            className="font-medium text-navy-700 transition-colors hover:text-navy-900 dark:text-navy-300 dark:hover:text-navy-200"
          >
            Forgot password?
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200 animate-fade-in dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/30">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="animate-fade-up" style={{ animationDelay: "240ms" }}>
          <Button type="submit" loading={loading} className="group w-full">
            {!loading && <LogIn className="h-4 w-4" />}
            Sign in
            {!loading && (
              <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
            )}
          </Button>
        </div>
      </form>

      <div
        className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 transition-colors duration-200 hover:border-navy-400/60 dark:border-slate-700 dark:bg-slate-900/50 animate-fade-up"
        style={{ animationDelay: "300ms" }}
      >
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-gold-500" />
          Demo access
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
          {DEMO_CREDENTIALS.email} · {DEMO_CREDENTIALS.password}
        </p>
        <button
          type="button"
          onClick={fillDemoCredentials}
          className="mt-2 text-xs font-medium text-navy-700 underline-offset-2 transition-colors hover:text-navy-900 hover:underline dark:text-navy-300 dark:hover:text-navy-200"
        >
          Autofill demo credentials
        </button>
      </div>
    </div>
  );
}
