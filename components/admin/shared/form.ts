// Form and banner styling shared across the admin pages.
//
// One definition rather than one per page: every page renders the same inputs,
// and a divergence between them reads as a rendering bug rather than a choice.

export const FIELD =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "outline-none transition-colors placeholder:text-slate-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

export const LABEL = "mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400";

export const HINT = "mt-1.5 text-xs text-slate-400 dark:text-slate-500";

export const OPTIONAL = "font-normal text-slate-400";

export const BANNER_SUCCESS =
  "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";

export const BANNER_NEUTRAL =
  "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300";

export const BANNER_WARNING =
  "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300";

export const BANNER_ERROR =
  "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300";

export const PANEL =
  "animate-fade-up space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40";

export const CELL = "px-4 py-3 text-sm text-slate-700 dark:text-slate-300";

export const HEAD =
  "px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400";
