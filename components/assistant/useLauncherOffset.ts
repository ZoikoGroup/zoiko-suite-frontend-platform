"use client";

// Doc01 W01-A: the launcher must not cover cookie banners, accessibility
// widgets or mobile sticky footers. The offset is the configured
// LAUNCHER_BOTTOM_OFFSET plus the height of any such element that is fixed or
// sticky at the bottom of the viewport and overlaps the launcher's column.
// Pages can mark elements to avoid with data-za-avoid; common cookie banners
// and sticky footers are recognised too.

import { useEffect, useState } from "react";

const AVOID = [
  "[data-za-avoid]",
  "[data-cookie-banner]",
  "[data-sticky-footer]",
  "#onetrust-banner-sdk",
  "#CybotCookiebotDialog",
  ".cc-window",
  "[aria-label*='cookie' i]",
  "body > footer",
].join(",");

function overlapHeight(launcherLeft: number): number {
  let lift = 0;
  const vh = window.innerHeight;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(AVOID))) {
    if (el.closest("[data-za-root]")) continue;
    const pos = getComputedStyle(el).position;
    if (pos !== "fixed" && pos !== "sticky") continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.width === 0) continue;
    // Anything pinned in the lower half of the viewport (a banner may sit on
    // top of a sticky footer rather than touch the bottom edge).
    const inLowerHalf = r.top >= vh / 2 && r.top < vh;
    const overlapsColumn = r.right > launcherLeft;
    if (inLowerHalf && overlapsColumn) lift = Math.max(lift, vh - r.top);
  }
  return Math.round(lift);
}

export function useLauncherOffset(configured: number): number {
  const [detected, setDetected] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setDetected(overlapHeight(window.innerWidth - 120)));
    };
    measure();
    window.addEventListener("resize", measure);
    const mo = new MutationObserver(measure);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      mo.disconnect();
    };
  }, []);
  return Math.max(0, configured) + detected;
}
