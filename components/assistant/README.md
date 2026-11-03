# ZoikoSuite Assistant widget

The chat widget for `public-ai-svc`, the anonymous, public-only ZoikoSuite Assistant. Everything it
shows comes from the service: answers from approved articles and typed claims, links from the signed
route registry (placeholders are never shown), and wording and starter chips from `GET /config`.

| File | Purpose |
|---|---|
| `AssistantWidget.tsx` | Launcher, panel, messages, retries, S08 panel, privacy drawer |
| `AssistantMount.tsx`, `mount.ts` | Renders the widget only on allowlisted public paths |
| `ZTile.tsx`, `branding.ts`, `logos.server.ts` | Z tile and wordmark, title, subtitle, logo URLs |
| `state.ts` | S00–S09 state machine and the pre-send sensitive-data check (pure) |
| `lib/api/public-ai.ts` | Browser client: same-origin `/public-ai/v1/*`, `credentials: "omit"` |
| `lib/api/public-ai-proxy.ts`, `app/public-ai/v1/[...path]/route.ts` | Forwards to the service with allowlisted headers only |
| `app/assistant/page.tsx` | Public, no-login test page (`noindex`) |

## Where it appears

On the public `/assistant` page and the admin console (`/admin`, product owner decision
2026-10-28), where it is the same anonymous public assistant. `mount.ts` lists:

- **Active:** `/assistant` (a public test page in this app) and `/admin` with its pages.
- **Prepared but inactive here:** `/`, `/pricing`, `/platform`, `/trust`, `/support`, `/demo`,
  `/book-demo`. The public site can enable them.

Live platform questions (service counts, domain health, cluster readiness) are always refused. An
authenticated admin copilot is deferred to R2 (FR-16, backend `docs/open-decisions.md` OD-06). The
boundary is enforced by an ESLint rule ("public chatbot boundary" in `eslint.config.mjs`) and by
`import-boundary.test.tsx`: chatbot code may not import dashboard, health, auth or session modules.

It is mounted from the root layout, outside the admin shell and any auth, user or tenant provider.
It never reads the site's cookies, tokens, storage, dashboard state or DOM. Its calls go to the
same-origin `/public-ai/v1/*` route with `credentials: "omit"`. That route forwards only
`Accept`, `Content-Type`, `Idempotency-Key`, `X-Public-Chat-Session` and `traceparent`, plus the
configured Origin, and never returns `Set-Cookie`. `/assistant` behaves the same whether or not
someone is signed in to the console.

## Run it

```bash
# 1. Assistant service (backend checkout that has services/public-ai-svc)
cd services/public-ai-svc
PUBLIC_AI_ENABLED=true go run ./cmd/server        # 127.0.0.1:8001, public KB (drafts), mock model

# 2. Console
npm install
npm run dev                                       # open http://localhost:3000/assistant
```

## Tests

```bash
npm test                                          # Vitest (widget, mount, credentials, proxy) + node --test state machine
PUBLIC_AI_SVC_DIR=../zoiko-suite-backend/services/public-ai-svc npm run test:e2e
```

`test:e2e` builds the console, builds public-ai-svc from `PUBLIC_AI_SVC_DIR`, runs both on their own
ports (3100 and 18181, never your dev servers) and drives Microsoft Edge with Playwright. Screenshots
go to `test-results/assistant/` and the HTML report to `test-results/e2e-report/`.

## One bubble per question

Each question is one visitor bubble keyed by its `client_turn_id`. A failed send keeps the bubble
(`sending` → `failed` → `sent`), and **Try again** resends the same id, so the service replays its
stored answer instead of answering twice. Only after an UNAVAILABLE reply, which the service stores,
does a retry use a fresh id, still in the same bubble.

## Branding

- **Z tile:** `public/logo-z.png` (512×512, a white rounded tile with its own background), set as
  `LOGO_MARK_URL` in `branding.ts`. Drawn as-is: no added background, padding, tint or filter.
  - Launcher: 56 px, 64 px on screens ≥ 1280 px. 16 px radius, 1 px edge (`rgba(0,0,0,0.12)` in
    light, `rgba(255,255,255,0.18)` in dark), soft shadow, safe-area aware. Open, it keeps the tile
    and shows an 18 px close badge.
  - Welcome card: 48 px. Header: 32 px, 8 px radius. Answer avatar: 24 px, 6 px radius.
  - If the image fails, a white rounded square with a navy "Z" fills the same box (explicit width
    and height), so nothing moves.
- **Wordmark:** `public/logo.png`, set as `LOGO_FULL_URL`. Only in the privacy and AI notice, on a
  white container.
- **Overrides:** the `LOGO_MARK_URL` and `LOGO_FULL_URL` server env vars (same-origin paths only).
  If the Z tile file is missing, the launcher falls back to the wordmark (`logos.server.ts`).
- **Name and copy:** "ZoikoSuite Assistant" until Legal and Brand clear another name. Title,
  subtitle, launcher labels and greeting come from the service's microcopy (`ui.header.title`,
  `ui.header.subtitle`, `ui.launcher.open`, `ui.launcher.close`, `ui.welcome.greeting`,
  `ui.header.logo_mark_url`, `ui.header.logo_full_url`), with fallbacks here.
- The site favicon and the console's own branding are unchanged.
