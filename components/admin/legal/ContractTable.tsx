import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import { ContractStatusBadge } from "./ContractStatusBadge";
import type { Contract } from "@/lib/api/contracts";

const COLUMNS = [
  { key: "title", label: "Contract", align: "left" },
  { key: "counterparty", label: "Counterparty", align: "left" },
  { key: "status", label: "Status", align: "left" },
  { key: "value", label: "Value", align: "right" },
  { key: "term", label: "Term", align: "left" },
  { key: "version", label: "Ver", align: "right" },
  { key: "open", label: "", align: "right" },
] as const;

const HEAD =
  "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400";

const CELL = "px-4 py-3 text-sm text-slate-700 dark:text-slate-300";

/** "01 Jan 2026 → 31 Dec 2026", or "→ open-ended" when the service holds no end
 *  date. An open-ended term is a real contractual position, not missing data, so
 *  it is labelled rather than left blank. */
function term(contract: Contract): string {
  const from = formatDate(contract.effective_from);
  return contract.effective_to ? `${from} → ${formatDate(contract.effective_to)}` : `${from} → open-ended`;
}

/**
 * The contract register.
 *
 * Entirely a server component: every lifecycle action lives on the contract's
 * own page, so no part of this table needs to ship to the browser.
 */
export function ContractTable({ contracts }: { contracts: Contract[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[54rem] border-collapse text-left">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(HEAD, column.align === "right" ? "text-right" : "text-left")}
              >
                {column.label || <span className="sr-only">Open</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {contracts.map((contract) => (
            <tr
              key={contract.contract_id}
              className="transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <td className={CELL}>
                <Link
                  href={`/admin/legal/${contract.contract_id}`}
                  className="font-medium text-slate-900 underline-offset-4 hover:text-navy-700 hover:underline dark:text-slate-100 dark:hover:text-navy-300"
                >
                  {contract.title}
                </Link>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  {contract.contract_type}
                </p>
              </td>
              <td className={CELL}>
                {contract.counterparty_name || (
                  <span className="text-slate-400 dark:text-slate-500">
                    {contract.counterparty_id}
                  </span>
                )}
              </td>
              <td className={CELL}>
                <ContractStatusBadge status={contract.status} />
              </td>
              <td className={cn(CELL, "text-right tabular-nums")}>
                {formatMoney(contract.total_value, contract.currency)}
              </td>
              <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                {term(contract)}
              </td>
              <td
                className={cn(
                  CELL,
                  "text-right tabular-nums text-slate-500 dark:text-slate-400",
                )}
              >
                v{contract.version}
              </td>
              <td className={cn(CELL, "text-right")}>
                <Link
                  href={`/admin/legal/${contract.contract_id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-navy-700 hover:underline dark:text-navy-300"
                  aria-label={`Open ${contract.title}`}
                >
                  Open
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
