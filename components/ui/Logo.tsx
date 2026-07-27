import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** Rendered height in px — width follows the source asset's aspect ratio. */
  height?: number;
  /** Show only the "Z" mark (for the collapsed sidebar rail, tight spaces). */
  markOnly?: boolean;
  /** Chip padding — "lg" for hero/login contexts, "sm" everywhere else. */
  chipSize?: "sm" | "lg";
};

const FULL_LOGO_ASPECT = 336 / 144;
const MARK_ASPECT = 96 / 144;

const CHIP_PADDING: Record<"sm" | "lg", string> = {
  sm: "px-2.5 py-1.5",
  lg: "px-4 py-3",
};

export function Logo({ className, height = 32, markOnly = false, chipSize = "sm" }: LogoProps) {
  const width = Math.round(height * (markOnly ? MARK_ASPECT : FULL_LOGO_ASPECT));

  return (
    // The source mark uses navy text baked into the asset, which loses
    // contrast on dark surfaces — a light chip keeps it legible everywhere.
    <span
      className={cn(
        "inline-flex items-center rounded-lg bg-white shadow-sm ring-1 ring-slate-900/5",
        CHIP_PADDING[chipSize],
        className,
      )}
    >
      <Image
        src={markOnly ? "/logo-mark.png" : "/logo.png"}
        alt="ZoikoSuite"
        width={width}
        height={height}
        priority
        style={{ height, width }}
        className="h-auto w-auto object-contain"
      />
    </span>
  );
}
