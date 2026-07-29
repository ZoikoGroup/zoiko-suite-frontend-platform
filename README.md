# zoiko-suite-frontend-platform

Admin console for ZoikoSuite. Next.js 16 (App Router, Turbopack), React 19,
Tailwind 4.

## How it talks to the backend

Every backend call is made from a **Server Component or Server Action**, never
from the browser. Two reasons, both load-bearing:

- The Go services ship no CORS middleware, so a browser `fetch` straight at a
  service port is blocked by the preflight.
- Backend hostnames and the caller's identity headers stay off the client.

All traffic goes through the backend's **single Traefik gateway port** rather
than each service's own port. One port fronts every service, one path prefix
each:

```
http://localhost:8000/<service-name>/<the service's own path>

/purchase-order-svc/v1/purchase-orders  -> purchase-order-svc:8129/v1/purchase-orders
/obligations-svc/v1/obligations         -> obligations-svc:8088/v1/obligations
```

Prefixes come from the backend's generated
`deployments/traefik-dynamic/all-services.yml` and are the **full service
name**. Getting one wrong produces a Traefik 404 that looks exactly like the
service being down.

`ZOIKO_USE_GATEWAY=false` falls back to direct per-service ports — useful when
the gateway itself is the suspect. See `.env.example`.

### The identity headers

In a real deployment Traefik's ForwardAuth verifies a signed identity envelope
and injects `X-Principal-Id` / `X-Tenant-Id` / `X-Legal-Entity-Id` before any
backend sees the request. The local single-port routes deliberately carry **no**
ForwardAuth, so the console supplies those headers itself from the session
(`DEMO_IDENTITY` in [lib/auth.ts](lib/auth.ts)).

They are UUIDs because the backend stores them in `uuid` columns. A readable id
like `demo-tenant` fails inside the Postgres driver and surfaces as a **503**,
not a 400 — so a typo reads like an outage.

`X-Tenant-Id` matters on reads too, not just writes: services with row-level
security scope the query by it, and a read without it returns 404 or an empty
list rather than failing loudly.

## Running it locally

**1. Start the backend gateway and the services you need** (from the backend
repo, `zoiko-suite/zoiko-suite`):

```powershell
$env:GATEWAY_PORT = "8000"
docker compose -f deployments/docker-compose.yml up -d `
  gateway purchase-order-svc governance-svc obligations-svc configuration-feature-flag-svc
```

**2. Seed the demo principal's permissions:**

```powershell
./deployments/scripts/seed-demo-rbac.ps1
```

Without this, `authorization-svc` answers `DENIED / no_grant` and every write
from the console is refused. That is correct fail-closed behaviour, not a bug —
but it means a fresh stack has a console that can read and write nothing. The
script is idempotent.

**3. Start the console:**

```powershell
cp .env.example .env.local   # first time only
npm install
npm run dev
```

Sign in at http://localhost:3000/login with the demo credentials in
[lib/auth.ts](lib/auth.ts).

## What is wired to a live service

| Page | Service | Reads | Writes |
| --- | --- | --- | --- |
| Overview | governance-decision-log-svc, obligations-svc | yes | — |
| Commercial Ops | purchase-order-svc | yes | issue / amend / close |
| Settings | configuration-feature-flag-svc | yes | feature flags |

The remaining domain pages (Finance, Payroll, HR, Legal, Tax, Compliance) are
still placeholders.

### Commercial Ops

Purchase orders move `ISSUED -> CLOSED`. Amending does **not** change status: it
restates the total, bumps `version`, and appends an immutable amendment row.
Closing is terminal.

Each mutation is checked against `authorization-svc` **before** it is applied,
and the check fails closed — an unreachable `authorization-svc` refuses the
write rather than allowing it. The UI keeps "you may not do this" (403) and "we
could not determine whether you may" (503) as distinct messages, because
collapsing them would report a governance failure as a permission problem.

## Conventions

- A backend call returns an `ApiResult` union, never a throw. One unavailable
  service degrades its own panel to an empty state instead of taking down the
  whole page render — see [lib/api/client.ts](lib/api/client.ts).
- Every panel that can be empty renders an icon + label saying why. Containers
  never collapse to blank space.
- Server Actions verify the session themselves. They are reachable by direct
  POST, not only through the UI, so they do not rely on the `/admin` proxy
  matcher.
