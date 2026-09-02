import { CopyableId } from "@/components/admin/shared";

/**
 * An id with a caption.
 *
 * CopyableId's own `label` REPLACES the displayed text rather than captioning
 * it, so passing "Tenant ID" there would show the words and hide the value —
 * the opposite of what a form result needs, since almost every id these forms
 * return is required as input by another form on the same page.
 *
 * Lives in its own file because both TenantForms and WorkspaceForms render form
 * results, and a second copy would drift.
 */
export function LabelledId({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <CopyableId value={value} />
    </div>
  );
}
