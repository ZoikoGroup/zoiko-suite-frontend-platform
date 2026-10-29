// Resolves the assistant's logo URLs on the server: env overrides (same-
// origin paths only), and the Z tile falls back to the wordmark when its file
// is missing from public/.

import { existsSync } from "node:fs";
import path from "node:path";
import { LOGO_FULL_URL, LOGO_MARK_URL, safeAssetUrl, type AssistantLogos } from "./branding";

/** LAUNCHER_BOTTOM_OFFSET: extra px to lift the launcher above page chrome (Doc01 W01-A). */
export function launcherOffset(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.LAUNCHER_BOTTOM_OFFSET);
  return Number.isFinite(n) && n > 0 && n < 400 ? Math.round(n) : 0;
}

export function resolveLogos(env: Record<string, string | undefined> = process.env): AssistantLogos {
  const full = safeAssetUrl(env.LOGO_FULL_URL, LOGO_FULL_URL);
  const mark = safeAssetUrl(env.LOGO_MARK_URL, LOGO_MARK_URL);
  const onDisk = existsSync(path.join(process.cwd(), "public", ...mark.split("/").filter(Boolean)));
  return { mark: onDisk ? mark : full, full };
}
