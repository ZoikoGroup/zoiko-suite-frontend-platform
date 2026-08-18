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

## 9. Bank reconciliation — `bank-reconciliation-svc` (:8102)

Lives on **`/admin/finance`**, directly below the journal register it reconciles
against. Like sections 7 and 8, this was written after the fact: the backend's
handler and store suites (including the `integration`-tagged cross-tenant tests,
which run against an embedded Postgres with all three migrations applied) are
green, the console compiles, and the steps below assert the behaviours those
suites prove.

**What it is.** The register of what the **bank** says happened, reconciled
against what the **business** says happened (the journal register above). A
match is never taken on faith: the service fetches the named journal from
general-ledger-svc and requires all four of —

- it exists and is **FINALIZED** (a draft has not hit the books),
- it belongs to the **same legal entity** as the line,
- it moves **exactly this line's amount** through this bank account's ledger
  account (compared in exact cents, not within a tolerance), and
- it moves it **in the same direction** — a debit to the cash account is money
  in, a credit is money out.

The direction half is new. Until migration `000003` the check compared
magnitudes, so a 500.00 payment OUT reconciled cleanly against a journal
recording 500.00 IN — the exact error, or concealment, reconciling exists to
surface. That is why `gl_cash_account_code` is **required at ingest**: a line
without one can never be matched (422 `cash_account_unknown`), and it is far
better to refuse the ingest, where the operator still has the statement, than
at match time.

### Bring it up

```powershell
docker compose -f deployments/docker-compose.yml up -d bank-reconciliation-svc
./deployments/scripts/seed-demo-rbac.ps1 -AuthzUrl http://localhost:8089
```

Deps are postgres + kafka + authorization-svc + **general-ledger-svc** (the
match check reads it and fails closed). The `statement_lines` table gains
`gl_cash_account_code` in migration `000003`; on a pre-existing volume apply it
by hand (gotcha in section 0). The RBAC seed now grants `BANKREC_FULL` — the
four write actions separately (`BANKREC_STATEMENT_INGEST`, `BANKREC_MATCH`,
`BANKREC_FLAG_EXCEPTION`, `BANKREC_COMPLETE_STATEMENT`), so holding one does
not imply the others.

### Test the ingest form

1. **Post a journal the line can match.** On the ledger register above: record
   a journal, validate it, post it FINALIZED, with a line *debiting* the cash
   account `1000` for `1250.00` and crediting contra account `4000`. Copy its
   ID — the match form takes it by hand.
2. **Ingest a statement line.** Bank reference `ACH-2026-08-0041`, bank account
   `00000000-0000-0000-0000-000000000000`, amount **`1250.00`**, currency `USD`,
   ledger account `1000`. → **Expect 201**, status `UNMATCHED`, and the line ID
   in the banner as a copy control. The form shows "Money INTO the account" as
   you type.
3. **Submit the exact same form again.** → **Expect an amber replay banner**
   resolving to the ORIGINAL line. The service is idempotent on
   `(tenant_id, correlation_id)`; reporting a retry as a second line would
   double a bank transaction in a register whose whole job is agreeing with the
   bank.
4. **Amount `0`.** → **Expect 400**, refused by the console before it is sent:
   zero has no direction and reconciles against nothing.
5. **Leave `gl_cash_account_code` blank.** → **Expect the console to refuse**,
   naming the account code as required, with the reason stated in the hint.

### Test the direction check — the whole point of this service

6. **Match the line to the journal from step 1.** → **Expect green
   MATCHED**, with the banner stating the journal was verified FINALIZED, same
   legal entity, moving exactly +1,250.00 USD through account `1000` in the
   same direction.
7. **Prove a same-size, wrong-direction journal is refused.** On the ledger:
   post a *second* journal of exactly `1250.00` that **credits** `1000` (money
   OUT). Ingest a matching line with amount **`-1250.00`** and match it to the
   *first* journal (money IN).
   → **Expect 400 `ledger_verification_failed`**, rendered as an amber
   "unverified" banner — not a failure banner. The refusal *is* the service
   working: a journal of precisely the right size that moved the other way is
   the error a reconciliation exists to surface. Nothing was written.
8. **Match against a PENDING or non-existent journal.** → **Expect the same
   400.** The journal must be FINALIZED; a draft has not hit the books.
9. **A line with no cash account cannot be matched at all.** → **Expect the
   row to say so** and to offer no match form (the service would refuse with
   422 anyway). The remedy is re-ingesting the line, not retrying.

### Test exceptions and completion

10. **Flag an unmatched line as an exception** with a reason.
    → **Expect 201, EXCEPTION**, and the row turning rose — a different outcome
    from "not done yet", not a further stage of it. It counts as resolved for
    completion, and can still be matched later.
11. **Complete the statement** via the form at the bottom of the register,
    selecting the (bank account, date) group.
    → **Expect green** "reconciled", with `reconciliation.completed` published
    and **nothing stored** — completion is a derived signal, and there is no
    reopen.
12. **Complete a group that still has an UNMATCHED line.**
    → **Expect 422 `statement_incomplete`**, naming how many lines are still
    unmatched — an exception counts as resolved, an untouched line does not.
13. **Complete a (bank account, date) with no lines at all.** → **Expect 404
    `statement_not_found`** — announcing that a statement nobody ingested has
    been reconciled is worse than saying nothing. The form only offers groups
    present on this page of the register, so this is a direct-API case.
14. **Authorize against one entity, complete another's bank account.**
    → **Expect 403 `legal_entity_mismatch`** — the permission is real; it just
    does not cover that bank account. The service binds the authorization to
    the resource by reading the lines' legal entities, rather than trusting
    that the caller's entity and the account agree.

### Test the reads and the absence cases

15. **Filter by status chip, bank account, and statement date.**
    → **Expect** all three applied *by the service*, composing with AND, and
    the tiles stating they describe the filtered set. The register's reads are
    scoped by the verified `X-Tenant-Id` header alone — a `tenant_id` query
    parameter is no longer read, and the console never sends one.
16. **Read one line via the lookup box.** Paste the ID from step 2.
    → **Expect the full record as JSON**: signed amount, cash account code,
    and every actor and timestamp along the lifecycle. `not-a-uuid` is refused
    by the console; another tenant's line reads as absent.
17. **Send a match without a verified tenant scope** (drop `X-Tenant-Id`).
    → **Expect 401 `tenant_scope_missing`**, not a 404 — failing closed, and
    saying so rather than reassuringly reporting the row absent.

### Watch for

- **A malformed UUID or date answers 400, not 503.** The store maps
  SQLSTATE 22P02/22007/22001 to `invalid_identifier`; a mistyped id used to
  read as a database outage to the caller *and* to anything watching the error
  rate.
- **`currency_code` is recorded, never verified.** general-ledger journals
  carry no currency at all, so a USD line and a EUR journal of the same
  magnitude are indistinguishable to the check. The panel says so out loud.
- **`bank_account_id` is a free UUID.** No bank-account registry exists
  anywhere in the platform; nothing validates the account is real.

---

## 10. Purchase requests — `purchase-request-svc` (:8100)

Lives on **`/admin/purchase-requests`**, its own page in the left rail rather
than a panel on an existing one. The backend service and its suites were green
before the page was written; the steps below assert the behaviours they prove,
and were verified end-to-end in a live smoke run.

**What it is.** A request to spend money before any money moves. A request
starts `PENDING` and is decided by someone who is **not** the requester —
Segregation of Duties applies to both outcomes: a requester may not approve
their own request *or* reject it. The response to a decision echoes who decided
and when (`approved_by_principal_id` / `approved_at`), so a 200 that says
`APPROVED` is never a record-shaped lie about what was written.

### Bring it up

```powershell
docker compose -f deployments/docker-compose.yml up -d purchase-request-svc
./deployments/scripts/seed-demo-rbac.ps1 -AuthzUrl http://localhost:8089
```

Deps are postgres + kafka + authorization-svc. The RBAC seed grants `PR_FULL`
— the three actions separately (`PR_REQUEST_CREATE`, `PR_REQUEST_APPROVE`,
`PR_REQUEST_REJECT`), so holding one does not imply the others. The live smoke
run additionally granted a second principal the two decision actions, because
the demo principal may not decide on requests it itself created — that is the
SoD check working, not a setup omission.

### Test the raise form

1. **Raise a request.** Description `50 laptops for QA`, amount `4800.00`,
   currency `GBP`. → **Expect 201**, status `PENDING`, and the request ID in
   the banner as a copy control.
2. **Submit the exact same form again.** → **Expect an amber replay banner**
   resolving to the ORIGINAL request. The service is idempotent on
   `(tenant_id, correlation_id)`; a retry must not raise a second request.
3. **Submit with a zero amount.** → **Expect 400** at the service, surfaced as
   a validation error, not an outage.

### Test the register

4. **The register shows the request** with `PENDING`, amount, currency,
   requester and timestamps. Filter by status `PENDING` → it stays; filter by
   `APPROVED` → it leaves.
5. **Lookup by ID.** Paste the ID from step 1 → **Expect the full record as
   JSON**, including the requester. `not-a-uuid` is refused by the console;
   another tenant's request reads as absent (deny-by-absence, not denial).

### Test decisions

6. **Approve it as a second principal** (any principal holding
   `PR_REQUEST_APPROVE`; the smoke run used `55555555-…`). → **Expect 200**,
   status `APPROVED`, and `approved_by_principal_id` echoing that principal.
7. **Approve it again.** → **Expect 422** `invalid_transition` — a decision
   already made is terminal, not re-litigable.
8. **Reject a fresh request without a reason.** → **Expect 400**. A rejection
   with no reason would be a governance hole.
9. **Reject it with a reason.** → **Expect 200**, status `REJECTED`, and the
   reason echoed back in the response.
10. **Approve your own request.** → **Expect 403** `self_approval_not_allowed`,
    and the request still `PENDING`. This is the SoD check from the doctrine
    (`A-12.3` in the original spec), enforced in the handler before the store
    is ever touched.

### Watch for

- **A malformed UUID answers 404, not 503.** Malformed ids are deliberately
  indistinguishable from absent ones — a mistyped id must never read as a
  database outage to the caller *or* to anything watching the error rate.
- **Reads are scoped by the `tenant_id` query param, not the header.** Listing
  without it is a 400 (`missing_field`); writes without a verified tenant
  scope are a 401. The page always sends both.
- **Cross-tenant transitions are refused.** Deciding on another tenant's
  request reads as 404/403 — the row is not yours to see as `PENDING`.

---

## 15. Notifications - `notification-svc` (:8133)

**What it is.** Governed delivery of notifications for workflows, deadlines,
escalations, approvals, and status changes. Idempotent on
`(tenant_id, correlation_id)`: a retry replays the original delivery outcome
instead of sending a second time.

**The distinction being tested:** a notification can be recorded but NOT
delivered, and the service reports that as a normal 201 with `status: FAILED`
rather than an error. Its own critical constraint (03-microservices.md §9.7) is
that notification failure must never collapse the source workflow — a caller
that failed to notify someone sees a normal success so it does not treat its
own, otherwise-successful operation as failed too.

**The stub is the whole story.** No email/SMS/webhook provider is wired up. The
delivery adapter logs and always succeeds. SENT therefore means "recorded,
stub-delivered" — not "actually received". FAILED is currently **unreachable**,
and that is the honest state: with no provider behind it, nothing can refuse a
delivery. An unrecognised channel is a 400 at the request boundary, not a FAILED
record — see the failure path below for why that changed.

### Test it

1. Go to **Notifications** in the sidebar. Fill recipient, channel **EMAIL**,
   subject, body. Send.
   → **Expect success banner:** "recorded and stub-delivered". The row appears
   in the delivery register as SENT. This is the real 201 path.
2. **Send again with the same correlation** — the console generates a fresh
   correlation per submission, so from the UI a repeat send is a new
   notification; the 200-replay path is exercised by the API smoke, not the UI.
3. **Resolve one notification** — click its id; the register renders it.
4. **Read the register.** The console sends the session's `legal_entity_id`, and
   the service authorizes `NOTIFICATION_VIEW` against it — a principal without
   that grant gets 403, not an empty list.
5. **Read it WITHOUT a legal entity** (API only):
   `GET /v1/notifications/` with just a principal and tenant.
   → **Expect only notifications addressed to that principal.** An unscoped read
   is your own inbox, not the tenant's. Ask for
   `recipient_principal_id=<someone else>` without a legal entity and
   → **expect 403.** This used to be the hole: authorization ran only when
   `legal_entity_id` was supplied, so omitting it — the easier request —
   returned every notification in the tenant, subjects and bodies included, to a
   principal holding no grant at all.
6. **Send with no `X-Tenant-Id`.** → **Expect 401**, not 503. A forgotten header
   used to reach the store and come back as `store_unavailable`, sending whoever
   is on call to look at Postgres.

### The failure path — the interesting part

7. Send with channel **PIGEON** (not in the supported set).
   → **Expect 400 `unsupported_channel`** and **no row in the register.**
   It used to answer 201 with a stored FAILED record and a
   `notification.failed` event on the bus — a permanent record that a delivery
   was attempted and refused by a provider, for a channel no provider ever saw.
   A caller's typo is a caller's typo; only a real delivery attempt can fail.
   (The dev database still holds one such row from before the fix, and migration
   000002 deliberately preserves it: see its comment on `NOT VALID`.)

### Watch for

- **FAILED is a finding, not a cosmetic state.** It is recorded proof the
  notice did not go out, and it now means only that — a provider refused it.
- **SENT must never be read as delivered.** No provider exists; the stub
  adapter accepted the record. The page copy says so rather than implying a
  real-world delivery.
- **A 200 replay is not a second send.** The service answers 200 with the
  stored notification for a seen correlation_id; nothing is sent twice.
- **The register is paged.** 100 rows by default, 500 max; `limit=abc` or
  `offset=-1` answers 400 rather than silently defaulting.

---

## 16. Board Resolutions - `board-resolutions-svc` (:8122)

**What it is.** Board meetings and their resolutions: schedule a meeting,
propose a resolution (always PROPOSED), tally votes, then pass it into force.
Every write is authorized against the legal entity (MEETING_CREATE /
RESOLUTION_CREATE / RESOLUTION_VOTE / RESOLUTION_PASS) and refuses a request
without a principal; the pass additionally enforces segregation of duties (the
proposer may not pass their own resolution) and verifies evidence sufficiency
against evidence-requirements-svc, failing closed.

**The distinction being tested:** voting only tallies — it never finalizes
status. A resolution stays PROPOSED until the separate closing action (pass)
finalizes it, and only a *different* principal can perform that closing action.

### Test it

1. Go to **Legal & Contracts** → the **Board Governance & Resolutions** card.
   Schedule a meeting (title, datetime, location, effective-from).
   → **Expect success banner** and the meeting row appearing as SCHEDULED.
2. **Propose a resolution** (optional meeting link, category, number, content,
   effective-from). → **Expect success banner**; the resolution row appears
   PROPOSED. The service ignores any caller-supplied status — you cannot create
   a resolution that is already passed.
3. **Tally votes** on the row (for / against / abstentions).
   → **Expect** "Tally recorded: N for, M against…" and the row's vote counts
   updating — still PROPOSED.
4. **Pass it from the same session that proposed it.**
   → **Expect the SoD refusal banner up front:** "the principal who proposed a
   resolution may not pass it". The console refuses before the service is
   called, and the service would enforce it again anyway. This is the
   segregation-of-duties doctrine (§12.3 of the original spec).
5. **Pass with a different principal** (another grant holder, as the smoke
   script's passer) → **Expect 200**, status PASSED, `passed_by` and `passed_at`
   recorded. The evidence gate (evidence-requirements-svc) must be satisfied
   before finalizing — currently `NO_REQUIREMENTS_DEFINED`, so the pass
   succeeds; a defined unmet requirement would answer 422 `required evidence is
   missing`.
6. **Vote or pass again after finalizing.** → **Expect 409** `resolution is
   already finalized` — a second closing action is refused, not ignored. This
   now includes a REJECTED resolution: the closing action's finalized check
   listed only PASSED and RESCINDED, so a resolution the board had rejected
   could still be passed into force afterwards.
7. **Fetch the register with no principal.** → **Expect 401.** An unidentified
   caller is refused before any row is considered.
8. **Fetch it with no `X-Tenant-Id`.** → **Expect 401.** The middleware used to
   substitute the literal tenant `"default"`, so every caller who forgot the
   header shared one bucket — reading and writing each other's board minutes,
   with row-level security dutifully isolating a tenant that identified nobody.
9. **Send `created_by` or `passed_by` naming anyone but yourself** (API only).
   → **Expect 400.** Both used to be taken verbatim from the request body, and
   `created_by` is exactly what the SoD check compares against the passing
   principal — so a drafter could file a resolution under someone else's name
   and then pass their own work, with the two strings no longer matching. The
   console sends its own principal, so this is invisible from the UI.

### Watch for

- **A pass is the only closing action.** Voting returns 200 with the tally and
  leaves the status PROPOSED; only `POST /{id}/pass` finalizes. A reader who
  sees a 9-1 tally and a PROPOSED badge is seeing the correct, unfinished
  state.
- **SoD is enforced on the pass, not the vote.** The vote handler never checks
  the creator; the pass handler does, because it is the distinct closing action
  that changes status — and the store re-checks it against the locked row,
  because the handler's own check runs against a read that is stale by the time
  the write happens.
- **The evidence gate fails closed.** If evidence-requirements-svc is
  unreachable the pass is refused (503), not risked; that refusal reads
  differently from an authorization denial (403). The client now allows only
  `SATISFIED` and `NO_REQUIREMENTS_DEFINED` — it used to refuse only the literal
  string `MISSING` and allow everything else, so an outcome it did not recognise
  (or an absent field) let the pass through with the gate unchecked.
- **Attribution is taken from the header, never the body.** `created_by` and
  `passed_by` on a stored record are the authenticated principal.
- **Both registers are paged** (100 default, 500 max) and report their own
  `limit`/`offset`. `total` is the size of the page, not a count of the
  register.

---

## 17. Event Schemas - `schema-registry-svc` (:8093)

**What it is.** The canonical registry of event payload contracts. Every event
on the platform is meant to be registered here; each version declares the
compatibility discipline it was accepted under; nothing is ever edited or
deleted — evolution only appends.

**The distinction being tested:** a 409 from this service is two completely
different facts. Either the proposed schema breaks the current contract (the
body carries `violations` naming each field that broke), or a concurrent
registration claimed the version while yours was being checked. The reader's
next step differs entirely — change the schema, or re-read and resubmit — so
the console must never report one as the other.

### Test it

1. Go to **Event Schemas** in the sidebar. The **Contract register** lists every
   event and its current version. → **Expect rows, not "Schema registry
   unavailable".** Reaching this state proves the read carried an identified
   caller: every read is 401 without one now.
2. **Register a first version.** Event name `your.probe.event`, a schema with a
   `properties` map and a `required` list, owning service, mode BACKWARD.
   → **Expect a success banner** naming the event and `v1`. The version number
   is assigned by the registry, never by the caller.
3. **Register a compatible evolution** — same event, add an *optional* field.
   → **Expect v2.** Adding an optional field is always safe.
4. **Register a breaking change** — same event, remove a required field.
   → **Expect an amber banner listing the violations**, each naming the field:
   `field "tenant_id" was required and has been removed`. Amber, not red: the
   checker refusing a breaking change is the control working.
   → **It must NOT say "Another registration claimed this version".** That is
   the race message, and reporting a breaking change as a race told the reader
   to retry something that would fail identically forever. It happened because
   the shared API client folded the error body into one string and dropped
   `violations` — see `ApiError.body`.
5. **Register the same breaking change under NONE.** → **Expect success**, and
   the register shows that version badged NONE. The exemption is recorded on the
   row, so a contract that evolved without a check is visible rather than
   inferred from a schema that mysteriously changed shape.
6. **Try an invalid event name** (`NotAValidName`, `nodots`).
   → **Expect a refusal explaining the convention.** The service enforces this
   now, not only the console: the name is the register's primary key, and it
   used to accept any non-empty string.

### The API-only checks

7. `POST` with `json_schema: 123` (or `"a string"`, `null`, `[]`, `{}`).
   → **Expect 400.** All are well-formed JSON and used to be stored as event
   contracts. A first version stored as `123` could never be evolved: every
   later version fails to parse the baseline and answers 400 forever, so the
   registry accepted a value that permanently bricked the contract it recorded.
8. `POST` with **no `X-Legal-Entity-Id`**. → **Expect 201.** An event contract
   belongs to the platform, not a legal entity, so the service authorizes
   against `AUTHZ_PLATFORM_SCOPE_ID`. Passing the empty header through got a 400
   from authorization-svc, which surfaced as 503 "authorization service
   unavailable" — infrastructure blamed for a scope the request never had.
9. `GET` any route with **no `X-Principal-Id`**. → **Expect 401.** Every read
   used to be open, so anything that could reach the port could enumerate the
   whole catalogue: every event name, every payload field, and its owner.
10. `GET /v1/schemas?limit=abc` (or `limit=0`, `limit=99999`, `offset=-1`).
    → **Expect 400.** Both lists were unbounded and their paging unvalidated.
11. `GET /v1/schemas/{event}/versions?offset=50` past the end.
    → **Expect 200 and `[]`**, not 404 — an empty page is not a deleted contract.

### Watch for

- **A grant that exists only on one machine is not a feature.** `SCHEMA_PUBLISH`
  was never in `seed-demo-rbac.ps1`; the console's register form worked on the
  development machine because a hand-made bundle had been left in that database.
  On a fresh volume every registration was 403. It is a seeded bundle now, and
  the seed's "is there anything to do" probe checks the platform scope too —
  it only looked at the legal entity, so a platform-scoped action added later
  was never granted and the run still reported success.
- **`init-db.sh` applied only migration 000001.** On a volume initialised from
  that script the `compatibility_mode` column did not exist, and every read and
  write of this service failed — it worked locally only because the migration
  had been applied by hand. Same shape as the grant above.
- **Registration is not enforcement.** Nothing validates a published event
  against its registered schema at runtime.
- **The compatibility check is top-level and latest-only.** It reads
  `properties` and `required` and does not descend into nested objects, and it
  compares against the current version only — not every version ever published.

---

## 18. Jurisdictions & Rules - `jurisdiction-rules-svc` (:8082)

**What it is.** The register every other service defers to for "which law
applies here". Jurisdictions nest (country → state → tax authority), their
applicability rules are effective-dated, and a rule pack resolves both into the
answer for one jurisdiction at one point in time.

**Why it had no page until now.** It was wired into the console only as the
read-only picker inside the obligations register — obligations-svc validates
`jurisdiction_id` against it and fails closed, so the picker is what stops a
free-text UUID field from 404ing on everything a human types. Everything else
this service owns was reachable only by curl.

**The distinction being tested:** legal drift is a separate axis from rule
status. A rule can be ACTIVE and DRIFTED at the same time — still in force, and
known to have diverged from the law it encodes. Neither field can be read as
the other.

### Test it

1. Go to **Jurisdictions & Rules** in the sidebar. → **Expect the register**,
   with codes (GB, US-CA) and a *Nested in* column showing a parent's code
   rather than a UUID. A UUID here would hide the relationship the page exists
   to show.
2. **Register a jurisdiction** — code, name, type, authority, effective-from.
   → **Expect a green banner.** This is the write that was 403 for everyone
   until `JURISDICTION_FULL` was added to the seed: no bundle granted
   JURISDICTION_CREATE, so the entire admin surface of this service was dead.
3. **Submit that identical form again.** → **Expect a NEUTRAL banner**, not
   green: "already registered with exactly these attributes, so nothing was
   written". The registry answered 200. Colouring a replay as a fresh success
   would tell you that you had just created something that already existed.
4. **Register a second jurisdiction nested inside the first** (pick the first in
   *Nested in*). Then **record a rule on each with the same rule code**, both
   ACTIVE, the child's with a later effective-from.
5. **Resolve a rule pack** for the child. → **Expect exactly one rule for that
   code — the child's** — and a *Resolved from* chain reading child → parent.
   That is the whole point of the endpoint: the most specific jurisdiction wins,
   and the chain is what lets a governed decision explain its basis later.
6. **Resolve the same pack with an as-at date before the child's rule began.**
   → **Expect the parent's rule to win instead.** "The rules" is always "the
   rules at a date"; a register that only answered for today could not explain a
   decision taken last year.
7. **Record a rule as DRAFT**, then resolve the pack again. → **Expect it absent.**
   A DRAFT rule is registered and does not resolve until transitioned to ACTIVE.
8. **Record drift** on an ACTIVE rule with a reason.
   → **Expect the rule to show DRIFTED and remain ACTIVE.** It keeps resolving
   into packs. Then **Drift history** → the append-only transitions with their
   reasons. The console requires a reason even though the service accepts a null
   one: a drift entry without its evidence records that a rule diverged and not
   what diverged.
9. **Transition a rule to SUPERSEDED with an end date.** → **Expect it end-dated.**
   A SUPERSEDED rule left with a NULL `effective_to` keeps matching every
   point-in-time query beside its own replacement, so the pack would resolve two
   winners for one code.

### The API-only checks

10. `POST /v1/admin/jurisdictions` with **no `X-Principal-Id`** → **401**; with a
    principal holding no grant → **403**. Both fail closed and write nothing.
11. `GET /v1/jurisdictions` with **no credential at all** → **200**. That is
    deliberate, not a gap: jurisdictions are PUBLIC-classified reference data
    (data_classification_audit.md §2.11). Only the mutations are gated.
12. Register with a `parent_jurisdiction_id` that does not exist → **404**, not a
    silently rooted jurisdiction.
13. Register with `effective_to` before `effective_from` → **400**.

### Watch for

- **Deactivation is consequential, not cosmetic.** It clears active_flag and
  end-dates the row — nothing is deleted, and the row stays visible in the
  register. But `GET /v1/jurisdictions/{id}` is an active-only lookup and
  answers **404** afterwards, deliberately, so every service validating against
  this register fails closed on it — **including for records already bound to
  it**. The list and the lookup disagree on purpose.
- **Applicability, never amounts.** A rule payload says who a rule applies to,
  how often they file, and which authority. Thresholds and rates belong to the
  Tax and Payroll services; a figure here would be a second copy of a number
  this register does not own. The console refuses a payload that is not a JSON
  object for the same reason.
- **Drift is asserted, not detected.** Nothing watches legislation. CURRENT
  means nobody has said otherwise — not that anything has been checked.
- **The grant is on the PLATFORM scope.** A 403 here does not mean the principal
  lacks a permission on your legal entity; jurisdictions have none. It means the
  JURISDICTION_* grant is missing on `AUTHZ_PLATFORM_SCOPE_ID`.

---

## 19. Delegated Authority - `delegated-authority-svc` (:8136)

`/admin/delegations`. The register of who may act for whom: one principal hands
another a single action, on a single legal entity, between two timestamps.

**Read this before testing.** Until 18 Aug this service had a general-purpose
privilege escalation reachable through its documented happy path, and most of
the steps below exist to demonstrate that it is closed.

### The escalation, and why it was invisible

CreateDelegation ran two authorization checks. It confirmed the CALLER held
DELEGATION_CREATE, then confirmed the DELEGATOR held the action being delegated
-- the platform's stated invariant, "delegated authority must never exceed the
delegator's own authority". It never asked whether the caller had any
relationship to the delegator. `delegator_principal_id` was a field in the body,
and it was believed.

So anyone with DELEGATION_CREATE could name a colleague as delegator, name
themselves as delegate, and take that colleague's authority. Both checks pass.
The invariant nobody had written down is that **you may only give away authority
that is yours**.

### Test it

1. **Open /admin/delegations.** The register shows either the whole legal
   entity's delegations (with DELEGATION_VIEW) or only the ones you are party
   to. The line above the table says which — those answer different questions
   and the page should never blur them.
2. **Grant one with yourself as delegator.** Leave "Delegator" prefilled, set a
   delegate and an action (PO_ISSUE works with the demo grants). → **Expect a
   green banner and a new ACTIVE row.**
3. **Submit the identical form again** (same idempotency key, shown under the
   button). → **Expect a NEUTRAL banner, not green:** the service answered 200
   and wrote nothing. Reporting a replay as a new grant would tell you you had
   just handed out authority that was handed out days ago.
4. **THE ESCALATION.** Set "Delegator" to any other principal id and the
   delegate to your OWN principal id. → **Expect an amber refusal.** The console
   refuses this one before the round trip because it can see the shape. By API:
   `POST /v1/delegations/` with `delegator_principal_id` set to someone else and
   `delegate_principal_id` set to you → **403 `self_dealing`**. Before the fix
   this was **201, and the delegation was written**.
5. **On behalf of someone else, to a third party.** Delegator = another
   principal, delegate = a third. → **Expect 403 `delegator_mismatch`.** This is
   legitimate for a delegation administrator and needs DELEGATION_ADMINISTER on
   the entity, which the demo bundle deliberately does NOT grant — seeding it
   would restore the escalation for the demo principal.
6. **Delegate something you do not hold.** Action type `NUCLEAR_LAUNCH`.
   → **Expect 403 `delegator_lacks_authority`.** A delegation cannot manufacture
   authority that did not exist.
7. **Read without a legal entity** (API only): `GET /v1/delegations/` with just
   a principal and tenant. → **Expect only delegations you are party to.** Then
   ask for someone else's — `?delegate_principal_id=<another>` with no
   `legal_entity_id` → **expect 403.** This was the second hole: authorization
   ran only when `legal_entity_id` was supplied, so omitting it returned the
   tenant's entire map of who may act for whom to a principal with no grant.
8. **Misspell the status filter:** `?status=ACTIVEE`. → **Expect 400
   `unknown_status`**, not an empty list. On this register an empty list reads
   as "nobody holds any delegated authority" — the most reassuring possible
   answer, and a false one.
9. **Revoke an ACTIVE row, then revoke it again.** → **200, then 409.** REVOKED
   and EXPIRED are both terminal; nothing here is ever deleted.
10. **Send no `X-Tenant-Id`.** → **Expect 401**, not 503. A forgotten header used
    to reach the store and come back as `store_unavailable`.

### What to watch for

- **Expiry is observed, not scheduled.** No background job sweeps this table. A
  delegation past its window flips to EXPIRED when the register is next read,
  and `authority.expired` is published at that moment. A grant nobody looks at
  stays ACTIVE in the row until someone does.
- **Nothing consumes these grants yet.** authorization-svc does not read this
  register; identity-context-svc has a URL for it and an invalidation reason,
  but no call site. A delegation today is a governed RECORD that someone may act
  for another, not the mechanism that lets them. That is exactly why the
  escalation was worth closing now — before something starts honouring these
  rows and turns a forged record into real authority retroactively.
- **The service had never run on this machine.** Its database did not exist:
  `init-db.sh` runs only on an empty Postgres volume, and `delegated_authority`
  was added to the script after this volume was created. If it crash-loops with
  `database "delegated_authority" does not exist`, create it and apply both
  migrations by hand.

---

## 20. Document Vault - `document-vault-svc` (:8094)

`/admin/documents`. The store of record for governed documents: append-only
version lineage, a SHA-256 recomputed on every read, and an append-only log of
every access.

**Read this before testing.** Until 18 Aug this service had NO authorization on
any route — including the one that returns document bytes — and its tenant
filter switched itself off when the header was absent. A request with no headers
at all could download any document belonging to any tenant.

### Test it

1. **Open /admin/documents.** The register lists documents filed against your
   legal entity. There was no list endpoint before this pass: six routes, every
   one needing a document_id you already had, which is why this page did not
   exist.
2. **File a document.** Pick a file, set a title, choose RESTRICTED. → **Expect
   a green banner and a new row at v1.** The checksum is computed on write.
3. **Read it back** (API): `GET /v1/documents/{id}` then
   `GET /v1/documents/{id}/access-log`. → **Expect a METADATA row and, after a
   content fetch, a DOWNLOAD row** — both attributed to your principal.
4. **THE OPEN VAULT.** With a principal holding no DOCUMENT_* grant, try each of:
   create, list, read metadata, `GET /{id}/content`, `GET /{id}/access-log`,
   `POST /{id}/versions`. → **Expect 403 on all six.** Every one of them
   answered 200 before this pass.
5. **Download needs its own grant.** DOCUMENT_READ does not imply
   DOCUMENT_DOWNLOAD. A principal with READ can list and open metadata and still
   be refused the bytes — that is deliberate, and it mirrors the METADATA vs
   DOWNLOAD split the access log has always recorded.
6. **The access log needs a third grant.** DOCUMENT_ACCESS_LOG_READ. Being able
   to read a document does not entitle you to the record of who else has.
7. **Send no `X-Tenant-Id`** (API): `GET /v1/documents/{id}` with only a
   principal. → **Expect 401.** It used to return the document — the store's
   predicate read `($2::uuid IS NULL OR tenant_id = $2)`, and a NULL tenant made
   that TRUE for every row in the table.
8. **Cross-tenant reads:** fetch a known document id with another tenant's
   header. → **Expect 404** on metadata, content, versions and access-log alike.
9. **Forge the actor:** send `X-Actor-Principal-ID: someone-else` alongside your
   real `X-Principal-Id` and download something. → **Expect the access log to
   name YOU.** That header used to WIN, so a caller could attribute their own
   download to a colleague.
10. **File with a body naming another tenant** (`tenant_id` in the JSON).
    → **Expect 400 `tenant_mismatch`**, not a document filed elsewhere.
11. **Add a version, then fetch `?version=1`.** → **Expect the ORIGINAL bytes.**
    Versions are append-only; a new one never rewrites its predecessor.

### What to watch for

- **There is no quiet read.** Opening metadata appends a METADATA row; fetching
  content appends a DOWNLOAD row. A refused read appends nothing — a 403 is not
  an access.
- **A register read is NOT logged.** `GET /v1/documents` returns metadata for
  many documents and records nothing. Left open deliberately: one row per
  document per list call would make the log unusable, and a "LIST" access type
  is a schema decision. So the log is a complete account of downloads and
  single-document reads, and an incomplete account of metadata disclosure.
- **Retention is a label, not an engine.** `retention_policy` is a string this
  service stores. Nothing schedules a purge from it and nothing blocks one —
  there is no delete route at all. A document marked for a seven-year hold is
  not held by anything here.
- **Integrity failure is the alarm.** A checksum mismatch is 409 and the content
  is withheld. That is the one outcome on this page worth stopping for; it
  should be investigated, not retried.

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
| 18 | A same-size, wrong-direction journal is refused, and reads as a refusal not a failure | Bank reconciliation step 7 |
| 19 | A line without a ledger account can never be matched — refused at ingest, not discovered later | Bank reconciliation steps 5 and 9 |
| 20 | An exception counts as resolved for completion; an untouched line does not | Bank reconciliation steps 11–12 |
| 21 | An empty statement is a 404, not a success — nothing ingested, nothing reconciled | Bank reconciliation step 13 |
| 22 | Authorization is bound to the bank account's actual legal entity, not the caller's claim | Bank reconciliation step 14 |
| 23 | A requester cannot decide on their own request — SoD on both approve and reject | Purchase requests steps 6 and 10 |
| 24 | A decision is terminal: a second decision on the same request is 422, not a fresh outcome | Purchase requests step 7 |
| 25 | A rejection without a reason is refused at the door | Purchase requests step 8 |
| 26 | A decision's response echoes who decided and when — no record-shaped lies | Purchase requests step 6 |
| 27 | An idempotent replay resolves to the original request, never a duplicate | Purchase requests step 2 |
| 28 | A pass is the only closing action — votes tally, they never finalize | Board resolutions steps 3–4 |
| 29 | The proposer cannot pass their own resolution — SoD on the pass, not the vote | Board resolutions step 4 |
| 30 | An unidentified caller is refused on reads too — 401, not 200 | Board resolutions step 7 |

Report back anything where the console's claim and the service's behaviour
disagree — those are the interesting failures.
