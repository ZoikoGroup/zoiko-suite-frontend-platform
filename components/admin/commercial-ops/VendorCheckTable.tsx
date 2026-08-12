import { ShieldAlert, ShieldQuestion, ShieldOff, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui";
import { CopyableId, PanelEmptyState } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  readCheck,
  isStubScreened,
  type CheckReading,
  type VendorCheck,
} from "@/lib/api/vendor-due-diligence";

/**
 * How each reading is presented. The wording is the substance here, not decoration.
 *
 * "Screened, no match" rather than "Clear" or "Passed". The service compares a name
 * against a hardcoded list of two, exactly — so the defensible claim is that a
 * comparison happened and returned nothing, which is what this says. A column
 * reading "Clear" would be a stronger statement than the data supports, and an
 * operator scanning the register would take it as one.
 *
 * `unconcluded` and `failed` are rose, not grey: a check with no outcome is the
 * state most likely to be misread as benign, because an empty result column looks
 * like nothing went wrong.
 */
const READING: Record<
  CheckReading,
  { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral"; hint: string }
> = {
  "screened-no-match": {
    label: "Screened, no match",
    tone: "neutral",
    hint: "A comparison ran and returned nothing. Not a clearance.",
  },
  flagged: {
    label: "Flagged",
    tone: "warning",
    hint: "The name matched the screening list. Counterparty pushed to REJECTED, risk HIGH.",
  },
  unconcluded: {
    label: "No outcome",
    tone: "danger",
    hint: "Recorded but never concluded. Screening is synchronous, so this is a lost result — this counterparty has not been screened.",
  },
  failed: {
    label: "Failed",
    tone: "danger",
    hint: "The screening ran but its outcome could not be recorded, so there is no result. Run it again.",
  },
};

/**
 * The screening register — every check for this tenant, newest first.
 *
 * Every run is listed rather than one row per counterparty, because the history IS
 * the audit trail: who screened what, when, and what the basis was. The
 * "latest per counterparty" question is answered by the summary tiles above, which
 * deliberately ignore unconcluded runs — a lost screening does not supersede the
 * answer that came before it.
 */
export function VendorCheckTable({
  checks,
  narrowed,
}: {
  checks: VendorCheck[];
  narrowed: boolean;
}) {
  if (checks.length === 0) {
    return (
      <PanelEmptyState
        icon={ShieldQuestion}
        label={narrowed ? "No checks match these filters" : "No counterparty has been screened"}
        hint={
          narrowed
            ? "Both filters are applied by the service and compose with AND — clear one to widen the register. A filter that matches nothing is reported as empty rather than as an error, because these are text columns and any value is a valid comparison."
            : "Screen one above. Until a counterparty has been checked, nothing in this platform has looked at it — which is not the same as it having been found acceptable."
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-3xl border-collapse text-left">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th scope="col" className={HEAD}>
              Vendor
            </th>
            <th scope="col" className={HEAD}>
              Outcome
            </th>
            <th scope="col" className={HEAD}>
              Basis
            </th>
            <th scope="col" className={HEAD}>
              Counterparty
            </th>
            <th scope="col" className={HEAD}>
              Screened
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {checks.map((check) => {
            const reading = readCheck(check);
            const { label, tone, hint } = READING[reading];
            const noOutcome = reading === "unconcluded" || reading === "failed";

            return (
              <tr
                key={check.check_id}
                className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <td className={cn(CELL, "font-medium text-slate-900 dark:text-slate-100")}>
                  <span className="break-words">{check.vendor_name}</span>
                  <CopyableId value={check.check_id} className="mt-0.5" />
                </td>

                <td className={CELL}>
                  <div className="flex flex-col gap-1">
                    <span className="inline-flex items-center gap-1.5">
                      {reading === "flagged" && (
                        <ShieldAlert
                          className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
                          aria-hidden="true"
                        />
                      )}
                      {noOutcome && (
                        <ShieldOff
                          className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400"
                          aria-hidden="true"
                        />
                      )}
                      <Badge tone={tone}>{label}</Badge>
                    </span>
                    {/* Every row carries the caveat, not just the panel header. A
                        register is read row by row, and a caption at the top of the
                        card is not attached to the row an operator is looking at. */}
                    {reading === "screened-no-match" && isStubScreened(check) && (
                      <span className="inline-flex items-start gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                        <FlaskConical className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                        stub list, exact match
                      </span>
                    )}
                    <span className="text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                      {hint}
                    </span>
                  </div>
                </td>

                <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                  {check.screening_basis ? (
                    <span className="break-words text-xs">{check.screening_basis}</span>
                  ) : (
                    <span className="text-[11px] italic text-slate-400 dark:text-slate-500">
                      none recorded
                    </span>
                  )}
                </td>

                <td className={CELL}>
                  <CopyableId value={check.counterparty_id} />
                </td>

                <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                  {formatDateTime(check.started_at)}
                  {/* completed_at is absent on an unconcluded check, and saying so
                      is more useful than an empty cell. */}
                  <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                    {check.completed_at
                      ? `concluded ${formatDateTime(check.completed_at)}`
                      : "never concluded"}
                  </p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
