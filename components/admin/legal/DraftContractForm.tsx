"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { CONTRACT_TYPES } from "@/lib/api/contracts";
import { draftContract } from "@/app/admin/legal/actions";
import {
  IDLE_CONTRACT_STATE,
  CONTRACT_CURRENCIES,
  type ContractActionState,
} from "@/app/admin/legal/state";
import { FIELD, LABEL, OPTIONAL } from "./field-styles";
import { ActionFeedback } from "./ActionFeedback";

/** Contract types read as acronyms; spell out the ones that are not obvious so
 *  the select is usable by someone who does not live in the domain. */
const TYPE_LABELS: Record<string, string> = {
  VENDOR: "Vendor agreement",
  EMPLOYMENT: "Employment contract",
  NDA: "NDA",
  MSA: "MSA — master services agreement",
  SLA: "SLA — service level agreement",
  PARTNERSHIP: "Partnership agreement",
  OTHER: "Other",
};

export function DraftContractForm() {
  const [state, action, pending] = useActionState<ContractActionState, FormData>(
    draftContract,
    IDLE_CONTRACT_STATE,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="title" className={LABEL}>
            Contract title
          </label>
          <input
            id="title"
            name="title"
            required
            placeholder="Managed hosting — Northwind Cloud Ltd"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="contract_type" className={LABEL}>
            Type
          </label>
          <select id="contract_type" name="contract_type" defaultValue="VENDOR" className={FIELD}>
            {CONTRACT_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type] ?? type}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="counterparty_id" className={LABEL}>
            Counterparty ID
          </label>
          <input
            id="counterparty_id"
            name="counterparty_id"
            required
            placeholder="cp-northwind-cloud"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="counterparty_name" className={LABEL}>
            Counterparty name <span className={OPTIONAL}>(optional)</span>
          </label>
          <input
            id="counterparty_name"
            name="counterparty_name"
            placeholder="Northwind Cloud Ltd"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="effective_from" className={LABEL}>
            Effective from
          </label>
          <input
            id="effective_from"
            name="effective_from"
            type="date"
            required
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="effective_to" className={LABEL}>
            Effective to <span className={OPTIONAL}>(blank = open-ended)</span>
          </label>
          <input id="effective_to" name="effective_to" type="date" className={FIELD} />
        </div>

        <div>
          <label htmlFor="total_value" className={LABEL}>
            Contract value
          </label>
          <input
            id="total_value"
            name="total_value"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="48000.00"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="currency" className={LABEL}>
            Currency
          </label>
          <select id="currency" name="currency" defaultValue="GBP" className={FIELD}>
            {CONTRACT_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="description" className={LABEL}>
            Description <span className={OPTIONAL}>(optional)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={2}
            placeholder="Scope, key obligations, renewal terms"
            className={FIELD}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Drafting…" : "Draft contract"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Created as DRAFT at v1 — not in force until it is activated
        </p>
      </div>

      <ActionFeedback state={state} className="px-3.5 py-3" />

      {state.status === "drafted" && state.contractId && (
        <Link
          href={`/admin/legal/${state.contractId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:underline dark:text-navy-300"
        >
          Open the contract to submit or activate it
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </form>
  );
}
