"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { shortId } from "@/lib/format";

/**
 * A truncated backend identifier that can still be copied whole.
 *
 * Bare UUIDs do not fit a table cell, so ids are shortened for display. But
 * several console workflows are explicitly copy-paste chains — a policy_id into
 * "add a draft version", a policy_version_id into "activate a version", a
 * decision_id into the governance log's lookup — and the full value was only ever
 * exposed as a `title` attribute, which hovers but cannot be selected. That left
 * every id on the page readable and unusable at the same time.
 *
 * Clicking copies the full value. The visible label stays shortened so column
 * widths do not change, and the full id remains in `title` for hover.
 *
 * Renders plain text rather than a button when there is no real id to copy, so
 * placeholder cells ("—", empty strings) do not offer a control that would put
 * nothing on the clipboard.
 */
export function CopyableId({
  value,
  className,
  label,
}: {
  value: string | null | undefined;
  className?: string;
  /** Overrides the shortened display text. The full `value` is still what copies. */
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A row can unmount while the "Copied" window is still open — during a
  // revalidate after a write, which is exactly when someone is copying ids.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = useCallback(async () => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // navigator.clipboard needs a secure context and can be blocked by
      // permissions policy. Falling back keeps the control honest rather than
      // reporting success on a copy that did not happen.
      const ok = copyViaTextarea(value);
      if (!ok) return;
    }

    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }, [value]);

  if (!value || value === "—") {
    return (
      <span className={cn("font-mono text-[11px] text-slate-400 dark:text-slate-500", className)}>
        {label ?? value ?? "—"}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : `${value} — click to copy`}
      aria-label={copied ? `Copied ${value}` : `Copy full id ${value}`}
      className={cn(
        "group inline-flex max-w-full items-center gap-1 rounded font-mono text-[11px] text-slate-400 transition-colors duration-150",
        "hover:text-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-1",
        "dark:text-slate-500 dark:hover:text-navy-300 dark:focus-visible:ring-offset-slate-900",
        copied && "text-emerald-600 dark:text-emerald-400",
        className,
      )}
    >
      <span className="truncate">{label ?? shortId(value)}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : (
        <Copy
          className="h-3 w-3 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        />
      )}
      {/* Announced to screen readers on copy; the icon swap alone is silent. */}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}

/**
 * Clipboard fallback for contexts where navigator.clipboard is unavailable.
 * Returns whether the copy actually succeeded.
 */
function copyViaTextarea(value: string): boolean {
  try {
    const field = document.createElement("textarea");
    field.value = value;
    // Keep it out of the layout and off-screen so focusing it does not scroll.
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "-9999px";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
}
