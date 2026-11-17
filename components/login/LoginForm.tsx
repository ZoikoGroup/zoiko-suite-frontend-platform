"use client";

import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// The card is drawn to the login mock, where it is 597 px wide. Every length below is
// in those mock pixels. px() turns one into a share of the card's real width (--u on
// the root, from the container the page wraps the card in), so the card keeps the
// mock's proportions at any size. A floor keeps type readable when the card is small;
// tap() adds a touch-size floor that only applies below the desktop breakpoint.
function px(n: number, min = 0): string {
  const length = `calc(${n} * var(--u))`;
  return min > 0 ? `max(${min}px, ${length})` : length;
}

function tap(n: number): string {
  return `max(var(--tap), calc(${n} * var(--u)))`;
}

// Tab widths as drawn in the mock; the first tab's text sits a little right of its centre.
const TABS = [
  { label: "Login", width: 185, nudge: 17 },
  { label: "Register", width: 180, nudge: 0 },
  { label: "Reset Password", width: 165, nudge: 0 },
] as const;
const FOOTER_LINKS = ["Privacy", "Terms", "Accessibility", "Help"];

// Colours sampled from the mock.
const INK = "#070c24"; // headings, active tab
const TEXT = "#141c30"; // body text in fields and buttons
const MUTED = "#6f7890"; // subtitle
const GOLD = "#b8822f"; // links, checkbox; the button runs #b8822f → #d19b4a

const fieldClass =
  "block w-full border-[1.5px] border-[#e8e9ee] bg-white text-[#141c30] outline-none " +
  "transition-colors duration-150 placeholder:text-[#8e90a0] " +
  "focus:border-[#c48c38] focus:ring-[3px] focus:ring-[#c48c38]/15";

const ssoClass =
  "group flex w-full items-center border border-[#e3e5ea] bg-white text-left font-medium text-[#141c30] " +
  "transition-colors duration-150 hover:border-[#cfd3db] hover:bg-[#fafbfd] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c48c38]/40";

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="size-full" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-full" aria-hidden="true">
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

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-full" aria-hidden="true">
      <path
        fill="#111111"
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
      />
    </svg>
  );
}

function CompanyLogo() {
  return <Building2 className="size-full text-[#1f2847]" strokeWidth={2} aria-hidden="true" />;
}

type SsoButtonProps = {
  label: string;
  logo: ReactNode;
  /** Where the button goes. Without one it is a placeholder: no provider backs it yet. */
  href?: string;
};

function SsoButton({ label, logo, href }: SsoButtonProps) {
  const style: CSSProperties = {
    height: tap(46),
    borderRadius: px(9),
    paddingLeft: px(26),
    paddingRight: px(16),
    fontSize: px(17, 13),
  };
  const body = (
    <>
      <span className="flex shrink-0 items-center justify-center" style={{ width: px(28), height: px(28) }}>
        {logo}
      </span>
      <span className="flex-1" style={{ marginLeft: px(36) }}>
        {label}
      </span>
      <ChevronRight
        className="shrink-0 text-[#6b6f80] transition-transform group-hover:translate-x-0.5"
        strokeWidth={2}
        style={{ width: px(21), height: px(21) }}
        aria-hidden="true"
      />
    </>
  );
  return href ? (
    <a href={href} className={ssoClass} style={style}>
      {body}
    </a>
  ) : (
    <button type="button" className={ssoClass} style={style}>
      {body}
    </button>
  );
}

type LoginFormProps = {
  redirectTo?: string;
  /** Why the reader is here (session ended, sign-in failed, fallback). */
  notice?: string;
};

type LoginResponse = {
  success?: boolean;
  error?: string;
  /** "code": the account has two-step; ask for the authenticator code next. */
  step?: "code";
  /** The sign-in state expired; go back to email and password. */
  restart?: boolean;
  /** The account needs the identity service's own page (passkey, SSO). */
  identityPage?: string;
};

// One page for the reader: the server signs in at identity-context-svc with
// what is typed here (app/api/auth/login), so the session carries the refresh
// token that keeps it alive for its full eight hours.
export function LoginForm({ redirectTo = "/admin", notice }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [identityPage, setIdentityPage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const askingCode = step === "code";

  // Register, Reset Password, Microsoft, Google, Apple and the footer links are
  // placeholders from the mock: nothing backs them yet, so they render inert.
  // Company SSO starts the hosted identity sign-in (app/api/auth/oidc/start).
  const companySsoHref = `/api/auth/oidc/start?redirect=${encodeURIComponent(redirectTo)}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setIdentityPage(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(askingCode ? { code } : { email, password }),
      });

      const data = (await res.json().catch(() => null)) as LoginResponse | null;

      if (data?.step === "code") {
        setStep("code");
        setCode("");
        setLoading(false);
        return;
      }

      if (!res.ok || !data?.success) {
        if (data?.restart) {
          setStep("credentials");
          setCode("");
        }
        if (data?.identityPage) {
          const params = new URLSearchParams({ redirect: redirectTo });
          if (email.trim()) params.set("login_hint", email.trim());
          setIdentityPage(`${data.identityPage.split("?")[0]}?${params.toString()}`);
        }
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

  const labelStyle: CSSProperties = { fontSize: px(15.5, 13), lineHeight: 1 };
  const fieldStyle: CSSProperties = {
    height: tap(46),
    borderRadius: px(9),
    paddingLeft: px(24),
    paddingRight: px(60),
    fontSize: px(15.5, 13),
  };
  const bannerStyle: CSSProperties = {
    marginTop: px(14),
    gap: px(8),
    borderRadius: px(8),
    padding: `${px(9)} ${px(12)}`,
    fontSize: px(14, 12),
    lineHeight: 1.35,
  };

  return (
    <div
      className={cn(
        "flex min-h-full w-full flex-col bg-[#f8f9fc] text-[#141c30] shadow-[0_12px_40px_rgba(6,18,45,0.22)]",
        "[--u:calc(1cqw/5.97)] [--tap:0px] max-lg:[--tap:42px]",
        "animate-fade-in motion-reduce:animate-none",
      )}
      style={{ borderRadius: px(22), padding: `${px(16)} ${px(15)} 0` }}
    >
      {/* The raised panel: a tab band over the form body. */}
      <section
        className="flex flex-1 flex-col bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_rgba(15,23,42,0.07)]"
        style={{ borderRadius: px(20) }}
      >
        <nav className="flex bg-[#f4f7fe]" style={{ height: px(54), borderRadius: `${px(20)} ${px(20)} 0 0` }}>
          {TABS.map((tab) => {
            const active = tab.label === "Login";
            return (
              <button
                key={tab.label}
                type="button"
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex shrink-0 items-center justify-center transition-colors",
                  active ? "bg-white font-semibold text-[#070c24]" : "font-normal text-[#1f2847] hover:text-[#070c24]",
                )}
                style={{
                  width: px(tab.width),
                  paddingLeft: px(tab.nudge),
                  fontSize: px(16.5, 13),
                  borderTopLeftRadius: px(20),
                  borderTopRightRadius: active ? px(18) : 0,
                }}
              >
                {tab.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-linear-to-r from-[#b87820] via-[#c6903a] to-[#dcb97a]"
                    style={{ width: px(132), height: px(4), borderRadius: px(2) }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex flex-1 flex-col" style={{ padding: `${px(6)} ${px(29)} ${px(36)} ${px(35)}` }}>
          <Image
            src="/logo-transparent.png"
            alt="Zoiko Suite"
            width={336}
            height={144}
            loading="eager"
            className="h-auto self-center"
            style={{ width: px(306) }}
          />

          <h2
            className="text-center font-bold tracking-[-0.01em]"
            style={{ marginTop: px(4), fontSize: px(44, 24), lineHeight: 1, color: INK }}
          >
            Welcome back!
          </h2>
          <p className="text-center" style={{ marginTop: px(5), fontSize: px(20, 13), lineHeight: 1.1, color: MUTED }}>
            {askingCode ? "Enter the 6-digit code from your authenticator app." : "Sign in to your Zoiko Suite account."}
          </p>

          <div className="grid" style={{ marginTop: px(23), gap: px(7) }}>
            <SsoButton label="Continue with Microsoft" logo={<MicrosoftLogo />} />
            <SsoButton label="Continue with Google" logo={<GoogleLogo />} />
            <SsoButton label="Continue with Apple" logo={<AppleLogo />} />
            <SsoButton label="Continue with Company SSO" logo={<CompanyLogo />} href={companySsoHref} />
          </div>

          <div
            className="flex items-center text-[#848c9e]"
            style={{ marginTop: px(17), gap: px(14), fontSize: px(15, 12), lineHeight: 1 }}
          >
            <span className="h-px flex-1 bg-[#e4e3e7]" />
            or sign in with email
            <span className="h-px flex-1 bg-[#e4e3e7]" />
          </div>

          {notice && (
            <div className="flex items-start bg-amber-50 text-amber-800 ring-1 ring-amber-200" style={bannerStyle}>
              <CircleAlert className="mt-px shrink-0" style={{ width: px(16), height: px(16) }} aria-hidden="true" />
              <span>{notice}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className={cn(shake && "animate-[shake_0.4s_ease-in-out]")}>
            {askingCode ? (
              <div style={{ marginTop: px(16) }}>
                <label htmlFor="code" className="block font-medium" style={{ ...labelStyle, color: TEXT }}>
                  Authenticator code
                </label>
                <div className="relative" style={{ marginTop: px(10) }}>
                  <input
                    id="code"
                    inputMode="numeric"
                    pattern="[0-9 ]{6,8}"
                    required
                    autoFocus
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    className={cn(fieldClass, "tracking-widest")}
                    style={{ ...fieldStyle, paddingRight: px(16) }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep("credentials");
                    setCode("");
                    setError(null);
                  }}
                  className="font-semibold transition-colors hover:text-[#9a6c2c]"
                  style={{ marginTop: px(10), fontSize: px(16, 12), color: GOLD }}
                >
                  Use a different account
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginTop: px(16) }}>
                  <label htmlFor="email" className="block font-medium" style={{ ...labelStyle, color: TEXT }}>
                    Work email address
                  </label>
                  <div className="relative" style={{ marginTop: px(10) }}>
                    <input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className={fieldClass}
                      style={{ ...fieldStyle, paddingRight: px(16) }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: px(14) }}>
                  <label htmlFor="password" className="block font-medium" style={{ ...labelStyle, color: TEXT }}>
                    Password
                  </label>
                  <div className="relative" style={{ marginTop: px(10) }}>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className={fieldClass}
                      style={fieldStyle}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 flex items-center justify-center text-[#7f8698] transition-colors hover:text-[#141c30]"
                      style={{ width: px(56) }}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff strokeWidth={1.75} style={{ width: px(28), height: px(28) }} aria-hidden="true" />
                      ) : (
                        <Eye strokeWidth={1.75} style={{ width: px(28), height: px(28) }} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div
                  className="flex flex-wrap items-center justify-between"
                  style={{ marginTop: px(12), columnGap: px(12), rowGap: px(8) }}
                >
                  <label className="flex cursor-pointer items-center" style={{ fontSize: px(15.5, 13), color: TEXT }}>
                    <span className="relative inline-flex shrink-0" style={{ width: px(26), height: px(26) }}>
                      <input
                        type="checkbox"
                        defaultChecked
                        className={cn(
                          "peer absolute inset-0 size-full cursor-pointer appearance-none border border-[#d9c7a0] bg-white",
                          "checked:border-[#b87a1c] checked:bg-[#b87a1c]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c48c38]/40",
                        )}
                        style={{ borderRadius: px(5) }}
                      />
                      <Check
                        className="pointer-events-none absolute inset-0 m-auto text-white opacity-0 peer-checked:opacity-100"
                        strokeWidth={3}
                        style={{ width: px(16), height: px(16) }}
                        aria-hidden="true"
                      />
                    </span>
                    <span style={{ marginLeft: px(15) }}>Remember me for 30 days</span>
                  </label>
                  <button
                    type="button"
                    className="font-semibold transition-colors hover:text-[#7f5a22]"
                    style={{ fontSize: px(15.5, 13), color: "#9a6c2c" }}
                  >
                    Forgot password?
                  </button>
                </div>
              </>
            )}

            {error && (
              <div className="flex items-start bg-rose-50 text-rose-700 ring-1 ring-rose-200" style={bannerStyle}>
                <CircleAlert className="mt-px shrink-0" style={{ width: px(16), height: px(16) }} aria-hidden="true" />
                <span>
                  {error}
                  {identityPage && (
                    <>
                      {" "}
                      <a href={identityPage} className="font-semibold underline">
                        Continue on the identity sign-in page
                      </a>
                    </>
                  )}
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "flex w-full items-center justify-center font-semibold text-white",
                "bg-[linear-gradient(100deg,#b8822f_0%,#c48c38_55%,#d19b4a_100%)] shadow-[0_6px_16px_rgba(184,130,47,0.28)]",
                "transition-[filter,box-shadow] duration-150 hover:brightness-105 hover:shadow-[0_8px_20px_rgba(184,130,47,0.35)] active:brightness-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c48c38]/50 focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-70",
              )}
              style={{ marginTop: px(16), height: tap(54), borderRadius: px(10), fontSize: px(21, 15), gap: px(12) }}
            >
              {loading ? (
                <Loader2 className="animate-spin" style={{ width: px(24), height: px(24) }} aria-hidden="true" />
              ) : (
                <>
                  {askingCode ? "Verify" : "Log in"}
                  <ArrowRight strokeWidth={2.5} style={{ width: px(24), height: px(24) }} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <p
            className="flex items-baseline justify-center text-[#3a4259]"
            style={{ marginTop: px(20), gap: px(13), fontSize: px(17, 13), lineHeight: 1.1 }}
          >
            New to Zoiko Suite?
            <button
              type="button"
              className="font-bold transition-colors hover:text-[#7f5a22]"
              style={{ fontSize: px(20, 14), color: "#a2722a" }}
            >
              Register
            </button>
          </p>
        </div>
      </section>

      {/* Wraps only when the card is too narrow for one line (phones). */}
      <footer
        className="flex flex-wrap items-center justify-between text-[#7d8597]"
        style={{
          minHeight: px(57),
          padding: `${px(8)} ${px(29)} ${px(14)} ${px(10)}`,
          rowGap: px(6),
          columnGap: px(12),
          fontSize: px(13, 10),
          lineHeight: 1,
        }}
      >
        <ul className="flex items-center whitespace-nowrap">
          {FOOTER_LINKS.map((link, i) => (
            <li key={link} className="flex items-center">
              {i > 0 && (
                <span aria-hidden="true" className="text-[#b9bfcc]" style={{ margin: `0 ${px(8)}` }}>
                  |
                </span>
              )}
              <button type="button" className="transition-colors hover:text-[#141c30]">
                {link}
              </button>
            </li>
          ))}
        </ul>
        <span className="whitespace-nowrap text-[#7a8294]" style={{ fontSize: px(12, 10) }}>
          © 2026 Zoiko Suite. All rights reserved.
        </span>
      </footer>
    </div>
  );
}
