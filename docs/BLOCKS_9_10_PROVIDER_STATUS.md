# Blocks 9–10 provider services: status, 2026-11-24

All 8 services work inside ZoikoSuite: the console reads their records, creates them and runs their actions after create, and tenant isolation holds. **None of them is connected to its outside provider.** Each one records what it is given, and calls only other ZoikoSuite services.

Each service's page now says so beside its records.

## Results

| Service | Outside provider | Console (reads, creates, actions, inputs) | Live tests | Tenant isolation | Provider connected |
|---|---|---|---|---|---|
| tax-authority-interface-svc | Tax authority (HMRC or another) | Pass | 3 dedicated, all pass | Pass | No: the adapter is off by default and no HMRC connector exists. Submissions stay PENDING. |
| siem-integration-svc | SIEM destination (Splunk, Sentinel, Datadog, syslog) | Pass | 4 dedicated, all pass | Pass | No: no delivery client. The stored status `DELIVERED` means "recorded"; nothing is sent. |
| carta-svc | Service identity (mutual TLS) | Pass | 5 dedicated, all pass | Pass | No: no mutual-TLS listener, so calling services are not identified by certificate. |
| key-management-svc | Key vault / KMS | Pass | 5 dedicated, all pass | Pass | No: keys are registered, rotated and disabled in the service's own registry. A key ARN is recorded, not checked. |
| banking-connector-svc | Bank / open banking | Pass | 3 dedicated, all pass | Pass | No: connections and statements come from what is submitted. Nothing is fetched from a bank. |
| hris-connector-svc | HRIS (Workday, SuccessFactors, ADP) | Pass | 4 dedicated, all pass | Pass | No: no adapter. On the tested backend a sync is refused with 503. On backend main it is saved as COMPLETED with 1 record (see below). |
| esignature-integration-svc | DocuSign, Adobe Sign | Pass | 3 dedicated, all pass | Pass | No: no adapter. On the tested backend, sending an envelope is refused with 503. |
| external-data-feed-svc | Market data | Pass | 3 dedicated, all pass | Pass | No: data is pushed in; the service calls no provider. |

- **Console checks:** 40 of 40 pass (100%).
- **With the provider check included:** 40 of 48 (83%).
- **Providers connected:** 0 of 8.

## What was tested

| Item | Value |
|---|---|
| Console | branch `vasu-deva` at `78a036b` (Next.js 16.4.6) |
| Backend under test | the zv Docker stack, built from `fix/blocks-6-10-final` (`23402ba0`) plus `fix/blocks-6-10-post-create-actions` |
| Backend main | `d1abbdf5`, read from source |
| Data | a fresh test tenant and legal entity per run, on the zv stack only |

| Check | Result |
|---|---|
| Full live suite | 116/116 passed, 15.0 min |
| Provider notes on the live pages | 3/3 pages: `/admin/tax`, `/admin/security`, `/admin/integration` |
| Provider guard (`tests/provider-status.test.mjs`) | 5/5, against both the tested backend and backend main |
| Node + HTTP tests | 257/257 |
| Vitest | 196/196 |
| tsc / lint | 0 errors (83 lint warnings, unchanged) |
| Build | OK, 59 pages |

The dedicated tests are those whose title names the service. Shared tests also cover all 8:
- every read answers 200;
- calls without a session, or with a forged one, get 401;
- records created in one tenant are invisible to another;
- the pages render with no browser errors.

## How the provider status is kept true

The status text lives in `lib/provider-status.ts`. `tests/provider-status.test.mjs` reads the backend source of both backends and checks two things:
- **Outbound calls:** each service makes outbound HTTP calls only from its ZoikoSuite clients (authorization, envelope, mTLS, vault, treasury, tokenization, SIEM, health check).
- **Tax-authority adapter:** it is off unless `AUTHORITY_ADAPTER_ENABLED=true`, and no HMRC code exists.

If a provider client is added, that test fails. The new client should then be verified against the real provider, and the status text updated, in the same change.

## Differences on backend main

These were found in backend main's source (`d1abbdf5`). The tested backend does not have them.

- **hris-connector-svc saves every sync as COMPLETED with 1 record** without calling any HRIS. The fix is on local backend branch `fix/blocks-6-10-provider-fail-closed` (`21b8cc21`), not pushed.
- **siem-integration-svc and carta-svc keep their records in memory only**, so they are lost on restart.
- **Some actions are missing on main:** SIEM pause, resume and disable, and CARTA re-evaluate.

The tested backend branch is no longer on GitHub; it exists only in `E:\zwork\backend-final`.

## What it takes to connect each provider

| Service | Needs |
|---|---|
| tax-authority-interface-svc | An HMRC profile; OAuth2 authorisation-code flow; Gov-Client fraud-prevention headers; an approved connector and vault credentials; then `AUTHORITY_ADAPTER_ENABLED=true` |
| siem-integration-svc | A delivery client (Splunk HEC, syslog or webhook) with retry, and a destination with credentials |
| carta-svc | A mutual-TLS listener using certificates from mtls-management-svc. The CA is internal, so no outside credential is needed |
| key-management-svc | A KMS client (AWS KMS, Azure Key Vault or GCP KMS) and cloud credentials |
| banking-connector-svc | An open-banking (AIS) client, or statement file import (CAMT.053, MT940), and bank credentials |
| hris-connector-svc | A Workday, SuccessFactors or ADP adapter and tenant credentials |
| esignature-integration-svc | A DocuSign or Adobe Sign client, a webhook receiver and an account |
| external-data-feed-svc | A provider client or poller. A public feed such as ECB FX rates needs no credential |

## Reproduce

```sh
npm run build
ZOIKO_LIVE_E2E=1 ZOIKO_E2E_GATEWAY=http://127.0.0.1:18180 npx playwright test -c playwright.blocks.config.ts
ZOIKO_HTTP_TESTS=1 ZOIKO_BACKEND_DIR=<blocks-6-10 backend> ZOIKO_BACKEND_MAIN_DIR=<backend main> npm test
```
