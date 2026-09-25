"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  // Single element rendered in both SSR and client passes.
  // suppressHydrationWarning prevents React from complaining about the
  // className difference (which encodes isDark) between the server pass
  // (isDark=false, because mounted is always false on the server) and the
  // first client paint. The button is never disabled — pointer-events-none
  // keeps it inert before mount without adding a boolean attribute whose
  // presence/absence would cause the disabled={true} vs disabled={null} mismatch.
  return (
    <button
      type="button"
      onClick={() => mounted && setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      suppressHydrationWarning
      className={cn(
        "relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg",
        "text-slate-500 transition-colors duration-150",
        "hover:bg-slate-100 hover:text-slate-700",
        "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
        !mounted && "pointer-events-none",
        className,
      )}
    >
      <Sun
        suppressHydrationWarning
        className={cn(
          "absolute h-4.5 w-4.5 transition-all duration-300 ease-in-out",
          isDark ? "-rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
        )}
      />
      <Moon
        suppressHydrationWarning
        className={cn(
          "absolute h-4.5 w-4.5 transition-all duration-300 ease-in-out",
          isDark ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0",
        )}
      />
    </button>
  );
}

