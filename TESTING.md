# Manual test guide — the six wired services

Every step below is a real request to a real service. Where a step's *expected*
result looks like a failure, that is called out — several of these services are
deliberately fail-closed, and confirming they refuse correctly matters as much as
confirming they succeed.

Nothing here has been run against a live backend. It was derived from the Go
handlers, stores, and migrations. Treat the expectations as what the code says
should happen, and tell me where reality differs.

---

## 0. Setup

**1. Start Docker Desktop.** Then, from the backend repo (`zoiko-suite/zoiko-suite`):

```powershell
$env:GATEWAY_PORT = "8000"
docker compose -f deployments/docker-compose.yml up -d `
  gateway authorization-svc `
  governance-svc policy-svc configuration-feature-flag-svc `
  secret-vault-integration-svc purchase-order-svc evidence-requirements-svc `
  contract-lifecycle-svc obligations-svc
```

`authorization-svc` is **not** optional. Commercial Ops and Evidence check it
before every write and both fail closed, so without it those writes are refused —
correctly, but you will spend ten minutes wondering why.

**2. Seed the demo principal's permissions:**

```powershell
./deployments/scripts/seed-demo-rbac.ps1
```

Without this, `authorization-svc` answers `DENIED / no_grant` and every gated
write is refused. The script is idempotent.

**3. Confirm the gateway is routing** before blaming the console:

```powershell
curl http://localhost:8000/policy-svc/healthz
curl http://localhost:8000/evidence-requirements-svc/healthz
```

A Traefik 404 here looks exactly like a service being down. If you get one, the
prefix is wrong, not the service.

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

Report back anything where the console's claim and the service's behaviour
disagree — those are the interesting failures.
