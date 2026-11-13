// Pieces every Jurisdictions & Rules tab uses: the command dialog, status
// chips, and the "could not be read" notice.

import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import type { ApiError } from "@/lib/api/client";
import { explainJurisdictionProblem } from "@/lib/api/jurisdictions";
import { person } from "@/lib/directory";
import { commandAction } from "@/app/admin/jurisdictions/actions";
import { ActionDialog } from "@/components/admin/authorization/kit/ActionDialog";
import { TwoLine } from "@/components/admin/console";

type Tone = "success" | "warning" | "danger" | "neutral" | "info";

/**
 * One command: a dialog that posts `command` (and its hidden ids) to the
 * page's single Server Action. A form with fields opens as a side drawer, a
 * confirmation as a modal.
 */
export function Cmd({
  command,
  label,
  title,
  description,
  hidden,
  tone = "secondary",
  size = "sm",
  icon,
  submitLabel,
  footnote,
  children,
}: {
  command: string;
  label: string;
  title: string;
  description?: string;
  hidden?: Record<string, string | number | undefined | null>;
  tone?: "secondary" | "accent" | "danger" | "approve" | "primary";
  size?: "sm" | "md";
  icon?: ReactNode;
  submitLabel?: string;
  footnote?: ReactNode;
  children?: ReactNode;
}) {
  const clean = Object.fromEntries(Object.entries({ command, ...hidden }).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Record<string, string | number>;
  return (
    <ActionDialog
      label={label}
      icon={icon}
      tone={tone}
      size={size}
      title={title}
      description={description}
      action={commandAction}
      hidden={clean}
      submitLabel={submitLabel ?? label}
      variant={children ? "drawer" : "modal"}
      footnote={footnote}
    >
      {children}
    </ActionDialog>
  );
}

const TONES: Record<string, Tone> = {
  ACTIVE: "success",
  RELEASED: "success",
  PUBLISHED: "success",
  APPROVED: "success",
  LAUNCHED: "success",
  CLOSED: "neutral",
  CURRENT: "success",
  REVIEWED: "success",
  DRAFT: "warning",
  REVIEW: "warning",
  PROPOSED: "warning",
  OPEN: "warning",
  PENDING: "warning",
  UNDER_REVIEW: "warning",
  AUTHORING: "warning",
  READY: "info",
  PLANNED: "neutral",
  CERTIFIED: "info",
  SUPERSEDED: "neutral",
  RETIRED: "neutral",
  REJECTED: "danger",
  WITHDRAWN: "danger",
  EMERGENCY_BLOCKED: "danger",
  SUSPENDED: "danger",
  DRIFTED: "danger",
  PARKED: "danger",
  INACTIVE: "neutral",
};

export function toneOf(status: string | null | undefined): Tone {
  return TONES[(status ?? "").toUpperCase()] ?? "neutral";
}

export function label(status: string | null | undefined): string {
  const s = (status ?? "").replaceAll("_", " ").toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
}

export function StatusChip({ status, text }: { status: string | null | undefined; text?: string }) {
  return (
    <Badge tone={toneOf(status)} title={status ?? undefined} className="whitespace-nowrap">
      {text ?? label(status)}
    </Badge>
  );
}

export function Chip({ text, tone }: { text: string; tone: Tone }) {
  return (
    <Badge tone={tone} className="whitespace-nowrap">
      {text}
    </Badge>
  );
}

export function Who({ id }: { id: string | null | undefined }) {
  const p = person(id);
  return <TwoLine primary={p.name} secondary={p.title || undefined} />;
}

export function who(id: string | null | undefined): string {
  return id ? person(id).name : "—";
}

export function Mono({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="font-mono text-[11.5px]">
      {children}
    </span>
  );
}

export function shortHash(h: string | null | undefined): string {
  if (!h) return "—";
  const v = h.replace(/^sha256:/, "");
  return `${v.slice(0, 10)}…`;
}

/** A source that could not be read says so; it never shows as zero or empty. */
export function Unavailable({ what, error }: { what: string; error: ApiError }) {
  return (
    <div role="status" className="m-5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[12.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <span className="font-semibold">{what} unavailable.</span> {explainJurisdictionProblem(error)}
    </div>
  );
}

/** A short list inside a drawer pane. */
export function MiniList({ items, empty }: { items: { key: string; primary: ReactNode; secondary?: ReactNode; right?: ReactNode }[]; empty: string }) {
  if (items.length === 0) return <p className="py-3 text-[12px] text-slate-500 dark:text-slate-400">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((i) => (
        <li key={i.key} className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-navy-950 dark:text-slate-100">{i.primary}</p>
            {i.secondary && <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">{i.secondary}</p>}
          </div>
          {i.right && <div className="shrink-0">{i.right}</div>}
        </li>
      ))}
    </ul>
  );
}

export function PaneTitle({ children }: { children: ReactNode }) {
  return <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400 first:mt-1">{children}</p>;
}

/** The drawer footer's commands, wrapped when there are many. */
export function Commands({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2 *:min-w-0">{children}</div>;
}
