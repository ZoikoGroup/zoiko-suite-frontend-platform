import { ShieldCheck, GitBranch, Boxes } from "lucide-react";
import { Logo } from "@/components/ui";

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: "Governance-first execution",
    body: "No material action completes outside a governed, evidential control layer.",
  },
  {
    icon: GitBranch,
    title: "Event-driven, API-first",
    body: "Every domain emits typed, append-only events across a unified spine.",
  },
  {
    icon: Boxes,
    title: "Multi-entity, multi-jurisdiction",
    body: "Entity and jurisdiction are runtime primitives, not configuration.",
  },
];

export function LoginBrandPanel() {
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden bg-navy-gradient px-12 py-14 text-white lg:flex">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-gold-500/10 blur-3xl animate-float-slow"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -right-16 h-112 w-md rounded-full bg-navy-400/20 blur-3xl animate-float-slower"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative z-10 animate-fade-up">
        <Logo height={30} chipSize="lg" className="shadow-lg" />
      </div>

      <div className="relative z-10 max-w-md animate-fade-up" style={{ animationDelay: "80ms" }}>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-300">
          Governed Business Operations Intelligence
        </p>
        <h1 className="mt-4 text-3xl font-semibold leading-tight text-white">
          The control plane for every financial, workforce, legal, and tax
          action your business takes.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-navy-100">
          Business operations must execute inside governance — not beside it,
          not after it. That is the platform.
        </p>

        <div className="mt-10 space-y-5">
          {PRINCIPLES.map((p, i) => (
            <div
              key={p.title}
              className="flex gap-3 animate-fade-up"
              style={{ animationDelay: `${160 + i * 90}ms` }}
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10">
                <p.icon className="h-4.5 w-4.5 text-gold-300" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{p.title}</p>
                <p className="text-xs leading-relaxed text-navy-200">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="relative z-10 text-xs text-navy-300 animate-fade-in" style={{ animationDelay: "400ms" }}>
        Sovereign Back-End Architecture · v2.1 Sovereign Grade Refined
      </p>
    </div>
  );
}
