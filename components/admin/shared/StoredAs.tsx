import { cn } from "@/lib/utils";

/**
 * The stored code behind a plain-English label.
 *
 * Shown everywhere a label replaces a value. The wording this console puts on a
 * record is its own reading of it, and an operator quoting that record to
 * support — or an auditor citing it in a finding — needs the value the service
 * actually holds, not our paraphrase of it. So the humanised label never
 * replaces the code; it sits above it.
 *
 * Lived in PolicySummary until the evidence pages needed the same line. Shared
 * rather than copied, on the same argument as form.ts: a divergence between two
 * domains' rendering of the same idea reads as a bug rather than a choice.
 */
export function StoredAs({ code, className }: { code: string; className?: string }) {
  return (
    <p className={cn("text-xs text-slate-400 dark:text-slate-500", className)}>
      Recorded by the service as{" "}
      <span className="font-mono text-slate-500 dark:text-slate-400">{code}</span>
    </p>
  );
}
