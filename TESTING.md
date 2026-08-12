# Manual test guide — the eight wired services

Every step below is a real request to a real service. Where a step's *expected*
result looks like a failure, that is called out — several of these services are
deliberately fail-closed, and confirming they refuse correctly matters as much as
confirming they succeed.

**How much of this has actually been run.** Sections 1–6 were written from the Go
handlers, stores, and migrations *before* anything was executed, and several of
their expectations turned out to be wrong — see
[Known-stale claims](#known-stale-claims-in-this-document) before trusting a
status code here. Sections 7 (Payables) and 8 (Spend controls) were written
*after* their contract suites and browser click-throughs — 65 and 69 assertions
respectively, plus 36 and 33 in a real browser — so their expectations are
observed rather than inferred.

---

## 0. Setup

**1. Start Docker Desktop.** Then, from the backend repo (`zoiko-suite/zoiko-suite`):

```powershell
docker compose -f deployments/docker-compose.yml up -d `
  authorization-svc `
  governance-svc policy-svc configuration-feature-flag-svc `
  secret-vault-integration-svc purchase-order-svc evidence-requirements-svc `
  purchase-request-svc accounts-payable-svc spend-controls-svc `
  contract-lifecycle-svc obligations-svc
```

**No `gateway`, deliberately.** The console's `.env.local` ships
`ZOIKO_USE_GATEWAY=false`, so it talks to service ports directly. Starting Traefik
drags in its whole `depends_on` chain — eight support containers for a routing
layer. Add `gateway` (with `$env:GATEWAY_PORT = "8000"`) only when you want to
exercise the path prefixes, which is a real failure mode: a wrong prefix gives a
404 indistinguishable from a dead service.

`authorization-svc` is **not** optional. Payables, Commercial Ops and Evidence
check it before every write and all fail closed, so without it those writes are
refused — correctly, but you will spend ten minutes wondering why.

**2. Seed the demo principal's permissions:**

```powershell
# Gateway-less, matching the compose line above:
./deployments/scripts/seed-demo-rbac.ps1 -AuthzUrl http://localhost:8089

# Or, if you started the gateway:
./deployments/scripts/seed-demo-rbac.ps1 -GatewayUrl http://localhost:8000
```

Without this, `authorization-svc` answers `DENIED / no_grant` and every gated
write is refused. The script is idempotent and grants all five services' actions;
it re-probes every action rather than short-circuiting on the first, so re-running
it after it gains a service does add the new grants.

**3. Confirm the services are up** before blaming the console:

```powershell
curl http://localhost:8085/healthz   # policy-svc
curl http://localhost:8099/healthz   # accounts-payable-svc
```

**Check the image dates too.** A container image older than your checkout returns
plausible-looking wrong answers rather than failing, which reads as a code bug:

```powershell
$img = docker inspect accounts-payable-svc --format "{{.Image}}"
docker inspect $img --format "{{.Created}}"
```

**Check that migrations were actually applied.** `deployments/init-db.sh` runs
**only when the Postgres data directory is empty**, so any migration added after
the volume was first created has silently never run. Compare `\di` — indexes, not
just `\dt` — against the migrations directory:

```powershell
docker exec zoiko-postgres psql -U postgres -d accounts_payable -c "\d vendor_invoices"
```

A missing partial unique index makes every idempotent write fail with
`42P10 no unique or exclusion constraint matching the ON CONFLICT specification`,
which surfaces as `store_unavailable` while reads work fine — so it looks like a
write-path code bug.

**4. Start the console:**

```powershell
cd "..\..\zoiko-suite-fe"
npm run dev
```

Sign in at http://localhost:3000/login with the credentials in
[lib/auth.ts](lib/auth.ts).

**Your session identity** — you will need these:

| | |
| --- | --- |
| Principal | `33333333-3333-3333-3333-333333333333` |
| Tenant | `11111111-1111-1111-1111-111111111111` |
| Legal entity | `22222222-2222-2222-2222-222222222222` |

---

## 1. Governance Log — `governance-decision-log-svc` (:8083)

**What it is.** The append-only evidence store behind every governed decision.
No updates, no deletes. Other services write here; this page lets you read and
backfill.

**What it does not do.** It authorizes nothing and applies no tenant filter — a
read returns every tenant's decisions, filtered only by what you ask for. The
page says so at the top.

### Test it

1. Go to **Governance plane → Governance Log**. With a fresh database the log is
   empty and says so.
2. **Record a decision.** Action type `PAYROLL_RELEASE`, outcome `GRANTED`, rule
   basis `SPEND-LIMIT-V1:manual-test`, evaluation context
   `{"amount": 4200, "currency": "GBP"}`.
   → **Expect 201:** green banner, "this row is now immutable", and the JSON of
   the stored record including a generated `decision_id`.
3. **Copy the `decision_id`** and paste it into *Look up a decision*.
   → **Expect:** the full record, with the evaluation context the table truncates.
4. **Look up a made-up id** (`00000000-0000-0000-0000-000000000000`).
   → **Expect amber, not red:** "No decision with that id exists… this is
   genuinely absent rather than out of scope." A 404 here is a fact about the
   store, not a failed request.
5. **Filter.** Type `PAYROLL_RELEASE` into *Action type*, apply.
   → **Expect:** your record, and the filters in the URL so the view is linkable.
6. **Break a filter deliberately.** Put `yesterday` in the *From* field.
   → **Expect:** "The date range was not valid RFC3339." The service answers 400
   rather than silently returning nothing — that distinction is the point.

### Known limit

The replay path (`200`, already recorded) **cannot be triggered from this page**.
`decision_id` is generated server-side, because a human-chosen id would collide
across unrelated decisions and the second one would be silently swallowed. To
exercise replay, post the same id twice by hand:

```powershell
$b = '{"decision_id":"11111111-1111-1111-1111-1111111111ff","tenant_id":"11111111-1111-1111-1111-111111111111","legal_entity_id":"22222222-2222-2222-2222-222222222222","actor_id":"33333333-3333-3333-3333-333333333333","action_type":"TEST","outcome":"GRANTED","rule_basis":"manual","correlation_id":"c1"}'
curl -X POST http://localhost:8000/governance-decision-log-svc/v1/decisions -H "Content-Type: application/json" -d $b   # 201
curl -X POST http://localhost:8000/governance-decision-log-svc/v1/decisions -H "Content-Type: application/json" -d $b   # 200
```

---

## 2. Policies — `policy-svc` (:8085)

**What it is.** Named policies, effective-dated versions, and evaluation of an
amount against whichever version is active. A policy is a container; the rules
live on its versions, and only an `ACTIVE` version has any effect.

**Three limits the page states up front:** only `APPROVAL_THRESHOLD` can be
evaluated; writes are not authorized; and evidence recording is best-effort, so a
successful evaluation does not prove it was logged.

### Test it — the full three-step lifecycle

1. **Create a policy.** Code `SPEND-LIMIT-V1`, name `Purchase approval threshold`,
   type `APPROVAL_THRESHOLD`.
   → **Expect 201.** Copy the `policy_id`.
2. **Submit the identical form again.**
   → **Expect grey, not green:** "already existed with exactly these attributes,
   so nothing was written." This is the idempotent replay.
3. **Now change only the name** and resubmit with the same code.
   → **Expect amber (conflict), not red:** "already exists with a different name
   or type. This is a redefinition, not a retry." Three different outcomes from
   the same form — that separation is the thing being tested.
4. **Read the version history** with that `policy_id`.
   → **Expect amber:** "Policy exists but has no versions… it enforces nothing."
5. **Evaluate `5000`**, type `APPROVAL_THRESHOLD`, scope *This tenant*.
   → **Expect amber (unenforceable):** no `ACTIVE` version applies. Note the
   wording — this is **not** a pass. policy-svc refuses to guess fail-open.
6. **Add a draft version.** Paste the `policy_id`, scope *This tenant*, effective
   from today, payload `{ "threshold_amount": 10000 }`.
   → **Expect 201, status `DRAFT`.** Copy the `policy_version_id`.
7. **Read the version history again.**
   → **Expect:** one row, `DRAFT`, and "0 ACTIVE — nothing here is in force".
8. **Activate the version.** Paste both IDs.
   → **Expect green:** now `ACTIVE`, "attributed to you permanently".
9. **Read the active policy set** (type `APPROVAL_THRESHOLD`, scope *This tenant*).
   → **Expect:** your version, with a **`decides`** badge on the top row. That
   badge matters: the list is ordered most-specific-first and evaluation uses the
   first match only.
10. **Evaluate `5000`.** → **Expect green:** `WITHIN_THRESHOLD`.
11. **Evaluate `15000`.** → **Expect amber:** `APPROVAL_REQUIRED`.
12. **Evaluate exactly `10000`.** → **Expect green:** equal counts as within.
13. **Copy the decision ID** from the evaluation banner, go to the **Governance
    Log**, and look it up.
    → **Expect:** the decision policy-svc wrote as evidence. If it is *missing*,
    that is the best-effort logging failing silently — exactly why the banner
    tells you to check rather than assuming.
14. **Try activating the same version again.**
    → **Expect amber:** "Only a DRAFT version can be activated."

### Test the unenforceable-type trap

15. **Create a policy** with type `SOD_RULE`.
    → **Expect:** 201 *plus* a warning that policy-svc has no evaluation logic for
    it, so it "will be enforced by nothing".
16. **Evaluate** with type `SOD_RULE`.
    → **Expect amber:** the console refuses before calling, explaining the service
    would answer 501. An `ACTIVE` policy of this type is inert — that is the point.

### Test the payload trap

17. **Try adding a version** with payload `{ "limit": 500 }` (no
    `threshold_amount`).
    → **Expect rejection by the console**, explaining that policy-svc *would*
    accept it and then fail at evaluation with a 500. Better a rejected form than
    a version that can never be evaluated.

---

## 3. Settings — `configuration-feature-flag-svc` (:8086)

**What it is.** Versioned, effective-dated feature flags and config values.
Append-only: a change end-dates the old row and inserts a new one.

**The distinction being tested:** `201` means a real transition was recorded;
`200` means the submitted state already matched and nothing was written.

### Test it

1. Go to **Settings → Feature flags**. Create `checkout.new_flow`, environment
   `local`, enabled **on**, rollout `50`.
   → **Expect 201:** "Transition recorded".
2. **Submit exactly the same thing again.**
   → **Expect grey:** "No change… Nothing written." Not an error, and not a
   success — a third state.
3. **Click Disable** on the row. → **Expect 201** (a real transition).
4. **Set rollout to `150`** and submit. → **Expect:** "Rollout percentage must be
   between 0 and 100."
5. **Config entries:** key `payroll.cutoff_hour`, environment `local`, value
   `17` → **201**. Then value `17` again → **200 unchanged**.
6. **Now enter a bare `on`** as a value.
   → **Expect:** "A bare string needs quotes — write `\"on\"` rather than `on`."
   The service stores raw JSON, so this would be a 400 there.

### Test the scope trap — the interesting part

7. In **Resolve one exact scope**, enter `checkout.new_flow local tenant`.
   → **Expect:** found.
8. Now enter `checkout.new_flow local global`.
   → **Expect amber (missing):** "A global default may still exist — this lookup
   does not fall back to it."
9. Compare against the **table above**, which lists the flag anyway.

That contradiction is real and is the thing to understand: on the *list* route an
omitted tenant means "no filter", so it returns everything. On the *single-key*
route it means "the global scope specifically", and matches exactly. Same
parameter, opposite meanings. A service reading a flag gets the second behaviour.

---

## 4. Secret Vault — `secret-vault-integration-svc` (:8087)

**What it is.** A policy-gated broker in front of secret material. It holds
policy, lease, and audit metadata — never a secret value.

**Deny by absence.** No active policy for a path means the broker refuses
outright. A `404` means "no policy"; only a `403` means "policy said no".

### Test it — four steps, and the fourth is the one everyone skips

1. Go to **Governance plane → Secret Vault**.
2. **Request access** to `integrations/stripe/webhook-signing-key` before anything
   exists.
   → **Expect amber (no-policy):** deny-by-absence. Not a denial — nothing was
   configured.
3. **Register the path.** Class `INTEGRATION_TOKEN`, path
   `integrations/stripe/webhook-signing-key`, classification `CONFIDENTIAL`.
   → **Expect 201.** Copy the `secret_policy_id`.
4. **Register the same path** with class `PRIVATE_KEY`. → **Expect 409 conflict:**
   paths are unique.
5. **Create a draft version.** Paste the policy ID, scope *This tenant*, max lease
   `3600`, effective from today, allowed workloads =
   `33333333-3333-3333-3333-333333333333` (your principal).
   → **Expect 201, `DRAFT`.** Copy the version ID.
6. **Request access again.** → **Still amber (no-policy).** The version exists but
   is not active. This is the single most common cause of an unexplained refusal.
7. **Read the version history** with the policy ID.
   → **Expect:** "0 ACTIVE — every version here is a draft or retired, so
   brokering this path is refused by absence."
8. **Activate the version.** → **Expect green.**
9. **Request access again.**
   → **Expect amber (vault-down):** "Policy allowed the request, but no material
   could be fetched." **This is the step everyone misses.** Policy is complete;
   the vault is empty.
10. **Store material.** Paste the policy ID, type any string as the material.
    → **Expect green:** "not readable back through this console."
11. **Request access.** → **Expect green (granted):** lease metadata, expiry, and
    a line saying a token was minted and **deliberately not returned**.
12. **Confirm the token never reaches the browser.** View source or open DevTools
    → Network → the RSC payload for this page. Search for `lease_token`.
    → **Expect: no match.** It is stripped server-side.

### Test denial vs absence

13. **Request access** with *Requesting principal* set to
    `99999999-9999-9999-9999-999999999999`.
    → **Expect red (denied), 403:** "A policy was found and it does not list this
    principal." Compare with step 2's amber — different cause, different fix.
14. **Filter the audit log** by event type `DENIED`.
    → **Expect:** that refusal, recorded as fully as a grant. This is the only
    place a refused request is visible — a denial never becomes a lease.
15. **Filter by `REQUESTED`.** → **Expect** one entry per attempt, including the
    ones that failed. Every attempt is logged before the outcome is known.

### Test lease lifecycle

16. **Copy a lease ID** from the leases table. Paste it into **Read one lease**.
    → **Expect:** full record including `revoked_at: null`.
17. **Revoke it.** → **Expect green**, and check the audit log for a `REVOKED`
    entry.
18. **Revoke the same lease again.** → **Expect amber:** already terminal.
19. **Broker again** to create a fresh lease, then **Rotate** the secret (leave
    *Request ID* blank).
    → **Expect green:** "revoked N live leases". Check the audit log for `ROTATED`.
20. **Rotate again with the same Request ID** you can read from the result.
    → **Expect grey (replayed):** "the zero lease count reflects the replay, not
    an absence of leases." That zero is a trap the page defuses.

### Test the lockdown case

21. **Create a version with the allowed-workloads box empty.**
    → **Expect:** 201 plus "once active this version denies every caller." An
    empty list is legal, and the service accepts it silently.

### Watch for

The leases panel separates **Live** from **Past expiry, still GRANTED**. This
service has no expiry sweep — a lease keeps `status: GRANTED` forever, and only
`expires_at` says otherwise. If you set a short max-lease and wait, you should see
a lease move into the amber column while its status never changes.

---

## 5. Evidence — `evidence-requirements-svc` (:8130)

**What it is.** The gate that decides whether required evidence exists before an
action may complete. A catalog of requirements, and an evaluator.

**The design decision to verify:** three outcomes, not two. `SATISFIED`,
`MISSING`, and `NO_REQUIREMENTS_DEFINED` — the third so an empty catalog cannot
be mistaken for a verified one.

**This is the strictest service here.** Its writes are genuinely
authorization-gated and fail closed.

### Test the three-outcome design first

1. Go to **Governance plane → Evidence**. With a fresh database the catalog is
   empty and warns that *everything* is ungated.
2. **Evaluate** domain `FINANCE`, action `INVOICE_APPROVAL`, no artifacts.
   → **Expect amber:** `NO_REQUIREMENTS_DEFINED` — "Nothing is configured to
   check… this action is currently ungated."
   → **Confirm it is NOT green.** If this ever renders as success, the service's
   central design decision has been undone at the last step.

### Test the catalog

3. **Add a requirement.** Domain `FINANCE`, action `INVOICE_APPROVAL`, scope
   *Tenant-wide*, evidence type `SUPPORTING_DOCUMENT`, minimum count `1`,
   description `A counter-signed vendor agreement`.
   → **Expect 201** *if* you ran the RBAC seed.
   → **If not seeded, expect red 403:** "does not hold the required permission".
4. **Now stop `authorization-svc`** and try adding another:
   ```powershell
   docker compose -f deployments/docker-compose.yml stop authorization-svc
   ```
   → **Expect red, but a different message:** "Could not verify authorization, so
   the write was refused… this is a fail-closed refusal, not a denial." **This is
   the most important assertion in this guide.** A permissions problem and an
   outage must not read the same. Restart the service afterwards.
5. **Evaluate again** with no artifacts.
   → **Expect red:** `MISSING`, with the unmet requirement listed *and its
   reason*. Not a bare boolean.
6. **Evaluate with** `SUPPORTING_DOCUMENT doc-1234`.
   → **If `document-vault-svc` is not running, expect amber (undeterminable), a
   503** — not `MISSING`. The service refuses to answer rather than record a false
   fact in an append-only ledger. This is correct and is worth seeing.
   → **If it is running** and `doc-1234` does not exist, expect `MISSING` with a
   reason naming the failed verification.
7. **Evaluate with** `APPROVAL_RECORD apr-5678`.
   → **Expect:** counted on trust. Only `SUPPORTING_DOCUMENT` is verified; the
   catalog table labels every other type as taken on the caller's word.

### Test retirement

8. **Copy a requirement ID** from the catalog. **Retire it** with reason
   `Superseded by the group control`.
   → **Expect green.**
9. **Retire the same one again.** → **Expect amber:** `422 already_retired` —
   reported, never a silent no-op.
10. **Look at the catalog.** → **Expect:** the retired row still there, dimmed and
    labelled with its retirement date. There is no delete route in this service
    and no soft-delete flag; hiding it would misrepresent what the gate used to
    require.
11. **Copy an evaluation ID** from step 5's banner and look it up.
    → **Expect:** the frozen `unmet_payload` and `present_artifacts_payload` as
    they stood at decision time — even though you have since retired the
    requirement. That immutability is the point.

---

## 6. Commercial Ops — `purchase-order-svc` (:8129)

**What it is.** Procurement orders. `ISSUED → CLOSED`, with an append-only
amendment ledger. Every mutation is authorization-checked **before** it is
applied, and fails closed.

### Test it

1. **Issue an order.** Total `4800`, currency `GBP`, leave the optional IDs blank.
   → **Expect 201.**
2. **Use the status tabs:** All / Issued / Closed.
   → **Expect:** filtering happens at the service, and under a filter the page
   says the totals describe the filtered set rather than the register.
3. **Copy the order's ID** — you will need the browser inspector or the amend
   form's hidden field. Paste it into **Read one order**.
   → **Expect:** the full record, including `purchase_request_id`,
   `vendor_profile_id`, `closed_by_principal_id`, and `correlation_id` — fields the
   table cannot show.
4. **Paste `not-a-uuid`** into the same box.
   → **Expect rejection by the console.** The column is `uuid`; a malformed value
   fails inside the Postgres driver and surfaces as a **503 that reads like an
   outage**, so it is caught first.
5. **Amend the order.** New total `5200`, reason
   `Vendor revised quotation after scope change`.
   → **Expect:** version bumps to v2, status stays `ISSUED`.
6. **Close it.** → **Expect:** terminal, and the row's actions disappear.
7. **Try amending the closed order** (reload first, then use the API directly —
   the UI correctly hides the control):
   → **Expect:** "That transition is not legal… a CLOSED order cannot be amended."
8. **Stop `authorization-svc`** and try to issue another order.
   → **Expect:** "Could not verify authorization, so the action was refused…
   fail-closed refusal, not a denial" — distinct from the 403 you get when the
   RBAC seed is missing. Same assertion as Evidence step 4, different service.

### The gap you cannot test

Amendments are written to an append-only `purchase_order_amendments` table with
the full before/after value, and **purchase-order-svc exposes no endpoint to read
it**. Your reason from step 5 is stored and unreachable. The order's `version`
number is the only visible trace. The page states this — it is a backend gap, not
a console one, and it needs a `GET /v1/purchase-orders/{id}/amendments`.

---

## 7. Payables — `accounts-payable-svc` (:8099)

Lives on **`/admin/finance`**, above the domain-overview panels. Unlike every
section above, this one **has** been run against the live service: a 52-assertion
contract suite plus a browser click-through, both passing. Where a step below
says "expect", that is an observed result, not a reading of the handler.

**What it is.** The liability side of the ledger: vendor invoice intake through
to payment readiness. The lifecycle is strictly linear and **no stage can be
skipped** —

```
RECEIVED ──validate──▶ VALIDATED ──approve──▶ APPROVED ──request-payment──▶ PAYMENT_REQUESTED
```

That sequence *is* the enforcement of the spec's constraint that no payable
reaches payment initiation without approval-state validation: `PAYMENT_REQUESTED`
is reachable only from `APPROVED`, itself only from `VALIDATED`. Each hop is a
**separate authorization grant** (`AP_INVOICE_CREATE`, `AP_INVOICE_VALIDATE`,
`AP_INVOICE_APPROVE`, `AP_PAYMENT_REQUEST`), so holding one does not imply the
next. `PAYMENT_REQUESTED` is terminal here — executing the payment belongs to a
future Treasury service, which consumes the `payment.requested` event.

### Bring it up

```powershell
docker compose -f deployments/docker-compose.yml up -d accounts-payable-svc
```

Its `depends_on` pulls in `postgres`, `kafka`, and `authorization-svc`, all as
`service_healthy` — none are skippable. **Rebuild first if the image predates
your checkout**; a stale binary returns plausible-looking wrong answers rather
than failing:

```powershell
docker compose -f deployments/docker-compose.yml build accounts-payable-svc
docker compose -f deployments/docker-compose.yml up -d --force-recreate accounts-payable-svc
```

### Test the intake form

1. **Record an invoice.** Vendor `VND-DELL-UK`, number `INV-2026-00417`, amount
   `14750.50`, `GBP`, due date about a month out.
   → **Expect 201**, status `RECEIVED`, and **the invoice ID in the banner as a
   copy button**. The ID has to leave this form by hand for the lookup panel, and
   text inside a banner cannot be clicked.
2. **Submit the exact same form again.**
   → **Expect an amber "already on the register" banner**, naming the vendor and
   number. Not green (nothing was written) and not red (nothing is broken).
   `(tenant, vendor, invoice_number)` is unique. This used to answer **503
   `store_unavailable`**, i.e. a re-keyed number read as a dead database.
3. **Same number, different vendor** (`VND-ARUP-ENG`).
   → **Expect 201.** The constraint is per vendor; two vendors both numbering an
   invoice `INV-001` is ordinary.
4. **Amount `0`.** → **Expect 400**, refused by the console before it is sent.

### Test the linear state machine — the interesting part

5. **Look at the register.** Each row shows a stage badge, a **four-segment
   meter** ("2 of 4"), and **exactly one action button** — the only transition
   legal from where that row stands.
   → **Expect:** a `RECEIVED` row offers only *Validate*, an `APPROVED` row only
   *Request payment*, and a `PAYMENT_REQUESTED` row offers nothing but
   "Terminal — handed to Treasury". Three buttons per row would be offering two
   refusals.
6. **Walk one invoice all the way:** Validate → Approve → Request payment.
   → **Expect** each to succeed, the meter to advance, and each banner to name
   the *next* step and that it is a separate grant.
7. **Prove a stage cannot be skipped.** With a `RECEIVED` invoice, call approve
   directly:
   ```powershell
   curl -X POST http://localhost:8099/v1/invoices/<id>/approve `
     -H "X-Principal-Id: 33333333-3333-3333-3333-333333333333" `
     -H "X-Tenant-Id: 11111111-1111-1111-1111-111111111111"
   ```
   → **Expect 422 `invalid_transition`**, not 409. The service moves an invoice
   with one atomic `UPDATE … WHERE status = <expected>`, so there is no read-then-
   write race to exploit.
8. **Request payment twice.** → **Expect 422** on the second: terminal means
   terminal.

### Test the reads and the absence cases

9. **Filter by stage** (chips) **and by vendor and legal entity** (the form).
   → **Expect:** all three applied *by the service*, composing with AND, and the
   tile totals stating they describe the filtered set.
10. **Filter by a partial vendor reference** (`VND-DELL`).
    → **Expect an empty register.** The comparison is `vendor_id = $3` — exact,
    no `LIKE`. A near miss is not a match.
11. **Filter by a malformed legal entity.**
    → **Expect the console to drop it and say so.** The service casts the
    *column* to text rather than the parameter to uuid, so a malformed value does
    not error — it silently matches nothing, and an empty register reads as "this
    entity has no invoices".
12. **Paste an unknown-but-valid UUID** into **Read one invoice**.
    → **Expect "absent"**, not an error.
13. **Paste `not-a-uuid`.** → **Expect the console to refuse it.** The service now
    answers **404** for this (it used to be a **503 that read like an outage**), so
    the check only saves a round trip.
14. **Stop `authorization-svc`** and try to validate an invoice.
    → **Expect** the fail-closed wording — "could not verify authorization, so the
    action was refused" — distinct from the 403 you get with no RBAC seed. Same
    assertion as Evidence step 4 and Commercial Ops step 8, third service.

### Watch for

- **`vendor_id` is validated by nothing.** No Vendor Master service exists
  anywhere in this platform, so a mistyped vendor produces a perfectly valid
  invoice against one that does not exist. There is no `vendor_not_found`. The
  form says so under the field; that is the only guard there is.
- **Overdue counts anything short of `PAYMENT_REQUESTED`** whose due date has
  passed, not just approved rows — an invoice still unvalidated past its due date
  is the more urgent problem.
- **Amounts are never summed across currencies.** Nothing in this suite holds an
  FX rate.

---

## 8. Spend controls — `spend-controls-svc` (:8131)

Lives on **`/admin/commercial-ops`**, above the order flow — a limit governs a
commitment, so the check belongs before it. Like section 7, this was written after
the fact: a 69-assertion contract suite, a 33-assertion browser click-through, and
a 10-way concurrency probe, all passing.

**What it is.** The limit across procurement: what a legal entity may spend on a
category, enforced either **per transaction** or cumulatively over a **calendar
month** or **year** (UTC). A spend check asks whether a proposed amount fits, and
records it when it does.

### Bring it up

```powershell
docker compose -f deployments/docker-compose.yml up -d spend-controls-svc
./deployments/scripts/seed-demo-rbac.ps1 -AuthzUrl http://localhost:8089
```

Deps are postgres + kafka + authorization-svc — the same three as payables, so if
section 7 is running this adds nothing. **The `spend_controls` database may not
exist**: `init-db.sh` only runs on an empty data directory, so on any pre-existing
volume you must create it and apply the migration by hand (gotcha in section 0).

### Test the four readings — the whole point of this service

A spend check answers **200 for all four**, so a status code tells you nothing.
What separates them is the decision body, and the console renders each differently:

| Submit | Reading | Renders |
| --- | --- | --- |
| Amount inside the limit | `ALLOWED` / `within_threshold` | green — recorded, budget consumed |
| Amount over the limit | `BLOCKED` / `threshold_exceeded` | **amber** — a refusal, not a failure |
| A category with **no** limit | `ALLOWED` / `no_policy_configured` | **neutral** — *not* an approval |
| The same correlation id twice | `replayed_prior_decision` | neutral — nothing new recorded |

1. **Set a limit.** Category `PROCUREMENT`, window `Per calendar month`, limit
   `300`, `GBP`. → **Expect** a banner naming the window and the policy ID as a
   copy control.
2. **Check `100`.** → **Expect green**, "taking committed spend to £100.00 of
   £300.00", and the figures panel showing already-committed, projected, and the
   limit.
3. **Check `5000`.** → **Expect amber**, explicitly labelled *"The control worked.
   This is a refusal, not a failure."*, stating £5,100 against a £300 limit, and
   that it **consumed none of the budget**.
4. **Check `100` again.** → **Expect green** — proving step 3 consumed nothing:
   prior is still £100, not £5,100.
5. **Check a category you never configured.** → **Expect neutral**, and the words
   *"Not checked, not approved"*. This is the assertion that matters most on this
   page: the service says ALLOWED, but no control was applied, and showing it green
   would report an ungoverned spend as a governed one that agreed.
6. **Check in `USD` against the `GBP` limit.** → **Expect 422 `currency_mismatch`**,
   rendered as a refusal explaining that nothing in this platform holds an FX rate.
   Nothing is booked against the GBP budget.
7. **Set a second limit on the same category** (`900`). → **Expect an amber
   "supersedes the previous limit"** banner. There is no update route; the newest
   active policy wins and the old row is kept, so what the limit used to be stays
   on record.

### Test the enforcement is atomic

8. Fire ten simultaneous checks of `100` against a `300` limit:
   ```bash
   for i in $(seq 1 10); do curl -s -X POST http://localhost:8131/v1/spend-checks/ \
     -H 'Content-Type: application/json' \
     -H "X-Principal-Id: 33333333-3333-3333-3333-333333333333" \
     -H "X-Tenant-Id: 11111111-1111-1111-1111-111111111111" \
     -d "{\"legal_entity_id\":\"22222222-2222-2222-2222-222222222222\",\"category\":\"RACE\",\"amount\":100,\"currency_code\":\"GBP\",\"correlation_id\":\"race-$i\"}" & done; wait
   ```
   → **Expect exactly 3 ALLOWED and 7 BLOCKED**, and a recorded total of exactly
   300. The sum and the insert happen in one transaction with the policy row
   locked; before that they were separate transactions, so all ten read the same
   prior total, all ten concluded they fit, and the limit could be overspent
   without bound.

### Watch for

- **A refused attempt is recorded**, as a `BLOCKED` row excluded from the running
  total. It used to exist only as a Kafka event, so a refusal left nothing
  queryable — and `decision_outcome` was a column that was always `ALLOWED`.
- **Categories are free text.** There is no category registry anywhere in the
  platform, so a typo silently creates a limit nothing will ever check against.
  The form offers suggestions but does not constrain the field.
- **`PER_TRANSACTION` rows show no meter**, deliberately: each spend is judged
  alone, so a cumulative bar would imply an allowance that fills up.
- **The read routes are authorized even with no filter.** Omitting
  `legal_entity_id` used to skip the authorization check entirely; the tenant is
  now the scope, so `SPEND_POLICY_VIEW` is required either way.

---

## Known-stale claims in this document

Sections 1–6 were written from the Go source before any of it had been run. Most
held up, but these did not, and the surrounding text still asserts the old
behaviour:

| Claim | Actually |
| --- | --- |
| An illegal `purchase-order-svc` transition is 409 | **422 `invalid_transition`** |
| Re-retiring an evidence requirement is 409 | **422 `already_retired`** |
| Re-activating an already-`ACTIVE` policy version conflicts | **200** — the store short-circuits. The 409 fires for re-activating a **SUPERSEDED** version |
| secret-vault leases never expire | They **do** — status is computed on every read, and revoking an expired lease is a genuine 409 |
| Section 0's gateway setup | The console's `.env.local` ships `ZOIKO_USE_GATEWAY=false`, so it talks to service ports directly and the gateway is not needed |

---

## Summary of what to watch for

These are the assertions worth caring about most, because getting them wrong
would be a governance failure rather than a bug:

| # | Assertion | Where |
| --- | --- | --- |
| 1 | `NO_REQUIREMENTS_DEFINED` never renders as success | Evidence step 2 |
| 2 | A fail-closed 503 reads differently from a 403 denial | Evidence step 4, Commercial Ops step 8 |
| 3 | Deny-by-absence (404) reads differently from denial (403) | Secret Vault steps 2 vs 13 |
| 4 | An idempotent replay (200) reads differently from a real write (201) | Policies steps 1–2, Settings steps 1–2 |
| 5 | A 409 conflict reads as a redefinition attempt, not a generic error | Policies step 3 |
| 6 | `lease_token` never appears in the page payload | Secret Vault step 12 |
| 7 | An unevaluable policy type is flagged as inert, not shown as active | Policies steps 15–16 |
| 8 | An expired-but-GRANTED lease is not counted as live | Secret Vault, leases panel |
| 9 | Retired requirements stay visible | Evidence step 10 |
| 10 | A policy evaluation's evidence row is verified, not assumed | Policies step 13 |
| 11 | A payment stage cannot be skipped, and skipping is refused not ignored | Payables step 7 |
| 12 | A duplicate invoice number reads as a duplicate, not as an outage | Payables step 2 |
| 13 | Each row offers only the one transition that is legal from where it stands | Payables step 5 |
| 14 | `no_policy_configured` never renders as an approval — nothing was checked | Spend controls step 5 |
| 15 | A BLOCKED spend reads as a refusal, not a failure, and consumes no budget | Spend controls steps 3–4 |
| 16 | A threshold cannot be overspent by simultaneous checks | Spend controls step 8 |
| 17 | A limit in one currency never judges an amount in another | Spend controls step 6 |

Report back anything where the console's claim and the service's behaviour
disagree — those are the interesting failures.
