# ZoikoSuite — Complete Platform Brief

> Full walkthrough of both repos: architecture doctrine, bootstrap sequence, every service
> pin-to-pin, the event backbone, frontend wiring, and everything that still needs building.
>
> Sourced from `zoiko-suite-backend/docs/architecture/*` (Docs 01–06 + doc7 operating standard,
> the completion tracker, known-gaps, gap analysis, and input-contract conformance) and verified
> against the actual code.

---

## Table of contents

- [0. What it is (and what it is not)](#0-what-it-is-and-what-it-is-not)
- [1. The seven planes](#1-the-seven-planes)
- [2. The starting point — three different "orders"](#2-the-starting-point--three-different-orders)
- [3. Every service, pin to pin](#3-every-service-pin-to-pin)
- [4. Event backbone](#4-event-backbone)
- [5. Frontend — what's actually wired](#5-frontend--whats-actually-wired)
- [6. What still needs to be implemented](#6-what-still-needs-to-be-implemented--the-honest-list)
- [7. Practical first steps](#7-practical-first-steps)

---

## 0. What it is (and what it is not)

Two repos, one product:

| Repo | Stack | Size |
|---|---|---|
| `zoiko-suite-backend/` | Go 1.22 microservices monorepo, one `go.mod` per service, `go-chi/v5`, Postgres, Kafka, Redis, MinIO, OpenSearch, Traefik | **86 services**, 88 Go modules, 1,864 Go files, ~331k LOC, 167 SQL migrations |
| `zoiko-suite-frontend-platform/` | Next.js 16 App Router, React 19, Tailwind 4, all backend calls from Server Components/Actions | 29 pages, 38 API client modules, 26 Server Action files |

The thesis, stated in `docs/architecture/01-backend.md`: **it is not an ERP**. A conventional ERP runs
`Input → Transaction → Storage → Reporting`. ZoikoSuite runs:

```
Intent → Policy Validation → Jurisdiction Validation → Execution → Evidence Capture → Intelligence
```

Governance is the **execution boundary**, not an audit overlay. The category name invented for it is
*Governed Business Operations Intelligence*.

### The ten doctrines

Every design decision in the code traces back to one of these:

1. **Governance before execution** — no bypass path exists
2. **Evidence by default** — audit-readiness is an architectural output, not a retrospective project
3. **Entity-aware everywhere** — `legal_entity_id` is a runtime primitive, not metadata
4. **Jurisdiction as a first-class primitive** — it changes runtime behaviour, it is not a config field
5. **Modular capability, unified control** — domains are optional, governance never is
6. **API-first, UI-second** — the UI is a client of governed services, not a privileged alternate path
7. **Intelligence must be policy-constrained** — AI recommends, never overrides
8. **Multi-tenant, enterprise-grade isolatable**
9. **Source truth stays intact** — analytics and reporting never mutate source operational records
10. **No silent state change** — every material change is attributable, evidential, reproducible

---

## 1. The seven planes

| Plane | What lives there |
|---|---|
| **Experience** | Web/mobile/admin console, developer portal, integration endpoints, workflow + notification channels |
| **Domain Execution** | Finance, payroll, HR, legal, tax, compliance, commercial — all downstream of Governance |
| **Governance** | Non-bypassable control spine: Policy, Jurisdiction, Authorization, Workflow, Obligations, Evidence Requirements, Decision Log |
| **Evidence** | Audit event store, document vault, decision log, workflow history, evidence manifests |
| **Intelligence** | Anomaly detection, forecasting, risk scoring, reconciliation intelligence, decision support |
| **Data** | Postgres (63 DBs), immutable ledger, Kafka, MinIO object store, OpenSearch, Redis |
| **Security & Infra** | Identity, mTLS, secrets, KMS, CARTA, SIEM, observability, deployment |

### Canonical runtime control flow (7 stages)

```
1. Request Intake          → every ingress is governed; no uncontrolled entry point exists
2. Identity Resolution     → principal, tenant, legal entity, jurisdiction, role profile,
                             delegated authority, session trust posture
3. Governance Evaluation   → policy thresholds, SoD constraints, approval matrices,
                             jurisdictional obligations, evidence preconditions, workflow state
4. Execution Authorization → allow / deny / convert-to-approval-workflow.
                             Silent failure is prohibited
5. Transaction + Event     → domain writes governed state, emits typed append-only domain events
   Commit                    (events are facts, not commands)
6. Evidence Generation     → actor, action, entity, jurisdiction basis, rule set applied,
                             approvals present, referenced documents, timestamps, provenance
7. Intelligence Update     → derived insight layers update, never mutating source truth
```

The governance layer is not applied after the fact. It is embedded inside the fact.

---

## 2. The starting point — three different "orders"

This is where people get confused. There are **three distinct sequences** and they are not the same thing.

### 2a. Request-time order (what happens on every single API call)

```
Client
  │
  ▼
Traefik gateway  (:8000)
  │  ForwardAuth →  gateway-auth-svc :8092
  │                     ├─ verifies the signed identity envelope against
  │                     │  identity-context-svc's JWKS (/.well-known/jwks.json)
  │                     └─ calls carta-svc — continuous risk scoring
  │                        ALLOW / STEP_UP_MFA / ISOLATE / DENY
  │  injects X-Principal-Id, X-Tenant-Id, X-Legal-Entity-Id
  ▼
Canonical envelope middleware  (services/<svc>/internal/envelope/)
  │  validates the ZS-ARCH-SVC-001 §4 input contract, fail-closed
  ▼
Domain service handler
  │  ├─ POST authorization-svc /v1/authorize     ← 69 of ~70 services do this
  │  ├─ GET  jurisdiction-rules-svc              (fail-closed: 503 = "cannot answer", never "no")
  │  ├─ POST policy-svc /v1/policies/evaluate    (where wired)
  │  └─ workflow-svc                             (if approval required)
  ▼
Postgres  (SET LOCAL app.tenant_id = $1, RLS enforced as non-superuser role zoiko_app)
  │
  ▼
Kafka  zoiko.<domain>.events
  │  → audit-event-store-svc (hash-chained)
  │  → workflow-history-svc
  │  → search-indexer-svc
  │  → intelligence services
```

### 2b. Build order (Doc 03 §25 — the phases the repo was actually built in)

| Phase | Contents |
|---|---|
| **Phase 0 — Foundation** | identity-context-svc, tenant-entity-registry-svc, secret-vault-integration-svc, configuration-feature-flag-svc, audit-event-store-svc |
| **Phase 1 — Governance Spine** | jurisdiction-rules-svc, policy-svc, authorization-svc, workflow-svc, obligations-svc, governance-decision-log-svc, gateway-auth-svc, GTRM |
| **Phase 2 — Evidence** | schema-registry-svc, document-vault-svc, evidence-manifest-svc, evidence-requirements-svc, workflow-history-svc, search-indexer-svc |
| **Phase 3 — Revenue Engine** | general-ledger, accounts-payable, accounts-receivable, purchase-request, bank-reconciliation, treasury, financial-close, intercompany, consolidation |
| **Phase 4 — Workforce Engine** | employee-master, employment-contracts, payroll-run, compensation, benefits, payroll-tax, payroll-exceptions, leave-absence, org-structure, offboarding-severance, workforce-compliance |
| **Phase 5 — Legal + Tax + Compliance** | contract-lifecycle, clause-template, obligation-tracking, board-resolutions, corporate-actions, counterparty-management, tax-rules, tax-determination, vat-gst, corporate-tax, withholding-tax, filing-preparation, filing-tracker, compliance-status, exception-escalation |
| **Phase 6 — Trust & Intelligence** | anomaly-detection, forecasting, compliance-risk-scoring, reconciliation-intelligence, reporting-orchestration, migration-integrity, mtls-management, siem-integration, carta, key-management |
| **Phase 7 — Extensibility** | connectivity-api-bridge, banking-connector, hris-connector, tax-authority-interface, esignature-integration, external-data-feed |

Doc7 chunks 5–12 added a commercial plane on top: commercial-account, capability-registry,
ai-governance, kill-switch-registry, retention-registry, metric-registry, source-authority.

### 2c. Cold-start / seeding order (what YOU actually do)

**`identity-context-svc` is first at *request* time; `tenant-entity-registry-svc` is first at
*seeding* time** — because nothing else can exist before a tenant and legal entity do.

```powershell
# 1. Boot the platform (from zoiko-suite-backend/)
docker compose -f deployments/docker-compose.yml up -d --build

# 2. Register the demo tenant + legal entity   ← THE ACTUAL STARTING POINT
./deployments/scripts/seed-demo-registry.ps1
#    Creates tenant 11111111-…  and legal entity 22222222-…
#    Must be raw SQL, not the API: POST /v1/entities mints its own id,
#    so a FIXED demo id cannot be created through it.

# 3. Grant the demo principal permissions
./deployments/scripts/seed-demo-rbac.ps1
#    authorization-svc denies by default → DENIED / no_grant.
#    Without this, a fresh stack has a console that can read and write nothing.
#    That is correct fail-closed behaviour, not a bug.

# 4. Start the console (from zoiko-suite-frontend-platform/)
cp .env.example .env.local
npm install
npm run dev
# → http://localhost:3000/login   (credentials in lib/auth.ts)
```

**The two seed scripts answer two different questions and a fresh stack needs both:**

| Script | Question it answers |
|---|---|
| `seed-demo-registry.ps1` | *Does the demo legal entity exist?* |
| `seed-demo-rbac.ps1` | *May the demo principal act on it?* |

Skip step 2 and `accounts-receivable-svc` refuses every invoice with `legal_entity_not_in_tenant`,
no matter what step 3 granted. Skip step 3 and every write 403s.

### Teardown

```powershell
docker compose -f deployments/docker-compose.yml down -v   # -v also drops the DB volume
```

### How to reach a service

One Traefik port fronts all 66 routed services; the prefix is the **full service name**:

```
http://localhost:8000/<service-name>/<the service's own path>

/purchase-order-svc/v1/purchase-orders   → purchase-order-svc:8129/v1/purchase-orders
/authorization-svc/v1/authorize          → authorization-svc:8089/v1/authorize
/obligations-svc/v1/obligations          → obligations-svc:8088/v1/obligations
/policy-svc/healthz                      → policy-svc:8085/healthz
```

Generated into `deployments/traefik-dynamic/all-services.yml` by `gen-gateway-routes.mjs` —
never hand-edit it.

`ZOIKO_USE_GATEWAY=false` falls back to direct per-service ports, useful when the gateway
itself is the suspect.

> **These local routes carry no ForwardAuth.** That is deliberate — the purpose is manual status
> checking — and must never be deployed. Production routing is GTRM's compiled config:
> `Host()`-based and ForwardAuth-enforced.

**Two traps that cost hours:**

- A wrong prefix produces a Traefik **404 that looks exactly like the service being down**.
- Identity headers must be **UUIDs** — the backend stores them in `uuid` columns. A readable id
  like `demo-tenant` fails inside the pgx driver and surfaces as a **503**, not a 400, so a typo
  reads like an outage.
- `X-Tenant-Id` matters on **reads** too. Services with RLS scope the query by it, so a read
  without it returns 404 or an empty list rather than failing loudly.

### The canonical input contract (every service, every request)

`services/_contract/envelope/` is the authoritative package, **vendored** into 86 services
(services are separate Go modules with no shared module, so the package is vendored rather than
imported — the same pattern the repo already uses for `internal/middleware/tenant.go`).
Edit the source and re-run `rollout.sh`; **never edit a vendored copy.**

Console-side counterpart: `lib/api/envelope.ts`.

#### Enforcement modes — `ZS_ENVELOPE_ENFORCEMENT`

| Mode | Behaviour |
|---|---|
| `write-strict` *(default)* | Refuse material state changes missing a mandatory field. Admit reads, marked `X-Envelope-Contract: violated`. |
| `strict` | Refuse reads too. The doctrinal end state, per service, once its callers are migrated. |
| `observe` | Never refuse; parse, propagate, log. A migration state, not a resting state. |

An unrecognised value falls back to `write-strict`, so a typo cannot silently disable the control.

#### Field status

**Enforced:** `X-Tenant-Id`, `X-Principal-Id` / `X-Workload-Id`, `X-Legal-Entity-Id` (on the 69
entity-scoped services, validated against tenant-entity-registry-svc including cross-tenant
refusal), `X-Operation`, `X-Request-Id`, `X-Correlation-ID`, `Idempotency-Key` (on writes —
a service cannot opt out), `X-Source-Channel` (allow-listed to the seven §4 values; an unknown
channel is refused, not coerced), `X-Source-System` (mandatory when channel is `import` or
`integration`), `X-Purpose-Context` (28 sensitive services: personal, bank, tax, payroll,
privileged content).

**Carried but not a refusal condition:** `X-Book-Id` / `X-Reporting-Basis` (gap G-1),
`X-Causation-Id`, `X-External-Reference`, `X-Occurred-At` and `X-Effective-At` (RFC3339
format-enforced — a malformed value is refused, never silently dropped to "absent"),
`X-Timezone` (resolvable from `Tenant.primary_timezone`), `X-Jurisdiction-Context` (resolved from
`LegalEntity.primary_jurisdiction_id`; a caller claim that disagrees is overridden and the conflict
recorded), `X-Expected-Version`, `X-Workflow-Instance-Id`, `X-Approval-Reference`, `X-Evidence-Refs`.

#### Refusal shape

Refusals name **every** unmet field at once, structurally:

```json
{
  "error": "envelope_incomplete",
  "detail": "canonical input contract violated: idempotency_key, request_id, source_channel",
  "service": "general-ledger-svc",
  "violations": [
    { "field": "request_id", "header": "X-Request-Id", "reason": "mandatory: request tracing" }
  ]
}
```

Missing `tenant_id` or `actor_subject_id` answers **401**, not 400 — those two headers are set by
gateway-auth-svc after it verifies the signed identity envelope, so their absence means the request
never passed authentication. Everything else is **400**.

---

## 3. Every service, pin to pin

### 3.1 Identity, Scope & Foundation

| Service | Port | Endpoints | What it actually does |
|---|---|---|---|
| **identity-context-svc** | 8080 | `POST /v1/context/resolve`<br>`GET /v1/context/session/{id}`<br>`POST /v1/context/session/{id}/invalidate`<br>`GET /v1/principals/{id}`<br>`GET /v1/principals/{id}/roles`<br>`GET /v1/principals/{id}/delegations`<br>`PUT /v1/principals/{id}/status`<br>`GET /.well-known/jwks.json` | Resolves principal → tenant → legal entity → jurisdiction → session trust posture. Mints the **signed identity envelope** every other service trusts, and publishes the JWKS gateway-auth-svc verifies against. Postgres-backed session + principal store, Redis session cache, risk-signal cache, SIEM client. Emits `identity.context.resolved`, `principal.status.changed`. |
| **tenant-entity-registry-svc** | 8081 | `POST/GET /v1/tenants`, `/{id}/lifecycle`, `/{id}/residency-region`, `/{id}/entities`, `/{id}/workspaces`<br>`POST/GET/PATCH /v1/entities`, `/{id}/status`<br>`POST /v1/entity-hierarchies`, `DELETE /{id}`<br>`POST/GET /v1/entities/{id}/jurisdictions`<br>`POST/GET/PATCH /v1/workspaces`, `/{id}/status`<br>`POST/GET /v1/residency-policies`<br>`GET /v1/residency-regions`<br>`POST/GET /v1/entities/{id}/tax-identity-bundles`, `/{id}/status` | **The root of all scope.** Owns Tenant, LegalEntity, Workspace, EntityHierarchy (parent-subsidiary, consolidation trees, intercompany, shared services), EntityJurisdiction assignments, ResidencyPolicy / ResidencyRegion (region code, cloud provider, country, `sovereign_flag`), TaxIdentityBundle. Real Postgres RLS. Every workspace carries a mandatory `billing_classification` (`COMMERCIAL_STANDALONE` / `ZOIKO_ONE` / `LEGACY_MIGRATION` / `PILOT_NON_BILLABLE` / `INTERNAL` / `DEMO` / `SANDBOX` / `QA_AUTOMATION`) validated fail-closed against the full enum. GTRM residency resolution lives here. Emits `entity.status.changed`, `entity.hierarchy.changed`, `entity.jurisdiction.changed`. |
| **gateway-auth-svc** | 8092 | `GET /verify` (Traefik ForwardAuth target) | Stateless, no DB. Verifies the signed envelope against identity-context-svc's JWKS before Traefik forwards to any backend. Calls carta-svc per request: blocks on `ISOLATE`/`DENY`, logs + streams `STEP_UP_MFA` (not yet blocking — no step-up challenge flow exists downstream to redirect to). Feeds siem-integration-svc on auth failures. |
| **delegated-authority-svc** | 8136 | `POST/GET /v1/delegations`<br>`POST /v1/delegations/{id}/revoke` | Time-bound delegated authority chains. **Note:** authorization-svc *also* owns a `delegated_authorities` table — a known ownership duplication (gap #81). |
| **access-control-svc** | 8137 | `POST/GET /v1/role-definitions`<br>`PATCH /{id}`<br>`POST/GET /{id}/permission-bundles` | Role definition + permission bundle authoring surface. |
| **secret-vault-integration-svc** | 8087 | `POST/GET /v1/secret-policies`<br>`POST/GET /{id}/versions`, `/versions/{id}/activate`<br>`POST /{id}/material`, `/{id}/rotate`<br>`POST /v1/secrets/broker`<br>`GET /v1/secrets/leases`, `/{id}`, `POST /{id}/revoke`<br>`GET /v1/secrets/audit` | Policy-gated, leased, rotation-aware secret access broker. Local-file encrypted-at-rest backend for v1; real Vault/KMS client pending. Denies by absence — **404 means "no policy", only 403 means "policy said no"**. The broker route authorizes the *requesting workload*, not the operator; admin routes are not authorized at all. |
| **configuration-feature-flag-svc** | 8086 | `POST/GET /v1/config`, `/config/{key}`<br>`POST/GET /v1/flags`, `/flags/{key}` | Versioned, append-only config + feature flags. **201 vs 200 distinguishes a real change from a no-op.** Event publishing is stubbed. |
| **notification-svc** | 8133 | `POST/GET /v1/notifications`, `GET /{id}` | Multi-channel notification dispatch. |
| **search-indexer-svc** | 8096 | *(probes only)* | Kafka → OpenSearch indexer. No business API by design. |
| **search-client** | — | *(library module)* | Shared OpenSearch client, no HTTP server. |

### 3.2 Governance Platform — the non-bypassable spine

| Service | Port | Endpoints | What it does |
|---|---|---|---|
| **authorization-svc** | 8089 | `POST /v1/authorize`<br>`GET /v1/access-decisions/{id}`<br>`POST /v1/admin/roles`, `/{id}/permission-bundles`, `/{id}/retire`, `/{id}/reactivate`<br>`POST /v1/admin/role-assignments`, `/{id}/revoke`<br>`POST /v1/admin/sod-rules`<br>`POST /v1/admin/delegated-authorities`, `/{id}/revoke` | **The single most-called service on the platform — 69 of ~70 services consult it.** Runtime access-decision engine combining RBAC + ABAC + delegated authority + **Segregation of Duties**. Every decision is written append-only to `access_decision_log` as evidence. **Fail-closed everywhere:** an unreachable authorization-svc *refuses* the write rather than allowing it. SoD examples enforced (blocked, not merely flagged afterward): a payment-batch creator may not approve their own batch; a payroll preparer may not finalize payroll release; a contract drafter may not self-authorize high-risk execution. `CreateRole` is idempotent (`ON CONFLICT DO NOTHING` + fallback lookup → 200 on re-create, 409 only on a genuine name/scope conflict). |
| **policy-svc** | 8085 | `POST/GET /v1/policies`<br>`POST/GET /v1/policies/{id}/versions`<br>`POST /v1/policies/{id}/versions/{vid}/activate`<br>`POST /v1/policies/evaluate`<br>`GET /v1/policy-versions/{id}`<br>`POST/GET /v1/control-test-definitions`, `/{id}/executions`<br>`GET /v1/controls/{ref}/effectiveness`<br>`POST/GET /v1/attestations`, `/{id}/revoke` | Policy + PolicyVersion lifecycle, one ACTIVE version per code. **Only `APPROVAL_THRESHOLD` can actually be evaluated** — other policy types can be activated and are then enforced by nothing. `GET /v1/policy-versions/{id}` fetches a version *"as of"*, not "whatever's current" — this is what makes decision replay work. Control tests separate **design status** from **operating effectiveness**: a control can be `TESTED` (design exists) while its latest execution is `INEFFECTIVE`, and the two never collapse into one status. Attestations are signed/attributed assertions with signer, role, period, evidence refs, expiry, and `ACTIVE` / `CHALLENGED` / `REVOKED` state; a second revoke 409s rather than silently re-applying. Evidence recording is best-effort, so a 200 does not prove the decision was logged. Emits `policy.version.activated`, `policy.rule.retired`. |
| **jurisdiction-rules-svc** | 8082 | `GET /v1/jurisdictions`, `/{id}`, `/{id}/ancestors`, `/{id}/rules`, `/{id}/rule-pack`<br>`GET /v1/rules/{id}`, `/{id}/drift-events`<br>`POST /v1/admin/jurisdictions`, `/{id}/deactivate`, `/{id}/rules`<br>`POST /v1/admin/rules/{id}/transition`, `/{id}/drift` | Authoritative jurisdiction registry and effective-dated rule library. **Platform-wide reference data — no `tenant_id`, no RLS, by design.** `GET /v1/jurisdictions/{id}` is the synchronous fail-closed validation probe every service makes before persisting a `jurisdiction_id`; **`503` means "cannot answer", never "no"**. `/rule-pack` resolves the whole ancestor chain to one winning rule per (`rule_domain`, `rule_code`) and names the chain in `resolved_from`, so a caller can record the *rule basis* of a governed action. **Legal Drift Detection is live:** `POST /v1/admin/rules/{id}/drift` moves `legal_drift_state`, appends to an immutable history readable at `/drift-events`, and publishes `legal.drift.detected`. **Nothing is ever deleted** — jurisdictions deactivate with `active_flag` + `effective_to`, rules end-date into `SUPERSEDED`/`RETIRED`, and point-in-time reads keep answering afterwards. Every mutating action requires `X-Principal-Id` and a positive authorization-svc decision, fail-closed. |
| **workflow-svc** | 8090 | `POST /v1/workflows`<br>`GET /v1/workflows/{id}`, `/{id}/next-approver`<br>`POST /{id}/actions`, `/{id}/cancel`, `/{id}/escalate` | Multi-stage approval orchestration. **Extends authorization-svc, does not replace it** — every approval action is checked via `POST /v1/authorize` before it is applied. A partial unique index on `correlation_id` (migration `000003`) makes `POST /v1/workflows` genuinely idempotent: a retry returns the original instance, stages, and transitions with `created=false`, and exactly one row exists. |
| **obligations-svc** | 8088 | `POST/GET /v1/obligations`, `/{id}`<br>`POST /{id}/status`<br>`POST/GET /{id}/filing-requirements`<br>`GET /{id}/applicability`<br>`POST/GET /{id}/applicability-decisions` | Obligation + FilingRequirement registry, jurisdiction-bound with fail-closed validation against jurisdiction-rules-svc. **Applicability decisions** are append-only and versioned with `UNASSESSED` / `APPLICABLE` / `UNCERTAIN` states and confidence — `GET .../applicability` returns `UNASSESSED` when no row exists for a scope, **never coerced to `NOT_APPLICABLE`**. A decision missing both actor and system is rejected with 400. |
| **evidence-requirements-svc** | 8130 | `POST/GET /v1/evidence-requirements`, `/{id}`<br>`POST /{id}/end-date`<br>`POST /v1/evidence/evaluate`<br>`GET /v1/evidence/evaluations/{id}` | Determines what supporting evidence must exist *before* an action is permitted or finalized. **The strictest service on the platform** — rejects a missing tenant header rather than defaulting it, and 403s a body tenant that disagrees with the header. Falls back to the TENANT as authorization scope when a request omits `legal_entity_id`, which is why the demo seed grants two assignments. Emits `evidence.requirement.satisfied` / `.missing`. |
| **governance-decision-log-svc** | 8083 | `POST/GET /v1/decisions`, `/{id}`<br>`POST /{id}/replay`<br>`GET /{id}/replay-manifests` | Append-only immutable evidence store for governance decisions, protected by DB immutability triggers. **Replay manifests** re-resolve a historical decision against the policy version active *at the time* — live-verified: superseding a policy version with a very different threshold and then replaying reproduces the *original* outcome exactly, not the new one, and a genuine drift case is recorded faithfully rather than coerced to match. **Caveat: applies no tenant filter** — a read returns every tenant's decisions, filtered only by query parameters. |

### 3.3 Evidence, Audit & Utility

| Service | Port | Endpoints | Notes |
|---|---|---|---|
| **audit-event-store-svc** | 8084 | *(probes only)* | Kafka consumer, hash-chained immutable event storage with DLQ routing. **Has no query API at all** — Doc 03 §14.1 requires records queryable by actor, entity, action, workflow, or time range; the service has exactly one store method and only `/healthz` + `/readyz`. Evidence goes in and cannot be got out. The evidence is genuinely durable and hash-chained — it is only unreadable, so this is a *retrieval* gap, not a data-loss one. |
| **document-vault-svc** | 8094 | `POST/GET /v1/documents`, `/{id}`<br>`GET /{id}/content`<br>`POST/GET /{id}/versions`<br>`GET /{id}/access-log` | Versioned document storage with **SHA-256 integrity verified on every read**, append-only access lineage, retention, and jurisdiction-aware residency checks against tenant-entity-registry-svc's GTRM resolution. Local encrypted-at-rest backend for v1 (MinIO in compose). |
| **evidence-manifest-svc** | 8095 | `POST /v1/evidence-manifests`<br>`GET /{id}`, `/{id}/records` | Assembles structured evidence sets from governance-decision-log-svc + authorization-svc + workflow-svc for audit, regulator, and legal-discovery scenarios. **Fails closed on the whole manifest, never partial**, if any source is unreachable. |
| **workflow-history-svc** | 8097 | `GET /v1/workflows/history`<br>`GET /v1/workflows/{id}/history` | Durably consumes `zoiko.workflow.events`. Retries a failed message, then republishes it unchanged to `<topic>.dlq` (original headers preserved, plus failure reason, source offset, timestamp) and only then commits past it. |
| **schema-registry-svc** | 8093 | `GET /v1/schemas`, `/{eventName}/versions`, `/versions/latest`, `/versions/{v}`<br>`POST /{eventName}/versions` | Centralized, version-controlled event payload schemas. **Enforces backward-compatible evolution — a breaking change is a `409`.** Registration is gated through authorization-svc (`SCHEMA_PUBLISH`), fail-closed. |
| **retention-registry-svc** | 8148 | `POST/GET /v1/retention-policies`, `/{id}`<br>`POST/GET /v1/legal-holds`, `/{id}/release`<br>`GET /v1/retention/resolve` | Versioned retention policies + append-only legal holds. `resolve` composes both — **a hold blocks regardless of what the policy says**, and the service never deletes anything itself. A repeat release 409s. |
| **metric-registry-svc** | 8149 | `POST/GET /v1/report-metrics`, `/{code}`<br>`POST/GET /{code}/versions` | Versioned formula / scope / owner for every executive metric, mirroring policy-svc's one-ACTIVE-version-per-code doctrine. Every definition carries the mandated disclaimer *"Operational intelligence — not financial or legal assurance"* explicitly in Go, not just as a DB default. |
| **source-authority-svc** | 8150 | `POST/GET /v1/source-authority-maps`<br>`POST /v1/normalized-facts`<br>`GET /v1/source-authority/resolve` | Field-level source-of-truth precedence across connected systems. Returns the highest-precedence current fact, or **`ambiguous=true` with the conflicting facts and a conflict route when two equally-ranked sources disagree — never guesses.** Deliberately **scaffold-only**: the schema and resolution logic are real and live-verified, but populating real precedence rules requires operational knowledge about actual connected systems. |
| **kill-switch-registry-svc** | 8147 | `POST /v1/kill-switches/engage`, `/disengage`<br>`GET /v1/kill-switches`, `/resolve`, `/history` | Incident-response switches scoped across **four independently-nullable dimensions at once** (plane / domain / provider / tenant). `resolve` returns the most-specific currently-engaged match; the list endpoint gives operations visibility; history returns one scope's full audit trail, never erased. Append-only `kill_switch_events` ordered by a `BIGSERIAL event_seq` column — `created_at` alone can tie under rapid successive calls. Distinct from capability-registry's release state: that answers *"is this capability operationally enabled"* (product availability), this answers *"must this class of action stop right now"* (incident response). |

### 3.4 Finance

| Service | Port | Endpoints | State machine + rules |
|---|---|---|---|
| **general-ledger-svc** | 8098 | `POST/GET /v1/journals`, `/{id}`<br>`POST /{id}/validate`, `/{id}/post`, `/{id}/reverse` | **Tri-Phase Commit: `PENDING → VALIDATED → FINALIZED → REVERSED`.** Double-entry balance enforced at validation. **No finalized journal is ever hard-edited** — corrections only via a new reversing journal. Requires journal type (closed set of 7, refused outside it), document/transaction date, posting date (refused if earlier than transaction date), ISO-4217 currency; dimensions carried per line as JSONB. Every mutating action gated through authorization-svc with a real HTTP client from day one. Postgres RLS + explicit `tenant_id` filters. Emits `journal.posted`. |
| **accounts-payable-svc** | 8099 | `POST/GET /v1/invoices`, `/{id}`<br>`POST /{id}/validate`, `/{id}/approve`, `/{id}/request-payment` | **`RECEIVED → VALIDATED → APPROVED → PAYMENT_REQUESTED`.** There is no way to reach payment initiation without passing through approval and validation first. `request-payment` is genuinely idempotent: requesting payment on an invoice already `PAYMENT_REQUESTED` returns 200 with the current invoice and publishes nothing, whether it was already in that state or a concurrent request won the same atomic transition. Any other status is still a genuine invalid transition and still 422s. RLS **plus** explicit `tenant_id` filters in every query — RLS alone was insufficient while the platform connected as a Postgres superuser (found via general-ledger-svc's CI failure). |
| **accounts-receivable-svc** | 8101 | `POST/GET /v1/invoices`, `/{id}`<br>`POST /{id}/send`, `/{id}/pay`, `/{id}/overdue` | **`ISSUED → SENT → {OVERDUE \| PAID}`**, plus `OVERDUE → PAID`. `PAID` is terminal. Every transition is an atomic UPDATE. **Verifies a FINALIZED journal exists in general-ledger-svc before the payment transition.** Reconciles the legal entity against the caller's verified tenant on write — which is what turned "the demo entity does not exist" from an invisible inconsistency into a visible 403. |
| **bank-reconciliation-svc** | 8102 | `POST/GET /v1/statement-lines`, `/{id}`<br>`POST /{id}/match`, `/{id}/exception`<br>`POST /v1/bank-accounts/{id}/statements/{date}/complete` | **`UNMATCHED` forks to `MATCHED` or `EXCEPTION`, and `EXCEPTION` can later resolve to `MATCHED`** — unlike purchase-request-svc's pure fork. A MATCH is verified against a real FINALIZED journal in general-ledger-svc (status, legal entity, and net amount all cross-checked) before it is ever persisted. Emits `reconciliation.exception.raised`. |
| **treasury-svc** | 8103 | `POST/GET /v1/treasury/accounts`<br>`GET /positions`, `/effective-cash`, `/forecasts`<br>`POST /transfers`, `/thresholds` | Cash position, effective cash, liquidity thresholds, transfers, forecasts. Emits `cash.position.updated`, `effective.cash.position.updated`, `liquidity.threshold.breached`. |
| **financial-close-svc** | 8104 | `POST/GET /v1/close/periods`<br>`GET /{id}/readiness`, `GET /status`<br>`POST /{id}/lock` | Period lock + immutable close evidence. Emits `period.close.started`, `period.close.blocked`. |
| **intercompany-accounting-svc** | 8105 | `POST/GET /v1/intercompany/entries`, `/{id}`<br>`POST /{id}/match` | Cross-entity postings via governed intercompany handling. Emits `intercompany.entry.created`, `.posted`, `intercompany.mismatch.detected`. |
| **consolidation-svc** | 8106 | `POST/GET /v1/consolidation/runs`, `/{id}`<br>`GET /{id}/snapshots` | Consolidated reporting hierarchies and snapshots. Emits `consolidation.run.started`, `consolidation.exception.detected`. |
| **invoice-approval-svc** | 8107 | `POST/GET /v1/invoice-approvals`, `/{id}`<br>`POST /{id}/decide` | Approval routing for invoices. Emits `invoice.approval.started`. |

### 3.5 Payroll & Workforce

| Service | Port | Endpoints | Notes |
|---|---|---|---|
| **employee-master-svc** | 8108 | `POST/GET /v1/employees`, `/{id}`<br>`PUT /{id}`, `PUT /{id}/status` | Emits `employee.status.changed`. Sensitive HR data requires field-level and role-level access control. |
| **employment-contracts-svc** | 8109 | `POST/GET /v1/contracts`, `/{id}`<br>`GET /employee/{id}/active`<br>`POST /{id}/amend`, `/{id}/terminate` | **Full version lineage preserved** on every change. Emits `employment.contract.issued`, `.amended`, `.terminated`. |
| **payroll-run-svc** | 8110 | `POST/GET /v1/payroll/runs`, `/{id}`<br>`POST /{id}/calculate`, `/{id}/finalize`<br>`GET /{id}/slips`, `/{id}/shadow-comparison` | Finalization produces an **immutable run snapshot**. Shadow comparison = parallel-run verification. Retroactive changes generate adjustment records, never silent overwrites. Emits `payroll.run.initiated`, `.calculated`, `.completed`, `.blocked`. |
| **compensation-svc** | 8111 | `POST/GET /v1/compensation/structures`<br>`POST/GET /revisions`, `GET /revisions/employee/{id}/active`<br>`POST/GET /bonuses`, `POST /bonuses/{id}/approve` | Emits `compensation.effective.changed`. |
| **benefits-svc** | 8112 | `POST/GET /v1/benefits/plans`<br>`POST/GET /elections`, `PUT /elections/{id}`, `POST /elections/{id}/cancel`<br>`GET /deductions/employee/{id}`, `/elections/employee/{id}` | Benefit eligibility, elections, resulting deductions. |
| **payroll-tax-svc** | 8113 | `POST /v1/payroll-tax/calculate`<br>`POST/GET /profiles`<br>`GET /calculations`, `/{id}`, `/{id}/audit`<br>`POST /calculations/{id}/adjust` | Calculations **record the rule basis applied at the time of decision**. Emits `payroll.tax.calculated`, `.adjusted`, `.exception.detected`. |
| **payroll-exceptions-svc** | 8114 | `POST/GET /v1/payroll-exceptions`, `/{id}`<br>`POST /{id}/resolve`, `/{id}/waive`<br>`GET /blockers/{payroll_run_id}` | Emits `payroll.exception.raised`, `.resolved`, `payroll.blocker.flagged`. |
| **leave-absence-svc** | 8115 | `POST/GET /v1/leave/types`, `/requests`, `/requests/{id}`<br>`POST /requests/{id}/approve`, `/reject`<br>`POST /balances/accrue`, `GET /balances/employee/{id}` | Emits `leave.balance.updated`. |
| **org-structure-svc** | 8116 | `POST/GET /v1/org/departments`, `/{id}`, `/positions`, `/{id}`<br>`POST /assignments`, `GET /assignments/employee/{id}` | Emits `org.structure.changed`. |
| **offboarding-severance-svc** | 8117 | `POST/GET /v1/terminations`, `/{id}`<br>`POST /{id}/approve`, `/{id}/finalize`<br>`POST/GET /offboarding/checklists`, `GET /checklists/employee/{id}`<br>`PUT /offboarding/checklists/items/{id}` | Termination flows enforce **jurisdiction-local notice, approval, and evidence requirements**. |
| **performance-review-svc** | 8139 | `POST/GET /v1/review-cycles`, `/{id}`, `POST /{id}/close`<br>`POST/GET /v1/review-records`, `/{id}`, `POST /{id}/submit`, `/{id}/complete` | Review cycles and per-employee review records. |
| **workforce-compliance-svc** | 8118 | `POST/GET /v1/compliance/work-auth`, `/employee/{id}`, `POST /{id}/verify`<br>`POST/GET /visas`, `/employee/{id}`, `POST /{id}/flag-expiry`<br>`POST /hours`<br>`GET /alerts`, `POST /alerts/{id}/resolve` | Work authorization, visa expiry tracking, working-hours compliance, alerting. |

### 3.6 Legal, Corporate & Commercial

| Service | Port | Endpoints | Rules |
|---|---|---|---|
| **contract-lifecycle-svc** | 8119 | `POST/GET /v1/contracts`, `/{id}`<br>`PUT /{id}`<br>`POST /{id}/submit`, `/{id}/activate`, `/{id}/terminate`<br>`GET /{id}/versions` | **`DRAFT → PENDING_APPROVAL → ACTIVE → TERMINATED`.** Revising the terms does *not* change status: it restates them, bumps `version`, and appends an immutable snapshot to `contract_versions`. Activation and termination also snapshot, which is why an active contract is already at v3.<br><br>**Three defects surfaced in the UI rather than smoothed over:**<br>1. **Contract writes are not authorized.** The service constructs an authorization-svc client and no handler ever calls it. A contract mutation cannot fail closed; the Server Action's session check is the only gate, and the service's HTTP surface stays open regardless.<br>2. **Approval is a status, not a gate.** `POST /{id}/activate` refuses only `ACTIVE` and `TERMINATED`, so a `DRAFT` can be signed into force without passing through `PENDING_APPROVAL`.<br>3. **Submission is not versioned.** Every other transition appends a version row; submitting for approval appends none and records no actor, so history cannot show that a contract was submitted, or by whom.<br><br>Takes no `tenant_id` query parameter — reads `X-Tenant-Id` and lets RLS filter. A read with no identity header falls back to the literal tenant `"default"` and returns an empty list, so a dropped header looks exactly like an empty register. Ids are `TEXT` (`ctr-<uuid>`), not `uuid`, so the UUID-typo-becomes-a-503 trap does not apply here. |
| **clause-template-svc** | 8120 | `POST/GET /v1/clauses`, `/templates`, `/clause-templates`, `/{id}`<br>`PUT /{id}` | Clause and template library. |
| **obligation-tracking-svc** | 8121 | `POST/GET /v1/obligations`, `/{id}`<br>`PUT /{id}`, `POST /{id}/fulfill` | Machine-trackable contractual obligations. **Duplicates obligations-svc and filing-tracker-svc — see gap #78.** |
| **board-resolutions-svc** | 8122 | `POST/GET /v1/meetings`, `/{id}`<br>`POST/GET /v1/resolutions`, `/{id}`<br>`POST /{id}/vote`, `/{id}/pass` | Board meetings, resolutions, voting. Tied to entity context and authority rules. |
| **corporate-actions-svc** | 8123 | `POST/GET /v1/corporate-actions`, `/{id}`<br>`PUT /{id}`, `POST /{id}/execute` | Entity-bound corporate actions. |
| **counterparty-management-svc** | 8124 | `POST/GET /v1/counterparties`, `/{id}`<br>`PUT /{id}`, `POST /{id}/compliance` | Counterparty master + compliance state. |
| **procurement-workflow-svc** | 8134 | `POST/GET /v1/procurement-cases`, `/{id}`<br>`POST /{id}/approve`, `/{id}/reject`, `/{id}/issue-order` | Emits `procurement.approval.started`. **The one place with a real compensating transaction:** `IssueOrder` calls purchase-order-svc then records the id locally; if that local write fails it retries 3× with backoff, and the flow stays recoverable regardless because purchase-order-svc keys the order on the case's own id as an idempotency key. |
| **purchase-request-svc** | 8100 | `POST/GET /v1/purchase-requests`, `/{id}`<br>`POST /{id}/approve`, `/{id}/reject` | **Pure fork: `PENDING → APPROVED \| REJECTED`**, both terminal, single atomic conditional UPDATE. Gated through authorization-svc; RLS + explicit `tenant_id` filters from day one. Emits `purchase.request.created`, `.approved`, `.rejected`. |
| **purchase-order-svc** | 8129 | `POST/GET /v1/purchase-orders`, `/{id}`<br>`POST /{id}/amend`, `/{id}/close`<br>`GET /{id}/amendments` | **`ISSUED → CLOSED`**, closing terminal. Amending does *not* change status: it restates the total, bumps `version`, and appends an immutable amendment row. Every mutation is checked against authorization-svc **before** it is applied, fail-closed. **Note:** the amendment ledger holds full before/after values but the service exposes no endpoint to read it — `version` is the only visible trace that an order was restated. Emits `purchase.order.issued`, `.amended`, `.closed`. |
| **vendor-due-diligence-svc** | 8135 | `POST/GET /v1/vendor-checks`, `/{id}` | Legal + tax + due-diligence gates on vendor onboarding. One of only four services with real Postgres integration test coverage. |
| **spend-controls-svc** | 8131 | `POST/GET /v1/spend-policies`, `POST /{id}/deactivate`<br>`POST /v1/spend-checks`<br>`POST /v1/spend-consumptions`, `GET /usage` | Spend policy authoring, pre-spend checks, consumption ledger, usage reporting. |

### 3.7 Tax & Compliance

| Service | Endpoints | Notes |
|---|---|---|
| **tax-rules-svc** (8125) | `POST/GET /v1/tax-rules`, `/{id}`, `PUT /{id}` | Effective-dated, versioned tax logic. |
| **tax-determination-svc** (8126) | `POST/GET /v1/tax-determinations`, `/{id}`<br>`POST /{id}/override` | **Records the rule basis applied at the time of decision.** Tax outputs are never black-box derived. Establishments carried but unvalidated (ORG-08 missing). |
| **vat-gst-svc** (8127) | `POST/GET /v1/vat-returns`, `/{id}`, `PUT /{id}`, `POST /{id}/file` | Indirect tax returns. |
| **corporate-tax-svc** (8128) | `POST/GET /v1/corporate-tax-returns`, `/{id}`, `PUT /{id}`<br>`POST /{id}/assess`, `/{id}/submit` | Corporate tax estimation and submission. |
| **withholding-tax-svc** | `POST /v1/withholding-tax/calculate`<br>`POST/GET /`, `/{id}`, `PUT /{id}`<br>`POST /{id}/remit`, `/{id}/cancel` | Withholding calculation, remittance, cancellation. |
| **filing-preparation-svc** | `POST/GET /v1/filing-preparation/drafts`, `/{id}`, `PUT /{id}`<br>`POST /{id}/validate`, `/{id}/finalize` | Filing preparation is **evidence-attached**. Emits `filing.draft.created`, `.updated`, `filing.ready.for.submission`. |
| **filing-tracker-svc** | `POST/GET /v1/filing-tracker/requirements`, `/{id}`, `PUT /{id}`<br>`POST /{id}/submit`, `/{id}/confirm`, `/{id}/mark-overdue` | Deadline tracking. Emits `filing.requirement.updated`. **Duplicates obligations tables — gap #78.** |
| **compliance-status-svc** | `POST /v1/compliance-status/evaluate`<br>`GET /`, `/{id}`, `/gaps`<br>`POST /gaps`, `/gaps/{id}/resolve` | Compliance status must be **explainable and evidentially backed**. Emits `compliance.status.changed`, `compliance.gap.detected`, `.resolved`. |
| **exception-escalation-svc** | `POST/GET /v1/exception-escalation/exceptions`, `/{id}`<br>`POST /{id}/escalate`, `/{id}/resolve`<br>`GET /escalations` | Traceable, severity-aware, deadline-sensitive escalation. |

### 3.8 Intelligence & Reporting (Phase 6)

> **Architectural constraint.** Intelligence may **classify, recommend, predict, summarize, flag**.
> It may **not** silently override policy, bypass approval logic, alter immutable records, or act
> without traceable justification. Every AI-assisted action must record the model or rule set used,
> the input context class, a confidence score where applicable, the human approval requirement, and
> the final action + approver.

| Service | Port | Endpoints |
|---|---|---|
| **anomaly-detection-svc** | 8134\* | `POST /v1/anomalies/detect`<br>`POST/GET /rules`<br>`GET /`, `/{id}`, `POST /{id}/status` — configurable rule engines + statistical models over financial transactions, payroll spikes, operational anomalies |
| **forecasting-svc** | 8135\* | `POST /v1/forecasts/generate`, `/{id}/recalculate`<br>`GET /`, `/{id}`, `DELETE /{id}` — financial, payroll, cash-flow, and headcount forecasts from historical platform trends |
| **compliance-risk-scoring-svc** | 8136\* | `POST /v1/risk-scores/calculate`, `/thresholds`<br>`GET /`, `/{id}`, `/thresholds`, `DELETE /{id}` — org-wide risk from framework obligations, policy violations, audit history |
| **reconciliation-intelligence-svc** | 8137\* | `POST /v1/reconciliations/analyze`<br>`POST /{id}/resolutions/{itemId}/apply`<br>`GET /`, `/{id}`, `DELETE /{id}` — multi-source matching, unmatched-item identification, suggested resolutions |
| **reporting-orchestration-svc** | 8138\* | `POST/GET /v1/reports/definitions`, `/{id}`<br>`PATCH /definitions/{id}/status`<br>`POST /definitions/{id}/runs`, `GET /runs`, `/runs/{id}` — scheduled cross-service report generation |
| **decision-support-svc** | 8138 | `POST/GET /v1/recommendations`, `GET /{id}` |
| **migration-integrity-svc** | 8139\* | `POST /v1/migrations/validate`<br>`POST /{id}/audit/{entryId}/remediate`<br>`GET /`, `/{id}`, `DELETE /{id}` — schema/duplicate/format integrity checks on migration batches with audit remediation trails |

\* Phase-6 doc ports; the main compose reassigns several (decision-support 8138, mtls 8140).

### 3.9 Security & Trust (Phase 6)

| Service | Port | Endpoints + status |
|---|---|---|
| **carta-svc** | 8142 | `POST /v1/carta/evaluate`<br>`GET /assessments`, `/{id}` — **Continuous Adaptive Risk and Trust Assessment**: `ALLOW` / `STEP_UP_MFA` / `ISOLATE` / `DENY`. **Wired into gateway-auth-svc's per-request `Verify` handler.** Blocks on ISOLATE/DENY; STEP_UP_MFA logs and streams but does not block, because no step-up challenge flow exists downstream to redirect to. Tested for all four decision outcomes. |
| **siem-integration-svc** | 8141 | `POST /v1/siem/exporters`, `/stream`<br>`GET /exporters`, `/{id}`, `/events` — streams audit logs, security alerts, and operational events to Splunk / Datadog / Elastic / Sentinel. **Wired into 5 real producers**: gateway-auth-svc, authorization-svc, key-management-svc, mtls-management-svc, identity-context-svc — on auth failures, CARTA flags, authorization denials, key rotation/disable, cert issuance/rotation/revocation, MFA and trust-posture events. Fire-and-forget, tenant-opt-in via exporter config, **never gates the primary operation**. |
| **mtls-management-svc** | 8140 | `POST/GET /v1/mtls/certificates`, `/{id}`, `POST /{id}/rotate`, `DELETE /{id}`<br>`POST/GET /policies` — service-to-service mutual TLS lifecycle, automated rotation, trust stores. **The client capability was extended to all ~70 inter-service authz callers, but `AuthzMTLSEnabled` defaults false everywhere.** Available platform-wide ≠ turned on. |
| **key-management-svc** | 8143 | `POST/GET /v1/keys`, `/{id}`<br>`POST /{id}/rotate`, `/{id}/disable` — models BYOK/HYOK across AWS KMS, Azure Key Vault, GCP KMS, Vault. **Metadata CRUD only — never actually used to encrypt or decrypt anything.** |

### 3.10 Integration & Extensibility (Phase 7)

Governed integration standards (**ZoikoSchema**) protect system integrity without incurring
custom-connector debt. External systems must never bypass the Governance Plane; imported data must
preserve provenance; exported actions must preserve entity and jurisdiction context; integration
failures must be observable, logged, and retry-safe.

| Service | Port | Endpoints |
|---|---|---|
| **connectivity-api-bridge-svc** | 8144\* | `POST/GET /v1/bridges`, `/{id}`<br>`POST /{id}/ingest`, `GET /{id}/logs`<br>`GET /v1/api-bridge/connections`, `/{id}` — governed API ingestion + schema mapping validator. Emits `connectivity.bridge.created`, `.ingested` |
| **banking-connector-svc** | 8145\* | `POST/GET /v1/banking/connections`, `/{id}`, `/accounts`, `/{id}`<br>`POST /statements`, `GET /connections/{id}/statements` — ISO 20022 / SWIFT, automated feeds. Emits `banking.connection.created`, `banking.statement.ingested` |
| **hris-connector-svc** | 8146\* | `POST/GET /v1/hris/integrations`, `/{id}`<br>`POST /sync`, `POST/GET /syncs`, `/{id}`, `GET /sync/jobs` — Workday, SuccessFactors, ADP, local HRIS. Emits `hris.integration.created`, `hris.sync.triggered` |
| **tax-authority-interface-svc** | 8147\* | `POST/GET /v1/tax-authority/interfaces`, `/{id}`, `/filings` — real-time statutory filings, e-invoicing (MTD UK, SAF-T Europe, GST/VAT bridges) |
| **esignature-integration-svc** | 8148\* | `POST/GET /v1/esignature/envelopes`, `/{id}`<br>`POST/PATCH /envelopes/{id}/status` — DocuSign, Adobe Sign for legally binding employment and commercial contracts. Emits `esignature.envelope.sent`, `.completed` |
| **external-data-feed-svc** | 8149\* | `POST/GET /v1/external-data-feeds/subscriptions`, `/{id}`<br>`POST /events/ingest`, `GET /events` — FX rates, inflation indices, benchmarks. Emits `fx.rate.update`, `external.feed.subscribed`, `.event.ingested` |

\* Phase-7 doc ports; the main compose assigns commercial-account 8144, capability-registry 8145, ai-governance 8146.

### 3.11 Commercial Plane (doc7 — the monetization layer)

| Service | Port | What it owns |
|---|---|---|
| **commercial-account-svc** | 8144 | `commercial_accounts` (one per organization, unique constraint), `memberships` (deactivate-only, never delete), `price_catalogs`, `plans`, `entitlement_limits`, `commercial_subscriptions`, `evaluation_programs` (trials), `contract_entitlement_overlays`, `commercial_usage_meter_events`, `subscription_change_requests`, `billing_source_transfers`, `subscription_status_events`.<br><br>**Subscription state machine (doc7 §29 verbatim):** `EVALUATION` / `ACTIVE` / `PAST_DUE` / `RESTRICTED` / `SUSPENDED` / `CANCELED` / `TERMINATED`. Dunning transitions are validated against a `ValidSubscriptionStatusTransitions` map, fail-closed; a same-status repeat is an idempotent no-op that logs no extra event; a direct `ACTIVE → RESTRICTED` jump 409s.<br><br>**Double-charge prevention is structural, not application-level** — a partial unique index enforcing one non-terminal subscription per `commercial_account_id` is what actually makes double-billing impossible.<br><br>Upgrade/downgrade is `PREVIEWED → APPLIED`, applied atomically in one transaction: **a subscription is never repointed without a prior, inspectable preview row.** Entitlement resolution returns the plan limit, overridden by an active contract overlay when one exists. The usage meter is keyed on a caller-supplied idempotency key (TEXT, not UUID) so a retry cannot double-count. Billing-source transfers atomically cancel the old subscription and create the new one — never a silent swap.<br><br>**The only service with the transactional outbox pattern** (`internal/outbox` — Insert into the SAME tx as the business write; a `Relay` polls unpublished rows and publishes on an interval), piloted on `CreateSubscription`. |
| **capability-registry-svc** | 8145 | Five deliberately separate registries that must never collapse into one feature flag:<br>• `capabilities` — does the capability exist at all<br>• `market_releases` — jurisdiction / entity / language gating<br>• `integration_capabilities` — connector/provider certification status<br>• `releases` — `GA` / `BETA` / `PILOT` / `INTERNAL` / `DISABLED` / `INCIDENT_RESTRICTED`, **append-only** (history never overwritten)<br>• `capability_claims` — what marketing/sales may say is available, with a named `wording_owner` + approver, **never auto-generated from roadmap state**<br><br>`GET /v1/capability-resolution/{code}` checks all four in priority order and returns structured reason codes: `ENABLED` / `MARKET_BLOCKED` / `INCIDENT_RESTRICTED` / `PROVIDER_UNAVAILABLE` / `CAPABILITY_UNKNOWN`. |
| **ai-governance-svc** | 8146 | `ai_runs` (model/prompt/tool version, source + evidence refs, confidence, audit id), `action_risk_classifications` (`MONEY` / `EMPLOYMENT` / `TAX_FILING` / … / `REGULATED_REPORTING`, doc7 §G2's list verbatim), `automation_actions` (preconditions, approvals, idempotency, postcondition verification, rollback; unique `(tenant_id, idempotency_key)`), `automation_policies` (per-tenant/role/risk-class/tool allowlist — **fail-closed by default: an unlisted action 403s `NOT_ALLOWLISTED`**), `model_provider_registrations` (training-use posture, retention, region, DPA verification; **defaults to `NO_TRAINING` — no default training use is authorized**), `policy_change_approvals`.<br><br>**Maker-checker enforced: `decider != proposer`.** Self-approval 403s on both automation-action decisions and policy-change approvals.<br><br>It is a **record-keeping and gate-checking layer only** — it never runs models or executes automations itself, per doc7 §11's doctrine that "the deterministic policy layer… tenant automation policy and required human approvals outrank model preference." |

---

## 4. Event backbone

~100 Kafka topics, named `zoiko.<domain>.events`.

**Design principles:** events are **facts, not commands**; append-only; downstream systems subscribe
without mutating source truth; every payload includes tenant, legal entity, actor, correlation id,
and jurisdiction context.

### The Doc 03 §19 envelope

Every event carries: `event_id`, `event_version`, `timestamp`, `tenant_id`, `legal_entity_id`,
`jurisdiction` (where the domain object genuinely has one), `actor_id`, `correlation_id`,
`source_service`, and a payload with its own `schema_version`. Genuinely-absent fields are
`omitempty`'d and documented, **never fabricated**.

A 2026-08-20 sweep verified all ~90 services and fixed a long tail of real bugs found along the way:

- **Deterministic `event_id` collisions in 21+ services** — any `ON CONFLICT (event_id) DO NOTHING`
  dedup consumer would have silently dropped a repeat real event.
- **6 services whose `Publish` logged "event published" but never called `WriteMessages` at all.**
- **5 services publishing via a detached goroutine** against `context.Background()` with an
  unconditional `return nil`, making a broker outage invisible to the caller.
- Several services discarding an already-authz-verified principal instead of using it as `actor_id`.

### Consumer resilience

audit-event-store-svc and workflow-history-svc retry a failed message a few times against the same
handler, then republish it unchanged to `<topic>.dlq` (original headers preserved, plus failure
reason, source offset, timestamp) and only then commit past it. A failed DLQ publish falls back to
the old uncommitted-and-retry behaviour, so this never makes failure handling worse.

> **Why this matters:** Kafka consumer group offsets are a single per-partition watermark. A *later*
> message succeeding and committing silently carries the offset past an earlier failed one,
> permanently dropping it — and until that happens the failed message head-of-line-blocks every
> other message on the partition.

### Canonical domain events (Doc 01 §9.2)

| Domain | Events |
|---|---|
| **Finance** | `journal.posted`, `period.closed`, `reconciliation.completed`, `intercompany.entry.posted` |
| **Payroll** | `payroll.run.initiated`, `payroll.run.completed`, `payroll.exception.raised` |
| **HR** | `employee.hired`, `employee.terminated`, `contract.amended`, `leave.approved` |
| **Legal** | `contract.executed`, `obligation.created`, `resolution.approved`, `filing.submitted` |
| **Tax** | `tax.liability.updated`, `filing.prepared`, `tax.payment.initiated` |
| **Compliance** | `obligation.overdue`, `compliance.gap.detected`, `exception.escalated` |

---

## 5. Frontend — what's actually wired

Every backend call is made from a **Server Component or Server Action, never from the browser.**
Two load-bearing reasons:

- The Go services ship no CORS middleware, so a browser `fetch` straight at a service port is
  blocked by the preflight.
- Backend hostnames and the caller's identity headers stay off the client.

### Conventions

- A backend call returns an `ApiResult` union, **never a throw** — one unavailable service degrades
  its own panel to an empty state instead of taking down the whole page render
  (`lib/api/client.ts`).
- Every panel that can be empty renders an icon + label saying why. Containers never collapse to
  blank space.
- Server Actions verify the session themselves — they are reachable by direct POST, not only
  through the UI, so they do not rely on the `/admin` proxy matcher.

### Page → service coverage

| Page | Service(s) | Coverage |
|---|---|---|
| Overview | governance-decision-log-svc, obligations-svc | reads only |
| Governance Log | governance-decision-log-svc | **3/3** — list, get, record |
| Policies | policy-svc | **6/6** — applicable set, version history, create, version, activate, evaluate |
| Evidence | evidence-requirements-svc | **6/6** — catalog, get, create, retire, evaluate, get evaluation |
| Secret Vault | secret-vault-integration-svc | **12/12** — policies, versions, activate, material, broker, leases, revoke, rotate, audit |
| Commercial Ops | purchase-order-svc | **5/5** — list, get, issue, amend, close |
| Legal & Contracts | contract-lifecycle-svc | **8/8** — list, get, versions, create, revise, submit, activate, terminate |
| Settings | configuration-feature-flag-svc | **6/6** — flags and config: list, get, upsert each |
| Tenants · Identity · Jurisdictions · Finance · Access Control · Retention · AI Governance · Purchase Requests · Schemas · Documents · Tax · Payroll · HR · Compliance · Audit Events · Delegations · Notifications | various | real pages, mostly read panels + some Server Actions |

> **The repo README is stale on this point.** It says Finance / Payroll / HR / Tax / Compliance are
> "still placeholders". They are not — finance is 790 lines, tenants 523, identity 502. Several are
> still read-only panels with limited write actions, but they are real pages against live services.

### Governance-plane pages — what each service does *not* enforce

The four pages under "Governance plane" in the sidebar are not business domains — they are the
cross-cutting services every domain is meant to be governed *by*. Each page states up front what its
service does **not** enforce, because in several cases the honest answer is "nothing":

| Service | Authorizes its writes? | Notes |
|---|---|---|
| `governance-decision-log-svc` | no | Also applies **no tenant filter** — a read returns every tenant's decisions, filtered only by query parameters. |
| `policy-svc` | no | Only `APPROVAL_THRESHOLD` can be evaluated; other types can be activated and are then enforced by nothing. Evidence recording is best-effort, so a 200 does not prove the decision was logged. |
| `secret-vault-integration-svc` | admin routes: no | The broker route authorizes the *requesting workload*, not the operator. Denies by absence, so a 404 means "no policy" and only a 403 means "policy said no". |
| `evidence-requirements-svc` | **yes, fail-closed** | The strictest service here. Rejects a missing tenant header rather than defaulting it, and 403s a body tenant that disagrees with the header. |
| `configuration-feature-flag-svc` | no | Append-only and versioned; 201 vs 200 distinguishes a real change from a no-op. |
| `purchase-order-svc` | **yes, fail-closed** | Every mutation checked before it is applied. |

### Two limits no UI can work around

- **purchase-order-svc amendment history is unreadable.** Amendments are written to an append-only
  ledger with full before/after values, and the service exposes no endpoint to read it. An order's
  `version` is the only visible trace that it was restated.
- **Secret material and lease tokens never reach the browser.** Material is sent one-way to the
  service. The broker's `lease_token` is stripped server-side before the action returns, so it
  cannot enter the RSC payload — only its existence is reported.

### 403 vs 503

The UI keeps *"you may not do this"* (403) and *"we could not determine whether you may"* (503) as
distinct messages, because collapsing them would report a governance failure as a permission problem.

---

## 6. What still needs to be implemented — the honest list

Worked top-to-bottom in `docs/architecture/backend-completion-tracker.md`, which has a strict
one-row-at-a-time rule. Statuses below are as recorded there and in the gap analysis.

### P1 — Tenant isolation (partially done)

| Item | Status |
|---|---|
| Tier-0 governance services with zero RLS | ✅ **Complete** — 7 real services fixed, closed 2026-08-22 |
| Superuser bypassing all 119 RLS policies estate-wide | ✅ **Fixed** — new non-superuser, non-owner `zoiko_app` runtime role (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`) across all 63 DBs + phase5/6/7 stacks. Migrations still run as superuser (DDL needs it), runtime traffic does not. **Live-verified**: as superuser a query returned both tenants' rows; as `zoiko_app` only tenant A's |
| **Fabricated `"default-tenant"` fallback** (16 services) | 🔴 **10 still Not Started**: carta-svc, compliance-risk-scoring-svc, evidence-requirements-svc, forecasting-svc, key-management-svc, migration-integrity-svc, mtls-management-svc, reconciliation-intelligence-svc, reporting-orchestration-svc, siem-integration-svc |
| **Caller-declared tenant identity** (candidate sweep) | 🔴 Not yet a confirmed count |
| **Non-Tier-0 services with zero RLS** | 🔴 commercial-account-svc, evidence-manifest-svc, kill-switch-registry-svc, retention-registry-svc + others |
| **RLS enabled but not FORCEd** (defense-in-depth) | 🔴 **41 services** — access-control, anomaly-detection, benefits, clause-template, compensation, compliance-risk-scoring, compliance-status, consolidation, contract-lifecycle, corporate-actions, corporate-tax, counterparty-management, decision-support, employee-master, employment-contracts, exception-escalation, filing-preparation, filing-tracker, forecasting, intercompany-accounting, invoice-approval, leave-absence, migration-integrity, obligation-tracking, offboarding-severance, org-structure, payroll-exceptions, payroll-run, payroll-tax, performance-review, procurement-workflow, reconciliation-intelligence, reporting-orchestration, tax-determination, tax-rules, **tenant-entity-registry**, treasury, vat-gst, withholding-tax, workflow-history, workforce-compliance |

### P2 — Structural / cross-cutting

- 🔴 **No shared Go module enforcing the event envelope.** Every service hand-copies its own struct;
  nothing stops the next new service from drifting. (The `_contract` vendoring pattern exists for the
  *input* envelope — this is the *output* event envelope.)
- 🔴 **Transactional outbox is a 1-service pilot.** `grep -rl "internal/outbox" services/*/internal`
  returns only commercial-account-svc. Every other service can silently drop an event on a crash
  between DB commit and Kafka publish.
- 🔴 **No general-purpose saga / compensating-transaction coordinator.** One flow
  (procurement-workflow-svc) got a one-off fix; there is no reusable pattern for the next
  multi-service flow that needs it (e.g. Hire-to-Pay).

### P3 — Governance plane completeness

- 🔴 **No single enforced governance pipeline sequence.** Each service calls whichever governance
  engines it individually decided on. Only authorization-svc is near-universal (69 of ~70 services).
  Doc 01 §07 defines an ordered sequence; nothing enforces it.
- 🔴 **audit-event-store-svc has no query API at all.** Doc 03 §14.1 requires its records to be
  "immutable and **queryable** by actor, entity, action, workflow, or time range". Evidence goes in
  and cannot be got out. The RLS policy added there is deliberately shaped so this API inherits
  tenant scoping by default when it is built.
- 🔴 **A DENIED governance decision does not auto-convert to an approval workflow** except where
  explicitly wired per service. Doc 02 Diagram 2 requires it universally.
- 🔴 **jurisdiction-rules-svc has no compliance calendar entity** — it is a named "Owns" item, and
  `jurisdiction.calendar.changed` is declared but unemittable.
- 🔴 **authorization-svc has no platform-scoped, non-tenant, non-entity resource concept** —
  services with platform-wide reference data fake a synthetic `legal_entity_id` as a workaround.
  (Spec silence, not a codified violation.)

### P4 — Data model (Doc 04)

**Missing entities, each verified by zero grep hits:**

| Entity | Note |
|---|---|
| `UltimateBeneficialOwner` | No table anywhere |
| `FiscalCalendar` | Dangling FK column exists, no table |
| `TaxLogicSnapshot` | Dangling FK in 2 services |
| `GrossToNetCalculationLog` | — |
| `NexusRecord` | — |
| `SchemaDependencyMap` + `compatibility_mode` | — |
| **chart-of-accounts (`Account`)** | general-ledger-svc's own migration comment admits this |
| standalone `VendorProfile` | Only scattered FK-shaped columns |
| Document Vault `virus_scan_status`, `digital_signature_id` | Doc 04 §15.5 requires both |

**Ownership violations of §2.1's single-owner doctrine:**

- **Obligation tracking duplicated across 3 services** with non-identical schemas — obligations-svc,
  obligation-tracking-svc, and filing-tracker-svc each have their own `obligations` /
  `filing_requirements` tables.
- **Identity/role assignment duplicated** across authorization-svc and identity-context-svc.
- **Delegated authority duplicated** — authorization-svc owns a `delegated_authorities` table while
  Doc 03 §9.3 names Delegated Authority Service as the authoritative owner.
- **authorization-svc's `permission_bundles`, `principal_role_assignments`, `delegated_authorities`, 
  and `access_decision_log` carry no `tenant_id` column at all** — only `legal_entity_id`. RLS was
  only possible on `roles` / `sod_rules`, the 2 tables that actually have the column. Fabricating a
  `tenant_id` on tables never given one is a data-model change, not an RLS migration.
- **No field-level encryption or classification tagging** on tax ID / bank reference / payroll
  columns anywhere outside document-vault-svc (Doc 04 §2.8, §20).

### P5 — Security (Doc 05) — capability exists, incomplete

| Item | Status |
|---|---|
| **secret-vault-integration-svc's broker never returns real secret material** | 🟠 **BLOCKED** — no service can bootstrap a runtime credential through it. A live integration on general-ledger-svc was attempted, confirmed non-functional, and reverted rather than shipping a fake wiring. Needs a vault-side API design decision, not more wiring |
| key-management-svc is metadata CRUD only | 🔴 Never actually used to encrypt or decrypt anything |
| No confidential computing / TEE anywhere | 🔴 Spec calls for it on payroll and tax calculation logic |
| No PAM / break-glass / just-in-time elevation | 🔴 Nowhere on the platform |
| mTLS available on all ~70 callers | 🔴 **Off by default everywhere** (`AuthzMTLSEnabled=false`) |

### P6 — Testing

- 🔴 **Most services' store layers are tested only against stubs, not real Postgres.** Only
  jurisdiction-rules-svc, identity-context-svc, tenant-entity-registry-svc, and
  vendor-due-diligence-svc have real integration coverage.
- 🔴 **No contract tests, no load/performance tests, no DR/restore tests** anywhere.
- 🔴 No enforced coverage threshold.

### P7 — Engineering process (Doc 06)

- 🔴 **Only 1 of the mandated 6 environments is real** (local dev). No staging, QA, integration, or
  shared-dev config exists anywhere.
- 🔴 **CI has no security scanning, artifact signing, schema-compatibility gate, policy check, or
  deployment-approval rules.**
- 🔴 Blue-green / canary is documented as a preference only — real k8s manifests are plain
  rolling-update.
- 🔴 **No release evidence** (manifest / approver / rollback reference).
- 🔴 **IaC (Terraform + k8s manifests) covers only ~30 of 86 services** — docker-compose remains how
  most of the estate actually runs.

### P8 — The biggest structural gap: 107 of 200 spec'd services do not exist

Only **93 of the input-contract catalogue's 200 service IDs** map onto the 86 built services. Their
input contracts cannot be implemented because the service does not exist. Entire domains are missing:

| Domain | Missing | Notably |
|---|---|---|
| **REF** Reference Data & Accounting Basis | **9 / 10** | REF-02…REF-10 — the entire basis layer. Only REF-01 Jurisdiction Registry exists, which is why `book_id` / `reporting_basis` is carried but unenforceable (gap G-1) |
| **INV** Inventory | **5 / 5** | None of the inventory domain exists |
| **PRJ** Project Accounting | **4 / 4** | None of the project domain exists |
| **AST** Assets | **3 / 3** | None of the fixed-asset domain exists |
| **ACC** Core Accounting | 10 / 18 | ACC-01 Chart of Accounts, ACC-15 Trial Balance, ACC-16 Signed Financial Snapshot |
| **AUD** Audit & Assurance | 8 / 10 | AUD-01 Engagement through AUD-10 Audit Trail Export |
| **AR** Revenue & Receivables | 8 / 10 | AR-05 Electronic Invoice, AR-06 Credit/Debit Note, AR-08 Cash Application |
| **TAX** Global Tax | 7 / 15 | TAX-07 Tax Ledger, TAX-11 E-Invoice Clearance, TAX-13 SAF-T |
| **BIZ** Business Operations | 7 / 10 | BIZ-04 Forms, BIZ-05 Task/Case, BIZ-06 CRM |
| **AP** Procurement & Payables | 6 / 12 | AP-09/10/11 — **the whole payment proposal → payment run chain** |
| **BNK** Banking & Treasury | 6 / 10 | BNK-01 Bank Account, BNK-06 Payment Initiation |
| **OPS** Platform Reliability | 5 / 6 | OPS-01 Observability, OPS-04 Backup & Recovery |
| **INT** Integration Platform | 5 / 10 | INT-02 Event Bus, INT-03 Outbox/Inbox, INT-04 Webhook |
| **ORG** Identity & Party | 4 / 10 | ORG-04 Group & Ownership, ORG-10 Payee Master |
| **FIN** Planning & Performance | 4 / 7 | FIN-04 Variance Analysis, FIN-07 Board Pack |
| **LEG** Legal & Governance | 4 / 12 | LEG-02 Director Register, LEG-09 Legal Matter |
| **REP** Reporting | 3 / 7 | REP-01 Financial Statements, REP-03 XBRL |
| **DATA** Data & AI | 3 / 12 | DATA-02 Data Quality, DATA-04 Analytical Platform |
| **WFP** Workforce Boundary | 2 / 7 | WFP-05 Payroll Journal, WFP-07 Payroll Payment |
| **SEC** Security | 2 / 11 | SEC-03 Privileged Access, SEC-04 Encryption Policy |
| **GOV** Governance | 1 / 12 | GOV-02 GTRM — residency design exists in `docs/`, no service |
| **COM** Commercial | 1 / 5 | COM-04 Usage Metering |

**Conversely — 10 built services have no doc counterpart** (so the doc specifies no inputs for them
beyond the §4 envelope): benefits-svc, capability-registry-svc, compensation-svc,
compliance-risk-scoring-svc, compliance-status-svc, decision-support-svc, employment-contracts-svc,
offboarding-severance-svc, performance-review-svc, workforce-compliance-svc.

Most are HR services. §9.O deliberately scopes the platform to a *Workforce & Payroll Financial
Boundary* (WFP-01…07) — interfaces to Zoiko HR / Zoiko Payroll rather than an HR system of record.
Either the doc needs a section for them, or they need reframing as WFP interfaces.

**Two services have no business API by design:** search-indexer-svc (probes only; vendored, not
wired) and search-client (library module, not vendored).

### Blocked — not code problems

| Item | Why blocked |
|---|---|
| **Numeric SLOs** (availability / latency / RTO / RPO) | Doc 01 §15.2 and Doc 03 §20.4 require them; doc7 explicitly states it "intentionally does not invent SLA percentages". Needs real measured production capacity and business-criticality sign-off |
| **Merchant / tax / processor / invoice identity** for ZoikoSuite's own billing | Real business/legal setup: merchant-of-record agreement, tax registration, payment processor account |
| **Doc7 §27 acceptance sign-off** — 23 criteria, 8 named function owners (Product, Engineering, Finance, Security, Privacy, Legal, AI/ML, QA) | Process gate. The traceability matrix is built (`doc7-acceptance-checklist-traceability.md`); roughly a third of the 22 engineering-addressable criteria are Done and live-verified. Every function still shows "Pending" in the §35 Controlled Sign-Off Record |
| **Safe-degraded-mode behaviour per service** (Doc 03 §3.10/§22, doc7 §32.2) | Each of ~86 services must define its own DEGRADED response — a behaviour audit, not something one shared table or service can satisfy |
| **Doc7 §32 observability signal families** → OTel/Prometheus | Cross-cutting instrumentation pass across every service |
| **source-a           uthority-svc real precedence data** | Requires knowing every actual connected system's field ownership — operational knowledge that cannot be invented, same doctrine as the merchant/tax item |

---

## 7. Practical first steps

1. **Boot it.**
   ```powershell
   docker compose -f deployments/docker-compose.yml up -d --build
   ./deployments/scripts/seed-demo-registry.ps1
   ./deployments/scripts/seed-demo-rbac.ps1
   ```
   Then `npm run dev` in the frontend. Health-check with
   `curl http://localhost:8000/<service-name>/healthz`.

2. **Trace one request end-to-end** to internalise the doctrine. The cleanest is
   `POST /purchase-order-svc/v1/purchase-orders` — it authorizes fail-closed, versions on amend,
   emits events, and is fully wired in the console.

3. **Read the docs in this order:**
   `01-backend.md` §04 (runtime control flow) → `03-microservices.md` §17 (service-to-service
   interaction rules) → `services/README.md` (what each built service actually does) →
   `input-contract-conformance.md` (the envelope every service enforces).

4. **Pick work from `backend-completion-tracker.md`.** Its working rule is strict and worth
   following:

   > **Exactly one row at a time.** Move it to `In Progress` → implement that row only →
   > `gofmt -w .` → `go build ./...` → `go vet ./...` → `go test ./... -count=1` on every service
   > touched → write a test that specifically proves the fix → commit → mark `Done` with the commit
   > hash and a one-line note on what was verified. Do not start a second row before the current one
   > is Done. Do not batch multiple rows into one commit.

   **The 10 `"default-tenant"` fallback rows are the highest-value unstarted work** — they fabricate
   tenant identity, which silently defeats every isolation guarantee downstream.

### Two operational traps that have already bitten this project

- **`docker compose restart` reuses the existing image.** A restart does not pick up new code — you
  must `docker compose build <svc>` first, or you are testing stale binaries. This class of bug has
  been caught here more than once.
- **pgx's prepared-statement cache survives migrations**, so a schema change can appear not to apply
  until the connection is recycled.

---

*Generated from the ZoikoSuite architecture docs and verified against the codebase.*
