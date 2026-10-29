// ZoikoSuite Assistant branding: the one place its logos and name are set.
// Nothing else in the site's branding (favicon, console header) uses these.
//
// Assets are existing public files served by Next.js (no basePath in
// next.config.ts), referenced by URL only and never copied or edited:
//   - LOGO_MARK_URL: the Z tile, public/logo-z.png (512×512, white rounded
//     tile with its own background). Launcher, welcome, header, avatar.
//   - LOGO_FULL_URL: the wordmark, public/logo.png. Privacy notice only.
// Server env LOGO_MARK_URL / LOGO_FULL_URL override them (same-origin paths
// only); a missing Z tile falls back to the wordmark (logos.server.ts).

export const LOGO_MARK_URL = "/logo-z.png";
export const LOGO_FULL_URL = "/logo.png";

/** Public name until Legal and Brand clear another one. */
export const ASSISTANT_TITLE = "ZoikoSuite Assistant";
export const ASSISTANT_SUBTITLE = "AI assistant. Public ZoikoSuite information only.";

export type AssistantLogos = { mark: string; full: string };

/** Returns url when it is a same-origin path ("/x"), else the fallback. */
export function safeAssetUrl(url: string | undefined | null, fallback: string): string {
  return typeof url === "string" && /^\/(?!\/)[\w\-./]*$/.test(url) ? url : fallback;
}
