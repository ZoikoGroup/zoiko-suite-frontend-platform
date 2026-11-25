// "New Policy / Control": the gold header menu, and the panel it opens under
// the header (?new=…). Each entry is a real policy-svc write through the
// existing Server Actions; Import is not offered because policy-svc has no
// import endpoint.

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { Card } from "@/components/ui";
import { ActivateVersionForm, CreatePolicyForm, CreateVersionForm, EvaluatePolicyForm } from "../PolicyForms";
import { CreateControlTestForm } from "./forms";
import { href, type Query } from "./data";
import type { Row } from "./model";

const ITEMS: { key: string; label: string; hint: string }[] = [
  { key: "policy", label: "New policy", hint: "Name a rule; it sets nothing until a version is in force" },
  { key: "version", label: "Draft a policy version", hint: "The rule's content and dates, as a draft" },
  { key: "activate", label: "Activate a version", hint: "Bring an approved version into force" },
  { key: "evaluate", label: "Evaluate an action", hint: "Check an amount against the threshold in force" },
  { key: "control", label: "Define a control test", hint: "The methodology a control is tested by" },
];

export function NewMenu({ query }: { query: Query }) {
  return (
    <details className="group relative">
      <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg bg-gold-500 px-4 text-sm font-medium text-white shadow-sm shadow-gold-600/20 hover:bg-gold-600 [&::-webkit-details-marker]:hidden">
        <Plus className="h-4 w-4" />
        New Policy / Control
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        {ITEMS.map((i) => (
          <Link key={i.key} href={href(query, { new: i.key })} scroll={false} className="block rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
            <span className="block text-[13px] font-semibold text-navy-950 dark:text-slate-100">{i.label}</span>
            <span className="block text-[11.5px] text-slate-500 dark:text-slate-400">{i.hint}</span>
          </Link>
        ))}
      </div>
    </details>
  );
}

export function NewPanel({ query, open }: { query: Query; open?: Row }) {
  const item = ITEMS.find((i) => i.key === query.new);
  if (!item) return null;
  let body: ReactNode;
  switch (item.key) {
    case "policy":
      body = <CreatePolicyForm />;
      break;
    case "version":
      body = <CreateVersionForm defaultPolicyId={open?.kind === "policy" ? open.id : undefined} />;
      break;
    case "activate":
      body = <ActivateVersionForm />;
      break;
    case "evaluate":
      body = <EvaluatePolicyForm />;
      break;
    default:
      body = <CreateControlTestForm defaultRef={open?.kind === "policy" ? open.ref : undefined} />;
  }
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-navy-950 dark:text-slate-100">{item.label}</h2>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
            {item.hint}
            {item.key === "version" && open?.kind === "policy" && ` · for ${open.ref}`}
          </p>
        </div>
        <Link href={href(query, { new: undefined })} scroll={false} aria-label="Close" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-4 w-4" />
        </Link>
      </div>
      {body}
    </Card>
  );
}
