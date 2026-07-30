import type { ReactNode } from "react";
import { formatDate, formatDateTime, formatMoney, shortId } from "@/lib/format";
import type { Contract } from "@/lib/api/contracts";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-2.5 last:border-0 sm:grid sm:grid-cols-3 sm:gap-4 dark:border-slate-800">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-800 sm:col-span-2 sm:mt-0 dark:text-slate-200">
        {children}
      </dd>
    </div>
  );
}

function Absent({ children }: { children: ReactNode }) {
  return <span className="text-slate-400 dark:text-slate-500">{children}</span>;
}

/**
 * The stored terms of one contract.
 *
 * Signature and termination rows appear only once the service holds those
 * values, rather than rendering as permanent empty rows — an unsigned contract
 * has no signatory, which is different from a signatory the console failed to
 * read.
 */
export function ContractTerms({ contract }: { contract: Contract }) {
  return (
    <dl>
      <Row label="Counterparty">
        {contract.counterparty_name || <Absent>Name not recorded</Absent>}
        <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
          {contract.counterparty_id}
        </span>
      </Row>

      <Row label="Type">{contract.contract_type}</Row>

      <Row label="Term">
        {formatDate(contract.effective_from)}
        {" → "}
        {contract.effective_to ? (
          formatDate(contract.effective_to)
        ) : (
          <Absent>open-ended</Absent>
        )}
      </Row>

      <Row label="Value">
        <span className="tabular-nums">
          {formatMoney(contract.total_value, contract.currency)}
        </span>
      </Row>

      <Row label="Legal entity">
        <span title={contract.legal_entity_id}>{shortId(contract.legal_entity_id)}</span>
      </Row>

      {contract.description ? <Row label="Description">{contract.description}</Row> : null}

      <Row label="Drafted">
        {formatDateTime(contract.created_at)} by{" "}
        <span title={contract.created_by}>{shortId(contract.created_by)}</span>
      </Row>

      {contract.signed_by ? (
        <Row label="Signed">
          {contract.signed_at ? formatDateTime(contract.signed_at) : <Absent>date not recorded</Absent>}{" "}
          by {contract.signed_by}
        </Row>
      ) : null}

      {contract.document_vault_id ? (
        <Row label="Executed document">
          <span title={contract.document_vault_id}>{shortId(contract.document_vault_id)}</span>
          <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
            reference only — document-vault-svc is not wired to this console
          </span>
        </Row>
      ) : null}

      {contract.terminated_by ? (
        <Row label="Terminated">
          {contract.terminated_at ? (
            formatDateTime(contract.terminated_at)
          ) : (
            <Absent>date not recorded</Absent>
          )}{" "}
          by <span title={contract.terminated_by}>{shortId(contract.terminated_by)}</span>
          {contract.termination_note ? (
            <p className="mt-1 text-slate-600 dark:text-slate-300">{contract.termination_note}</p>
          ) : null}
        </Row>
      ) : null}

      <Row label="Contract ID">
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {contract.contract_id}
        </code>
      </Row>
    </dl>
  );
}
