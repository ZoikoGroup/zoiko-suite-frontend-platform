"use client";

// A <select> of records from another register (counterparties, vendor
// profiles, approved requisitions…), loaded as the session. It replaces a
// free-text id box: the registers issue prefixed ids that are easy to mistype
// and several services store an unknown id unchecked. A failed read shows the
// service's reason; nothing is offered in its place.

import { useEffect, useState } from "react";
import { loadPickList, type PickListKind } from "@/app/admin/pick-lists";
import type { Options } from "@/lib/form-options";

type Props = {
  id: string;
  name: string;
  kind: PickListKind;
  className: string;
  required?: boolean;
  /** Label of the blank option (e.g. "None"). Defaults to "Select…". */
  blank?: string;
  /** What to say when the register holds nothing yet. */
  empty?: string;
  /** Controlled use. */
  value?: string;
  onChange?: (value: string) => void;
  /** Allow a value not in the list (kept as typed, e.g. a free category). */
  allowOther?: boolean;
};

export function PickList({ id, name, kind, className, required, blank = "Select…", empty = "Nothing to choose from yet", value, onChange, allowOther }: Props) {
  const [options, setOptions] = useState<Options | null>(null);

  useEffect(() => {
    let live = true;
    loadPickList(kind)
      .then((o) => live && setOptions(o))
      .catch(() => live && setOptions({ ok: false, error: "could not be loaded" }));
    return () => {
      live = false;
    };
  }, [kind]);

  const controlled = value !== undefined ? { value, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value) } : { defaultValue: "" };

  if (allowOther) {
    // A typed value is allowed; the list only suggests.
    const listId = `${id}-choices`;
    return (
      <>
        <input
          id={id}
          name={name}
          list={listId}
          required={required}
          autoComplete="off"
          className={className}
          {...(value !== undefined ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value) } : {})}
        />
        <datalist id={listId}>
          {options?.ok && options.items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </datalist>
      </>
    );
  }

  return (
    <>
      <select id={id} name={name} required={required} aria-required={required} className={className} {...controlled}>
        <option value="">{options === null ? "Loading…" : blank}</option>
        {options?.ok &&
          options.items.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
      {options && !options.ok && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Could not be read: {options.error}</p>}
      {options?.ok && options.items.length === 0 && <p className="mt-1 text-[11px] text-slate-400">{empty}</p>}
    </>
  );
}
