"use client";

// The Z tile (public/logo-z.png) at a given size. The file already is a white
// rounded tile, so it is drawn as-is: no container, padding, tint or filter,
// object-fit contain, corners matched to the tile. Width and height are set
// explicitly, and if the image fails a white rounded square with a navy "Z"
// takes exactly the same box, so nothing moves. Decorative by default.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function ZTile({ src, size, radius, className }: { src: string; size: number; radius: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // An image that failed before hydration fired its error event before React
  // was listening: check once on mount.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);
  const box = { width: size, height: size, borderRadius: radius };
  if (failed) {
    return (
      <span
        data-testid="ztile-fallback"
        aria-hidden="true"
        style={{ ...box, fontSize: Math.round(size * 0.55) }}
        className={cn("inline-flex shrink-0 items-center justify-center bg-white font-bold leading-none text-navy-900", className)}
      >
        Z
      </span>
    );
  }
  return (
    // A plain <img>: a fixed local asset that next/image would re-encode.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={img}
      data-testid="ztile"
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={box}
      onError={() => setFailed(true)}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

/** The full wordmark on a white container (privacy and AI notice only). */
export function FullLogo({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex h-9 shrink-0 items-center rounded-lg bg-white px-2 ring-1 ring-slate-200 dark:ring-slate-600" aria-hidden="true">
      {failed ? (
        <span className="text-sm font-semibold text-navy-900">ZoikoSuite</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" height={28} onError={() => setFailed(true)} className="h-7 w-auto object-contain" />
      )}
    </span>
  );
}
