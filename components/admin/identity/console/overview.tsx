// The top of the Identity Context console: five headline figures and three
// panels, computed from the service's own summary and the registers below
// them. A source that could not be read shows "—" and says so; it is never
// counted as zero.

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Fingerprint,
  KeyRound,
  Link2,
  LockKeyhole,
  ShieldCheck,
  ShieldQuestion,
  Siren,
  TimerReset,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { ConsolePanel, KpiCard, KpiGrid, PanelCallout, PanelGrid, PanelNote } from "@/components/admin/console";
import { ago, elevated, type IdentityData } from "./data";
import { idHref } from "./registers";

const UNREAD = { value: "—", tone: "neutral" as const, status: "Unavailable", helper: "could not be read" };

function pct(n: number, of: number): number {
  return of > 0 ? Math.round((n / of) * 1000) / 10 : 0;
}

export function IdentityKpis({ data, now }: { data: IdentityData; now: number }) {
  const s = data.summary.data;
  const sessions = data.sessions.rows.filter((x) => x.state === "ACTIVE");
  const risky = sessions.filter(elevated).length;
  void now;

  const active = s
    ? {
        value: (s.principals_by_status.ACTIVE ?? 0).toLocaleString(),
        tone: "navy" as const,
        status: "Scoped",
        helper: `${s.active_principals_by_type.HUMAN ?? 0} people · ${(s.active_principals_by_type.SERVICE_ACCOUNT ?? 0) + (s.active_principals_by_type.API_CLIENT ?? 0)} workloads`,
      }
    : UNREAD;
  const strong = s
    ? s.active_humans === 0
      ? { value: "—", tone: "neutral" as const, status: "No people yet", helper: "nobody to measure" }
      : {
          value: `${pct(s.active_humans_with_mfa, s.active_humans)}%`,
          tone: s.active_humans_with_mfa === s.active_humans ? ("green" as const) : ("amber" as const),
          status: "MFA / passkey",
          helper: `${s.active_humans_with_mfa} of ${s.active_humans} active people`,
        }
    : UNREAD;
  const risk = data.sessions.error
    ? UNREAD
    : {
        value: risky,
        tone: risky > 0 ? ("red" as const) : ("green" as const),
        status: risky > 0 ? "Needs review" : "None",
        helper: `of ${sessions.length} live sessions`,
      };
  const support = s
    ? {
        value: s.support_pending_approval,
        tone: s.support_pending_approval > 0 ? ("amber" as const) : ("green" as const),
        status: s.support_pending_approval > 0 ? "Awaiting approver" : "Clear",
        helper: `${s.support_active} support session${s.support_active === 1 ? "" : "s"} live`,
      }
    : UNREAD;
  const failed = s
    ? {
        value: s.failed_sign_ins_24h,
        tone: s.failed_sign_ins_24h > 0 ? ("amber" as const) : ("green" as const),
        status: "Last 24 h",
        helper: `${s.successful_sign_ins_24h} successful sign-ins`,
      }
    : UNREAD;

  return (
    <KpiGrid>
      <KpiCard label="Active identities in scope" icon={UsersRound} href={idHref({ tab: "people", status: "ACTIVE" })} {...active} />
      <KpiCard label="Strong authentication" icon={LockKeyhole} href={idHref({ tab: "people" })} {...strong} />
      <KpiCard label="Elevated-risk sessions" icon={Siren} href={idHref({ tab: "sessions", risk: "elevated" })} {...risk} />
      <KpiCard label="Support access awaiting approval" icon={ShieldQuestion} href={idHref({ tab: "support", state: "PENDING_APPROVAL" })} {...support} />
      <KpiCard label="Failed sign-ins" icon={AlertTriangle} href={idHref({ tab: "events", outcome: "FAILURE" })} {...failed} />
    </KpiGrid>
  );
}

export function IdentityPanels({ data, now }: { data: IdentityData; now: number }) {
  return (
    <PanelGrid>
      <AssurancePanel data={data} />
      <AuthenticationPanel data={data} />
      <SignalsPanel data={data} now={now} />
    </PanelGrid>
  );
}

// ── 1. Current identity assurance ────────────────────────────────────────────

function Donut({ parts, centre, caption }: { parts: { value: number; className: string }[]; centre: string; caption: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = 15.915; // circumference 100
  let offset = 25;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 42 42" className="h-32 w-32 -rotate-0" role="img" aria-label={`${centre} ${caption}`}>
        <circle cx="21" cy="21" r={r} fill="none" strokeWidth="5" className="stroke-slate-100 dark:stroke-slate-800" />
        {total > 0 &&
          parts.map((p, i) => {
            const len = (p.value / total) * 100;
            const el = (
              <circle
                key={i}
                cx="21"
                cy="21"
                r={r}
                fill="none"
                strokeWidth="5"
                strokeDasharray={`${len} ${100 - len}`}
                strokeDashoffset={offset}
                className={p.className}
              />
            );
            offset -= len;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold text-navy-950 dark:text-slate-100">{centre}</span>
        <span className="text-[10.5px] text-slate-500">{caption}</span>
      </div>
    </div>
  );
}

function AssurancePanel({ data }: { data: IdentityData }) {
  const s = data.summary.data;
  if (!s) {
    return (
      <ConsolePanel title="Current identity assurance" description="Who has a second factor, who would need one, who is stopped">
        <PanelNote>The identity summary could not be read, so nothing is shown rather than a guess.</PanelNote>
      </ConsolePanel>
    );
  }
  const satisfied = s.active_humans_with_mfa;
  const stepUp = Math.max(0, s.active_humans - s.active_humans_with_mfa);
  const blocked = (s.principals_by_status.SUSPENDED ?? 0) + (s.principals_by_status.DISABLED ?? 0);
  const total = satisfied + stepUp + blocked;
  const rows = [
    { label: "Assurance satisfied", value: satisfied, dot: "bg-emerald-500", ring: "stroke-emerald-500" },
    { label: "Step-up required", value: stepUp, dot: "bg-amber-500", ring: "stroke-amber-500" },
    { label: "Restricted / blocked", value: blocked, dot: "bg-rose-500", ring: "stroke-rose-500" },
  ];
  return (
    <ConsolePanel
      title="Current identity assurance"
      description="Active people by second factor, and principals stopped"
      link={{ label: "View people", href: idHref({ tab: "people" }) }}
    >
      <div className="flex items-center gap-5">
        <Donut
          parts={rows.map((r) => ({ value: r.value, className: r.ring }))}
          centre={total > 0 ? `${Math.round((satisfied / total) * 100)}%` : "—"}
          caption="Trusted"
        />
        <ul className="min-w-0 flex-1 space-y-2.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3 text-[12.5px]">
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <span className={`h-2 w-2 rounded-full ${r.dot}`} />
                {r.label}
              </span>
              <span className="font-semibold tabular-nums text-navy-950 dark:text-slate-100">{r.value.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800">
        Measured against the factors enrolled and each principal&apos;s status, as of {new Date(s.generated_at).toLocaleTimeString()}.
      </p>
      {s.admins_without_mfa > 0 && (
        <PanelCallout>
          {s.admins_without_mfa} administrator{s.admins_without_mfa === 1 ? " has" : "s have"} no second factor. Privileged changes will ask
          them to step up and they cannot.
        </PanelCallout>
      )}
    </ConsolePanel>
  );
}

// ── 2. Authentication & federation ───────────────────────────────────────────

function Row({ icon: Icon, title, caption, value }: { icon: LucideIcon; title: string; caption: string; value: string }) {
  return (
    <li className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-navy-600 ring-1 ring-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-navy-950 dark:text-slate-100">{title}</span>
        <span className="block text-[11px] text-slate-500">{caption}</span>
      </span>
      <span className="text-[13px] font-semibold tabular-nums text-navy-950 dark:text-slate-100">{value}</span>
    </li>
  );
}

function AuthenticationPanel({ data }: { data: IdentityData }) {
  const s = data.summary.data;
  if (!s) {
    return (
      <ConsolePanel title="Authentication & federation" description="How principals prove who they are">
        <PanelNote>The identity summary could not be read.</PanelNote>
      </ConsolePanel>
    );
  }
  const active = s.principals_by_status.ACTIVE ?? 0;
  const share = (n: number) => (active > 0 ? `${Math.round((n / active) * 100)}%` : "—");
  const f = s.factor_holders;
  return (
    <ConsolePanel
      title="Authentication & federation"
      description="Credentials held by active principals, and the last 24 hours"
      link={{ label: "Sign-in events", href: idHref({ tab: "events" }) }}
    >
      <ul>
        <Row icon={Fingerprint} title="Passkeys / FIDO2" caption="Phishing-resistant assurance" value={share(f.PASSKEY ?? 0)} />
        <Row icon={KeyRound} title="Authenticator app (TOTP)" caption="Second factor for step-up" value={share(f.TOTP ?? 0)} />
        <Row icon={Link2} title="Federated SSO" caption="Provider-bound enterprise login" value={share(f.FEDERATED ?? 0)} />
        <Row
          icon={UserRoundCheck}
          title="Step-up challenges"
          caption="Second factor proven, last 24 h"
          value={(s.pipeline_24h.STEPPED_UP ?? 0).toLocaleString()}
        />
        <Row icon={TimerReset} title="Sessions ended" caption="Revoked, capped or signed out, last 24 h" value={(s.pipeline_24h.ENDED ?? 0).toLocaleString()} />
      </ul>
    </ConsolePanel>
  );
}

// ── 3. Access context signals ────────────────────────────────────────────────

type Signal = { at: string; icon: LucideIcon; tone: string; title: string; caption: string; href: string };

function SignalsPanel({ data, now }: { data: IdentityData; now: number }) {
  const signals: Signal[] = [];
  for (const e of data.events.rows.filter((x) => x.outcome === "FAILURE").slice(0, 3)) {
    signals.push({
      at: e.occurred_at,
      icon: AlertTriangle,
      tone: "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
      title: e.event_type === "FAILED_LOGIN" ? "Failed sign-in" : `${e.event_type.replace("_", " ").toLowerCase()} refused`,
      caption: `Denied · ${e.details?.basis?.replaceAll("_", " ") ?? "no reason recorded"}`,
      href: idHref({ tab: "events", id: e.event_id }),
    });
  }
  for (const r of data.support.rows.filter((x) => x.approval_status === "PENDING_APPROVAL" && !x.revoked_at).slice(0, 2)) {
    signals.push({
      at: r.granted_at,
      icon: ShieldQuestion,
      tone: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
      title: "Support access awaiting approval",
      caption: `${r.reason_code.replaceAll("_", " ").toLowerCase()} · ticket ${r.ticket_ref}`,
      href: idHref({ tab: "support", id: r.support_context_id }),
    });
  }
  for (const s of data.sessions.rows.filter((x) => x.state === "ACTIVE" && elevated(x)).slice(0, 2)) {
    signals.push({
      at: s.issued_at,
      icon: Siren,
      tone: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
      title: "Elevated-risk session",
      caption: `${s.display_name || s.principal_id} · ${s.trust_posture.replaceAll("_", " ").toLowerCase()}`,
      href: idHref({ tab: "sessions", id: s.session_context_id }),
    });
  }
  signals.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const unreadable = data.events.error && data.support.error && data.sessions.error;

  return (
    <ConsolePanel
      title="Access context signals"
      description="Refusals and requests that need a person's attention"
      link={{ label: "Open sign-in events", href: idHref({ tab: "events", outcome: "FAILURE" }) }}
    >
      {unreadable ? (
        <PanelNote>None of the signal sources could be read.</PanelNote>
      ) : signals.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-4 text-[12px] text-slate-500 dark:border-slate-700">
          <ShieldCheck className="h-5 w-5 text-emerald-500" />
          No refusals, pending support requests or elevated sessions right now.
        </div>
      ) : (
        <ul className="space-y-2">
          {signals.slice(0, 4).map((x, i) => (
            <li key={i}>
              <a
                href={x.href}
                className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60"
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${x.tone}`}>
                  <x.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-navy-950 dark:text-slate-100">{x.title}</span>
                  <span className="block truncate text-[11px] text-slate-500">{x.caption}</span>
                </span>
                <span className="shrink-0 text-[10.5px] text-slate-400">{ago(x.at, now)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </ConsolePanel>
  );
}
