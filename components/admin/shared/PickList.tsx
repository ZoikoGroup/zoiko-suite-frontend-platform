"use client";

// A <select> of records from another register (counterparties, vendor
// profiles, documents…), loaded as the session from GET /api/pick-lists/<kind>.
// It replaces a free-text id box: the registers issue prefixed ids that are
// easy to mistype and several services store an unknown id unchecked. A failed
// read shows the service's reason; nothing is offered in its place.
//
// Lists load in parallel (plain GETs, not Server Actions, which run one at a
// time). Change `reloadKey` to read the list again, e.g. after a create.

import { useEffect, useState } from "react";
import type { PickListKind } from "@/lib/pick-lists";
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
  /** A free value is allowed; the register's records are offered as suggestions. */
  allowOther?: boolean;
  /**
   * Choose several (sent as one value per line). When the register cannot be
   * read, a text box takes one value per line instead, so the form stays usable.
   */
  multiple?: boolean;
  /** Values chosen at first (multiple only), e.g. the signed-in principal. */
  initial?: string[];
  /** Change it to read the register again. */
  reloadKey?: string | number;
};

async function fetchOptions(kind: PickListKind): Promise<Options> {
  try {
    const res = await fetch(`/api/pick-lists/${kind}`, { cache: "no-store" });
    const body = (await res.json().catch(() => null)) as Options | null;
    if (body && typeof body === "object" && "ok" in body) return body;
    return { ok: false, error: `HTTP ${res.status}` };
  } catch {
    return { ok: false, error: "could not be loaded" };
  }
}

export function PickList({
  id,
  name,
  kind,
  className,
  required,
  blank = "Select…",
  empty = "Nothing to choose from yet",
  value,
  onChange,
  allowOther,
  multiple,
  initial,
  reloadKey,
}: Props) {
  const [options, setOptions] = useState<Options | null>(null);

  useEffect(() => {
    let live = true;
    void fetchOptions(kind).then((o) => {
      if (live) setOptions(o);
    });
    return () => {
      live = false;
    };
  }, [kind, reloadKey]);

  const failed = options && !options.ok ? <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Could not be read: {options.error}</p> : null;
  const none = options?.ok && options.items.length === 0 ? <p className="mt-1 text-[11px] text-slate-400">{empty}</p> : null;

  if (multiple) {
    // The directory could not be read: one value per line, as before the picker.
    if (options && !options.ok) {
      return (
        <>
          <textarea id={id} name={name} required={required} rows={3} defaultValue={(initial ?? []).join("\n")} className={className} />
          {failed}
          <p className="mt-1 text-[11px] text-slate-400">Enter one ID per line.</p>
        </>
      );
    }
    const items = options?.ok ? options.items : [];
    const extra = (initial ?? []).filter((v) => !items.some((o) => o.value === v));
    return (
      <>
        <select
          id={id}
          name={name}
          multiple
          required={required}
          aria-required={required}
          size={Math.min(6, Math.max(3, items.length + extra.length))}
          // Re-mounted once the options arrive so the initial selection applies to them.
          key={options ? "loaded" : "loading"}
          defaultValue={initial ?? []}
          className={className}
        >
          {/* An initial value the register does not list (the signed-in principal,
              taken from the session) is still offered, labelled as such. */}
          {extra.map((v) => (
            <option key={v} value={v}>
              You (signed in) · {v}
            </option>
          ))}
          {items.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {options === null && <p className="mt-1 text-[11px] text-slate-400">Loading…</p>}
        {none}
      </>
    );
  }

  if (allowOther) {
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
          {options?.ok &&
            options.items.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
        </datalist>
      </>
    );
  }

  const controlled =
    value !== undefined ? { value, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value) } : { defaultValue: "" };
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
      {failed}
      {none}
    </>
  );
}
