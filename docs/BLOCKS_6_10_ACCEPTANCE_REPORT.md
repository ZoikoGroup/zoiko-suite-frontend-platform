# Blocks 6–10 acceptance report (37 services), 2026-11-04

**Result: 0 of 37 services are COMPLETE** against the seven acceptance criteria of
`zoiko-suite-backend/docs/audit_files/zoikosuite-end-to-end-domain-service-audit-2026-10-27.md`.

Here, COMPLETE means all seven applicable criteria pass. **Production readiness fails for every service**, for these reasons:
- The backend code under test is unmerged.
- No production environment exists to verify.
- Live runs use an authorization stub that grants every request, so real deny paths are unproven.

Everything that could be verified on the local verification stack was verified. The results are below, with the evidence for each.

## What was tested

| Item | Value |
|---|---|
| Backend under test | `fix/blocks-6-10-final` @ `23402ba0` (PR #246, closed, **not merged**). All routes the console now calls also exist on backend `origin/main`. |
| Runtime | `zv-*` Docker stack (compose project `zverify`), built from that commit. Reached through its gateway: `ZOIKO_USE_GATEWAY=true`, `ZOIKO_GATEWAY_URL=http://127.0.0.1:18180`. |
| Second local stack | 38 containers from an older copy of this repo's compose file, on the default 81xx ports. With the default config, `npm run dev` targets **that** stack, not `zv-`. |
| Frontend | branch `fix/blocks-8-10-frontend` (this PR). |
| Test data | Every write ran on the `zv-` stack only, under freshly generated test tenants and legal entities. No production data was touched. |
| Authorization | `zv-policy-stub` grants every decision. 403s seen live come from service logic (segregation of duties, tenant scope), not from real policies. |

## Results by criterion

Legend:
- **P**: pass.
- **~**: partial.
- **F**: fail (a confirmed defect).
- **NV**: not verified.
- **B**: blocked on an external provider or a decision.

The criteria are:
1. **Container**: healthy on `zv-`.
2. **API**: live routes behave as specified.
3. **DB**: persistence, read-back, migrations, RLS and tenant isolation.
4. **Security**: authN, authZ on reads and writes, actor integrity, negative tests, audit events.
5. **Frontend**: the console reads and acts against the live service.
6. **Workflow**: a business workflow runs live.
7. **Prod**: production readiness.

| # | Service | 1 | 2 | 3 | 4 | 5 | 6 | 7 | Main gaps |
|---|---|---|---|---|---|---|---|---|---|
| 6.1 | contract-lifecycle | P | P | P | F | ~ | P | F | actor fields from body; no outbox |
| 6.2 | clause-template | P | P | P | ~ | ~ | P | F | `created_by` from body; no outbox |
| 6.3 | obligation-tracking | P | P | P | F | ~ | P | F | body actors; no SoD on waive/validate; no outbox |
| 6.4 | board-resolutions | P | P | P | ~ | ~ | P | F | no outbox |
| 6.5 | corporate-actions | P | P | P | F | ~ | P | F | `executed_by` from body; no outbox |
| 6.6 | counterparty-management | P | P | ~ | ~ | ~ | P | F | 5 CRM reads without authz; duplicate migration `000002` |
| 6.7 | purchase-request | P | P | ~ | ~ | ~ | P | F | `X-Source-Channel: system` read bypass; GUC bypass policies |
| 6.8 | purchase-order | P | P | ~ | F | ~ | P | F | 9 reads without authz; `idempotency_keys` without RLS |
| 6.9 | spend-controls | P | P | P | ~ | ~ | P | F | no outbox |
| 6.10 | vendor-due-diligence | P | P | P | ~ | ~ | P | F | counterparty propagation best-effort; no outbox |
| 6.11 | procurement-workflow | P | P | P | ~ | ~ | P | F | no outbox |
| 7.1 | tax-rules | P | P | P | ~ | ~ | P | F | no outbox |
| 7.2 | tax-determination | P | ~ | P | F | ~ | NV | F | reads without authz; `evaluated_by` from body; suite blocked by unseeded jurisdiction |
| 7.3 | vat-gst | P | P | P | F | ~ | P | F | reads without authz; `filed_by` from body |
| 7.4 | corporate-tax | P | P | P | F | ~ | P | F | 4 reads without authz; no SoD submit→assess |
| 7.5 | withholding-tax | P | P | P | F | ~ | P | F | reads without authz; `remitted_by` from body |
| 7.6 | filing-preparation | P | P | P | F | ~ | P | F | reads without authz; no SoD validate→finalize |
| 7.7 | filing-tracker | P | P | P | F | ~ | P | F | reads without authz; actors from body |
| 7.8 | compliance-status | P | P | P | F | ~ | P | F | reads without authz; `created_by` from body |
| 7.9 | exception-escalation | P | P | P | F | ~ | P | F | 14 reads without authz; `closed_by`/`escalated_by` from body |
| 8.1 | anomaly-detection | P | P | P | ~ | ~ | P | F | no anomaly record rendered in the console yet |
| 8.2 | forecasting | P | P | P | ~ | P | P | F | Idempotency-Key enforced only by envelope |
| 8.3 | compliance-risk-scoring | P | P | P | F | P | P | F | no authz on reads |
| 8.4 | reconciliation-intelligence | P | P | ~ | ~ | P | P | F | duplicate migration `000007`; contract change needs owner sign-off |
| 8.5 | reporting-orchestration | P | P | P | F | P | ~ | F | 9 reads without authz; runs `NOT_IMPLEMENTED` |
| 8.6 | decision-support | P | P | P | ~ | P | P | F | — beyond the shared items |
| 8.7 | migration-integrity | P | P | P | ~ | P | ~ | F | outbox check not run (harness) |
| 9.1 | mtls-management | P | P | P | ~ | P | P | F | no audit events (no outbox) |
| 9.2 | siem-integration | P | P | P | F | ~ | ~ | B | `/stream` without authz; no external delivery; no outbox |
| 9.3 | carta | P | P | P | F | P | P | B | `/evaluate` accepts no principal (live: 201); no outbox |
| 9.4 | key-management | P | P | P | ~ | P | ~ | B | metadata only, no cryptography; no outbox |
| 10.1 | connectivity-api-bridge | P | P | P | F | P | ~ | B | bridge/connection reads without authz; no real connector |
| 10.2 | banking-connector | P | P | P | F | P | B | B | reads without principal/authz; no bank adapter |
| 10.3 | hris-connector | P | P | P | F | P | B | B | reads without authz; sync 503 (no adapter); no outbox |
| 10.4 | tax-authority-interface | P | P | P | F | ~ | B | B | some reads without authz; adapter off by default |
| 10.5 | esignature-integration | P | ~ | P | F | ~ | B | B | send 503 (no adapter); envelope reads without authz |
| 10.6 | external-data-feed | P | P | P | F | P | ~ | B | all reads without authz; no provider; no outbox |

**Frontend column for Blocks 6–7.** All 20 services pass live reads through the console clients. It is still "~" because:
- console write flows for these blocks were not re-run end to end in this pass;
- `ComplianceActionHeader` and `LegalActionHeader` show hardcoded ports with always-green dots, and the Compliance ports are wrong.

**Security column.** No service is P, because real authorization policies are not exercised (stub). Services marked "~" have no confirmed defect beyond that.

## Evidence

| Run | Result |
|---|---|
| Deep suite `e2e_legal` (6 services) | **229/229** |
| Deep suite `e2e_procurement` (5 services) | **134/134** |
| Deep suite `e2e_tax` (9 services) | **260/268**. All 8 failures are in tax-determination: the suite's test jurisdiction is not seeded in jurisdiction-rules-svc, so they are environment failures, not code. |
| Deep suites `e2e_intel` | reconciliation 93/93, reporting 154/154, migration 78/81 (3 outbox DB checks target a stale container ID). Anomaly, forecasting, risk and decision have no deep suite. |
| New Blocks 8–10 workflow suite (14 services) | **90/92**. 1 real defect: carta evaluate without principal → 201. 1 check was too strict: banking deliberately echoes the unmasked account in the create response (`handler.go:76-82`); reads mask it. |
| Console E2E (browser, gateway mode) | 13/13 seeded records render. Another tenant sees none. No session → 401. Forged cookie → 401. |
| Console actions | KMS rotate persists, and returns 404 for another tenant. CARTA evaluate uses the session's legal entity. HRIS sync shows 503 `provider_not_configured`. Write without a session → 401. |
| Frontend checks | `tsc` 0 errors. ESLint 0 errors (95 warnings, none new). `node --test` 71/71. HTTP proxy tests 9/9. `next build` OK. `docker build` OK. |
| vitest | 66/67. **1 failure not related to this work**: the AssistantWidget "first 120 words" test conflicts with `ANSWER_WORDS = 500` from `df425bc`. It is a spec conflict for the assistant owner and will fail CI's `npm test`. |
| Backend static audit (37 services) | `go vet` and `go test` with no DB pass in all 17 Block 8–10 services. Per-service findings are in the table above. |

## Fixed in this PR (frontend)

1. **Blocks 8–10 clients.** The Intelligence, Security and Integration clients called `/api/v1/...` paths no service serves, and they sent the tenant as a query parameter. They now call the services' `/v1` routes with identity headers and the required `legal_entity_id`.
2. **Missing `X-Purpose-Context` on writes.** Without it, key-management and hris-connector refused every write. Found live.
3. **Silent failures in the proxy.** It turned every Blocks 8–10 failure into `200 []`. It now returns the service's status.
4. **Hardcoded tenant fallback.** The proxy substituted `11111111-…` in every Blocks 8–10 handler. Removed.
5. **Fabricated CARTA data.** The CARTA panel showed sample assessments when the real list was empty or failed, and showed an invented decision when an evaluation failed. Removed.
6. **Invented summary figures.** Summary bars showed stand-in figures (12/8/24, "6 Active", "Sync latency < 2 mins", "All signed"). A failed read now shows "Unavailable".
7. **False capability claims.** Timelines and labels claimed "Zero-Trust Verified", HSM envelope encryption, real-time Bloomberg feeds and DocuSign workflows. They now describe what each service actually does.
8. **Tax sample-data fallback.** It was on by default and answered any tax read failure with fabricated rules, returns and "HEALTHY" HMRC/IRS interfaces for a demo tenant. Removed (audit §4, Critical).
9. **Wrong ports.** Hardcoded wrong ports in the Blocks 8–10 panels, headers and timelines are removed.

## Open: needs a backend owner or an external dependency

1. **Reads without an authorization check:** 10 Block 6–7 services and 10 Block 8–10 services (table above).
2. **Actor fields taken from the request body** in 11 Block 6–7 services.
3. **No outbox** in 18 of the 20 Block 6–7 services, in all of Block 9, and in hris, esignature and external-data-feed. Events are published straight to Kafka and lost on failure.
4. **carta `/evaluate`** needs a principal and an authz check (decision B3).
5. **Provider adapters** for bank, HRIS, HMRC, DocuSign/Adobe, market data and SIEM, and a real KMS. They need credentials and sandboxes.
6. **Real authorization policies** must be seeded and the deny paths tested against authorization-svc.
7. **Migration hygiene:** duplicate migration numbers (reconciliation `000007`, counterparty `000002`), and purchase-order `idempotency_keys` has no RLS.
8. **Merge and release:** backend PR #246 must be reopened and merged, and a production environment must exist to verify.

## Reproduce

```
# console against the zv stack
ZOIKO_USE_GATEWAY=true ZOIKO_GATEWAY_URL=http://127.0.0.1:18180 npm run build && npm start
# contract tests including backend route checks
ZOIKO_BACKEND_DIR=<path to backend at fix/blocks-6-10-final> npm test
```

The live harness scripts are local only, under `node_modules/.cache/live37/`: `seed810.mjs`, `e2e810.mjs`, `actions810.mjs`, `workflow810.mjs`. The deep suites are in `E:/zoiko-e2e`, run through `E:/zaudit/e2e_zverify*.py`. None of these are part of the repo.

---

## Addendum, 2026-11-05: frontend pass

The frontend criterion was re-audited for all 37 services, and every confirmed defect below was fixed in this branch.

### Fixed

**Security**
- `/api/backend/dispatch`, `/api/backend/ping` and `/api/admin/service-inputs/dispatch` needed no session. They accepted any local port and sent the demo tenant/principal/entity, or whatever identity the browser supplied. Now they require a session, use only its identity, and allow only registered service ports (`lib/dev-dispatch.ts`).
- Migration integrity: the server actions took tenant/principal from the browser and fell back to a demo identity, and a "QA suite" wrote as fixed tenants. Both are removed; the actions use the session only.
- An expired or tampered session looped between `/login` and `/admin` (`ERR_TOO_MANY_REDIRECTS`). The login and root pages now verify the session, and the proxy clears an invalid cookie.

**Broken writes (each confirmed live as a 400 before the fix)**
- Legal clause, corporate-action and counterparty writes omitted the envelope headers (`envelope_incomplete`). They now go through `apiPost`/`apiPut`.
- Vendor due diligence was missing `X-Purpose-Context`.
- Tax determination: the TAX-03 inputs are now sent, including the buyer registration for B2B. `evaluated_by` comes from the session.
- Filing preparation now validates before it finalizes, and sends `validated_by`/`finalized_by`.
- Tax-authority register now sends the service's real fields. The non-existent `/test` route is replaced by `GET /health`.
- Migration validate sends `exception_owner_id` and `control_totals`; remediate sends a reason and an evidence reference.
- Contract create through `/api/v1/contracts` used to spread a snake_case body into a camelCase input.

**Wrong reads**
- Corporate tax and withholding read the wrong list keys, so both were always empty.
- The tax-authority mapper invented the endpoint, health, active flag and a UK jurisdiction.
- Obligation, purchase-order and filing-draft status enums are aligned with the services.
- Template `name` is corrected to `title`.
- Exceptions were read with no identity (always 401).

**Fabricated or hidden data, removed**
- Summary bars no longer show 0 for a failed read.
- Process timelines no longer show fallback counts (142, 28…), sample records, fixed statuses or wrong ports.
- Removed: hardcoded port strips and "All nominal"; `alert()`-only buttons; CARTA evaluations of random subjects; the fake-success tax actions (`app/admin/tax/actions.ts`, unused); prefilled demo values (entity, VAT registration, signatory, amounts); the static `/admin/integrations` page (now a redirect).
- Every Block 6–7 proxy read and panel now reports any failed read, not only "unreachable". Proxy writes no longer default amount, currency, category, period or effective date.

### Evidence (2026-11-05)

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `eslint` | 0 errors, 89 warnings (95 before) |
| vitest | 67/67 (with the uncommitted `ANSWER_WORDS = 120` change in the working tree) |
| `node --test` with `ZOIKO_BACKEND_DIR` and `ZOIKO_HTTP_TESTS=1` | 93/93, including the new `tests/blocks-6-10-frontend.test.mjs` |
| `next build` | OK |
| Live Playwright, `npm run test:e2e:blocks` against the zv gateway, fresh tenant | 54/54. 31 console-API workflows and 23 browser journeys. One journey (contract draft from the header) ends on the fail-closed refusal because the zv stack has no authorization-svc behind its gateway. |
| Existing assistant Playwright suite | 45/53. All 8 failures are on `/assistant`, which this change does not touch. |

### Still open for the frontend
- No UI yet for many backend lifecycle routes:
  - Block 6: clause review/approve/activate, obligation transitions, corporate-action execute, counterparty maintenance, PO draft/approve/hold/cancel, PR amend/convert.
  - Block 7: corporate-tax and withholding create/submit/assess/remit, exception resolve/escalate, filing submit/confirm.
  - Blocks 8–10: forecast generate, report runs, recommendation accept/reject, reconciliation apply, mTLS issue/revoke, SIEM exporter create, KMS register/disable, bridge/bank/HRIS/feed create.
- Permission gating: only the contract actions pre-check authorization-svc. Elsewhere buttons are not hidden by role; the services' 403s are shown instead.
- List pagination is not followed; first page only.
- Service Inputs (`/admin/service-inputs`) still posts sample payloads to `/api/v1/...` paths on service ports, which the services do not serve. Its dispatch route is secured, but the page needs rebuilding against the real contracts.
