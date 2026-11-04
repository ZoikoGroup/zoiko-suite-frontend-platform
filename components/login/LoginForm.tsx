"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, CircleAlert, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

// Register, Reset Password, SSO and the footer links are placeholders from the
// Figma frame — no routes or providers back them yet, so they render inert.
const TABS = ["Login", "Register", "Reset Password"] as const;
const FOOTER_LINKS = ["Privacy", "Terms", "Accessibility", "Help"];

const inputClass =
  "block h-10 w-full rounded-md border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none " +
  "transition-colors duration-150 placeholder:text-slate-400 " +
  "focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20";

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="h-5 w-5" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

const SSO_PROVIDERS = [
  { label: "Continue with Microsoft", Logo: MicrosoftLogo },
  { label: "Continue with Google", Logo: GoogleLogo },
];

export function LoginForm({ redirectTo = "/admin" }: { redirectTo?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(data?.error ?? "Unable to sign in. Please try again.");
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setLoading(false);
        return;
      }

      // The server sets the auth cookie on a successful response. Use a full
      // browser navigation after the cookie is established so the protected
      // admin route loads with the correct session state instead of producing
      // the app-router "unexpected response from the server" error.
      window.location.assign(redirectTo);
    } catch {
      setError("Network error — please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-[460px] flex-col rounded-2xl bg-white shadow-xl shadow-slate-900/5 ring-1 ring-slate-900/5 animate-scale-in lg:min-h-[min(760px,calc(100dvh-3rem))]">
      <nav className="grid grid-cols-3 px-4 pt-2 sm:px-6">
        {TABS.map((tab) => {
          const active = tab === "Login";
          return (
            <button
              key={tab}
              type="button"
              aria-current={active ? "page" : undefined}
              className={cn(
                "border-b-2 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-gold-500 text-gold-500"
                  : "border-transparent text-slate-800 hover:text-navy-900",
              )}
            >
              {tab}
            </button>
          );
        })}
      </nav>

      <div className="mx-2 mt-2 rounded-xl px-6 pb-5 pt-5 shadow-[0_2px_16px_rgba(15,23,42,0.06)] sm:mx-4 sm:px-8">
        <div className="animate-fade-up">
          <h2 className="text-3xl font-bold tracking-tight text-navy-900">Welcome back!</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to your Zoiko Suite account.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className={cn("mt-5 space-y-3", shake && "animate-[shake_0.4s_ease-in-out]")}
        >
          <div className="animate-fade-up" style={{ animationDelay: "60ms" }}>
            <label htmlFor="email" className="text-sm font-medium text-slate-800">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className={cn(inputClass, "mt-1")}
            />
          </div>

          <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
            <label htmlFor="password" className="text-sm font-medium text-slate-800">
              Password
            </label>
            <div className="relative mt-1">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className={cn(inputClass, "pr-10")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 transition-colors hover:text-navy-900"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div
            className="flex items-center justify-between text-xs animate-fade-up"
            style={{ animationDelay: "180ms" }}
          >
            <label className="flex items-center gap-2 text-slate-700">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded accent-gold-500" />
              Remember me for 30 days
            </label>
            <button
              type="button"
              className="font-medium text-gold-500 transition-colors hover:text-gold-600"
            >
              Forgot password?
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200 animate-fade-in">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="animate-fade-up" style={{ animationDelay: "240ms" }}>
            <Button type="submit" variant="accent" loading={loading} className="h-10 w-full rounded-md">
              Log In
            </Button>
          </div>
        </form>

        <div
          className="mt-5 flex items-center gap-3 text-xs text-slate-500 animate-fade-up"
          style={{ animationDelay: "300ms" }}
        >
          <span className="h-px flex-1 bg-slate-200" />
          or continue with
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="mt-3 space-y-2 animate-fade-up" style={{ animationDelay: "340ms" }}>
          {SSO_PROVIDERS.map(({ label, Logo }) => (
            <button
              key={label}
              type="button"
              className="group flex h-10 w-full items-center gap-3 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-navy-900 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <Logo />
              <span className="flex-1 text-left">{label}</span>
              <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>

        <p className="mt-4 text-center text-sm text-slate-700">
          New to Zoiko Suite?{" "}
          <button
            type="button"
            className="font-semibold text-gold-500 transition-colors hover:text-gold-600"
          >
            Register
          </button>
        </p>
      </div>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3 text-xs text-slate-500">
        <ul className="flex flex-wrap items-center gap-x-2">
          {FOOTER_LINKS.map((link, i) => (
            <li key={link} className="flex items-center gap-x-2">
              {i > 0 && <span aria-hidden="true">•</span>}
              <button type="button" className="transition-colors hover:text-navy-900">
                {link}
              </button>
            </li>
          ))}
        </ul>
        <span>© 2026 Zoiko Tech Inc.</span>
      </footer>
    </div>
  );
}
