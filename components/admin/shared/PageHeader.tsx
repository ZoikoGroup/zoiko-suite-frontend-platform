import type { ReactNode } from "react";
import { Breadcrumbs } from "./Breadcrumbs";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-7 animate-fade-up">
      <Breadcrumbs />
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-navy-950 sm:text-[32px] dark:text-white">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}
