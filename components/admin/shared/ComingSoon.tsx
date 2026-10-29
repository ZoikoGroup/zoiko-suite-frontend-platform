import { Hourglass } from "lucide-react";
import { PageHeader } from "./PageHeader";

/** A sidebar page that exists in the menu but has nothing behind it yet. */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <PageHeader title={title} description={description} />

      <div className="flex flex-col items-center rounded-xl border border-dashed border-navy-200 bg-navy-50/60 px-6 py-16 text-center animate-fade-up dark:border-navy-500/30 dark:bg-navy-500/10">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-100 dark:bg-gold-400/15">
          <Hourglass className="h-5 w-5 text-gold-600 dark:text-gold-300" />
        </span>
        <p className="mt-4 text-lg font-semibold text-navy-900 dark:text-white">Coming soon</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">This page is being built.</p>
      </div>
    </div>
  );
}
