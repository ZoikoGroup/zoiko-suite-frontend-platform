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
/contract-lifecycle-svc/v1/contracts    -> contract-lifecycle-svc:8119/v1/contracts
/policy-svc/v1/policies                 -> policy-svc:8085/v1/policies
/secret-vault-integration-svc/v1/...    -> secret-vault-integration-svc:8087/v1/...
/evidence-requirements-svc/v1/...       -> evidence-requirements-svc:8130/v1/...
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
  gateway purchase-order-svc governance-svc obligations-svc configuration-feature-flag-svc `
  contract-lifecycle-svc policy-svc secret-vault-integration-svc `
  evidence-requirements-svc authorization-svc
```

`authorization-svc` is not optional if you intend to test writes on Commercial
Ops or Evidence: both check it before applying a mutation and both fail closed,
so without it those writes are refused — correctly, but confusingly.

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

| Page | Service | Endpoint coverage |
| --- | --- | --- |
| Overview | governance-decision-log-svc, obligations-svc | reads only |
| Governance Log | governance-decision-log-svc | **3/3** — list, get, record |
| Policies | policy-svc | **6/6** — applicable set, version history, create, version, activate, evaluate |
| Evidence | evidence-requirements-svc | **6/6** — catalog, get, create, retire, evaluate, get evaluation |
| Secret Vault | secret-vault-integration-svc | **12/12** — policies, versions, activate, material, broker, leases, revoke, rotate, audit |
| Commercial Ops | purchase-order-svc | **5/5** — list, get, issue, amend, close |
| Legal & Contracts | contract-lifecycle-svc | **8/8** — list, get, versions, create, revise, submit, activate, terminate |
| Settings | configuration-feature-flag-svc | **6/6** — flags and config: list, get, upsert each |

The remaining domain pages (Finance, Payroll, HR, Tax, Compliance) are still
placeholders.

### Governance-plane pages

The four pages under "Governance plane" in the sidebar are not business domains —
they are the cross-cutting services every domain is meant to be governed *by*.
Each page states, up front, what its service does **not** enforce, because in
several cases the honest answer is "nothing":

| Service | Authorizes its writes? | Notes |
| --- | --- | --- |
| `governance-decision-log-svc` | no | Also applies **no tenant filter** — a read returns every tenant's decisions, filtered only by query parameters. |
| `policy-svc` | no | Only `APPROVAL_THRESHOLD` can be evaluated; other types can be activated and are then enforced by nothing. Evidence recording is best-effort, so a 200 does not prove the decision was logged. |
| `secret-vault-integration-svc` | admin routes: no | The broker route authorizes the *requesting workload*, not the operator. Denies by absence, so a 404 means "no policy" and only a 403 means "policy said no". |
| `evidence-requirements-svc` | **yes, fail-closed** | The strictest service here. Rejects a missing tenant header rather than defaulting it, and 403s a body tenant that disagrees with the header. |
| `configuration-feature-flag-svc` | no | Append-only and versioned; 201 vs 200 distinguishes a real change from a no-op. |
| `purchase-order-svc` | **yes, fail-closed** | Every mutation checked before it is applied. |

Two limits worth knowing because no UI can work around them:

- **`purchase-order-svc` amendment history is unreadable.** Amendments are
  written to an append-only ledger with full before/after values, and the service
  exposes no endpoint to read it. An order's `version` is the only visible trace
  that it was restated.
- **Secret material and lease tokens never reach the browser.** Material is sent
  one-way to the service. The broker's `lease_token` is stripped server-side
  before the action returns, so it cannot enter the RSC payload — only its
  existence is reported.

### Commercial Ops

Purchase orders move `ISSUED -> CLOSED`. Amending does **not** change status: it
restates the total, bumps `version`, and appends an immutable amendment row.
Closing is terminal.

Each mutation is checked against `authorization-svc` **before** it is applied,
and the check fails closed — an unreachable `authorization-svc` refuses the
write rather than allowing it. The UI keeps "you may not do this" (403) and "we
could not determine whether you may" (503) as distinct messages, because
collapsing them would report a governance failure as a permission problem.

### Legal & Contracts

Contracts move `DRAFT -> PENDING_APPROVAL -> ACTIVE -> TERMINATED`. Revising the
terms does **not** change status: it restates them, bumps `version`, and appends
an immutable snapshot to `contract_versions`. Activation and termination also
snapshot, which is why an active contract is already at v3. The register lists
every contract in the tenant; each one's own page reads it fresh and offers only
the transitions the service will accept from its current status.

Three properties of `contract-lifecycle-svc` are surfaced in the UI rather than
smoothed over, because a reader who assumed otherwise would misread the register:

- **Contract writes are not authorized.** The service constructs an
  `authorization-svc` client and no handler ever calls it. Unlike a purchase
  order, a contract mutation is not checked against a grant and cannot fail
  closed — the Server Action's session check is the only gate, and it is not a
  substitute, since the service's HTTP surface stays open regardless.
- **Approval is a status, not a gate.** `POST /{id}/activate` refuses only
  `ACTIVE` and `TERMINATED`, so a `DRAFT` can be signed into force without
  passing through `PENDING_APPROVAL`.
- **Submission is not versioned.** Every other transition appends a version row.
  Submitting for approval appends none and records no actor, so the history
  cannot show that a contract was submitted, or by whom.

Unlike `purchase-order-svc`, this service takes no `tenant_id` query parameter —
it reads `X-Tenant-Id` and lets row-level security filter. A read with no
identity header falls back to the literal tenant `"default"` and returns an empty
list, so a dropped header looks exactly like an empty register. Its ids are
`TEXT` (`ctr-<uuid>`), not `uuid`, so the UUID-typo-becomes-a-503 trap described
above does not apply here.

## Conventions

- A backend call returns an `ApiResult` union, never a throw. One unavailable
  service degrades its own panel to an empty state instead of taking down the
  whole page render — see [lib/api/client.ts](lib/api/client.ts).
- Every panel that can be empty renders an icon + label saying why. Containers
  never collapse to blank space.
- Server Actions verify the session themselves. They are reachable by direct
  POST, not only through the UI, so they do not rely on the `/admin` proxy
  matcher.
