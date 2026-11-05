// What a register shows when evidence-requirements-svc could not be read: the
// evidence service's own explanation, never another service's wording, and
// never an empty table that would read as "nothing on record".

import { CircleAlert } from "lucide-react";
import type { ApiError } from "@/lib/api/client";
import { explainEvidenceError } from "@/lib/api/evidence";

export function EvidenceReadProblem({ error, what }: { error: ApiError; what: string }) {
  const code = typeof (error.body as { code?: unknown } | undefined)?.code === "string" ? (error.body as { code: string }).code : "";
  const forbidden = error.status === 403;
  return (
    <div className="flex items-start gap-3 px-5 py-6 text-sm">
      <CircleAlert className={forbidden ? "mt-0.5 h-4 w-4 shrink-0 text-slate-400" : "mt-0.5 h-4 w-4 shrink-0 text-amber-500"} />
      <p className="text-slate-600 dark:text-slate-300">
        {forbidden ? `You don't have access to ${what}. ` : `${what[0].toUpperCase()}${what.slice(1)} could not be read. `}
        {explainEvidenceError(`${code} ${error.message}`.trim())}
      </p>
    </div>
  );
}
