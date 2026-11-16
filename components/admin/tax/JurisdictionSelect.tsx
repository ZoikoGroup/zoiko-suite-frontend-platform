"use client";

import type { JurisdictionOptions } from "./jurisdiction-options";

/** "GB — United Kingdom", the reading every jurisdiction picker uses. */
export function jurisdictionLabel(code: string, name: string): string {
  return `${code} — ${name}`;
}

/** Whether a form fed by these options may submit at all. */
export function jurisdictionsUsable(options: JurisdictionOptions): boolean {
  return options.ok && options.items.some((j) => j.active);
}

/**
 * A jurisdiction <select> whose value is the jurisdiction-rules-svc UUID.
 *
 * Inactive jurisdictions are listed (they explain old records) but cannot be
 * chosen: jurisdiction-rules-svc's lookup answers 404 for them, so every
 * service validating against it would refuse the write. When the register
 * could not be read the select is replaced by the service's error, and the
 * caller disables its submit (see jurisdictionsUsable).
 */
export function JurisdictionSelect({
  id,
  name,
  label,
  options,
  className,
  labelClassName,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  options: JurisdictionOptions;
  className: string;
  labelClassName: string;
  /** Controlled use; omit both for an uncontrolled <form action> field. */
  value?: string;
  onChange?: (value: string) => void;
}) {
  if (!options.ok) {
    return (
      <div>
        <span className={labelClassName}>{label}</span>
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          The jurisdiction register could not be read, so this form cannot be submitted: {options.error}
        </p>
      </div>
    );
  }
  const controlled = value !== undefined ? { value, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value) } : { defaultValue: "" };
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <select id={id} name={name} required className={className} {...controlled}>
        <option value="" disabled>
          {options.items.length === 0 ? "No jurisdictions registered" : "Select a jurisdiction"}
        </option>
        {options.items.map((j) => (
          <option key={j.id} value={j.id} disabled={!j.active}>
            {jurisdictionLabel(j.code, j.name)}
            {j.active ? "" : " (inactive)"}
          </option>
        ))}
      </select>
    </div>
  );
}
