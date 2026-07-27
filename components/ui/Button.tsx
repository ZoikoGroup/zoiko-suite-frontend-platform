import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium " +
  "transition-all duration-200 ease-out focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const variants = {
  primary:
    "bg-navy-900 text-white shadow-sm hover:bg-navy-800 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:bg-navy-950 dark:bg-navy-600 dark:hover:bg-navy-500",
  secondary:
    "border border-slate-300 bg-white text-navy-900 hover:border-navy-400 hover:bg-slate-50 hover:-translate-y-0.5 active:translate-y-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-navy-400 dark:hover:bg-slate-800",
  ghost:
    "text-slate-600 hover:bg-slate-100 hover:text-navy-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100",
};

const sizes = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", loading, children, disabled, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
