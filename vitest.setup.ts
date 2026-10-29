// jsdom lacks a few browser APIs the widget uses. Defaults model a desktop
// with a fine pointer and no reduced-motion preference; tests can override
// window.__media to emulate other conditions.

type MediaState = { mobile: boolean; reducedMotion: boolean; coarse: boolean };
const state: MediaState = { mobile: false, reducedMotion: true, coarse: false };
(globalThis as unknown as { __media: MediaState }).__media = state;

function matches(query: string): boolean {
  if (query.includes("max-width: 767.98px")) return state.mobile;
  if (query.includes("min-width: 768px")) return !state.mobile && !(query.includes("pointer: fine") && state.coarse);
  if (query.includes("prefers-reduced-motion: reduce")) return state.reducedMotion;
  if (query.includes("pointer: coarse")) return state.coarse;
  return false;
}

if (typeof window !== "undefined") {
  window.matchMedia = (query: string) =>
    ({
      matches: matches(query),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  if (!globalThis.CSS) (globalThis as unknown as { CSS: object }).CSS = {};
  if (!CSS.escape) CSS.escape = (s: string) => s.replace(/[^\w-]/g, (c) => `\\${c}`);
}
