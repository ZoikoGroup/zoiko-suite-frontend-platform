# evidence-requirements-svc — the theory, and the five things the console does with it

**Service:** `evidence-requirements-svc` · port `8130` · console page `/admin/evidence`
**Backend:** `zoiko-suite-backend/services/evidence-requirements-svc`
**Console:** `app/admin/evidence/`, `components/admin/evidence/`, `lib/api/evidence.ts`

This document explains *why* the service is shaped the way it is, then walks each of the five
sections on the Evidence Requirements page: what the feature is, what it sends, what every input
means, and what the answer actually tells you.

---

## Part 1 — The theory

### The one question it answers

> **"Is the paperwork this action needs actually on file — and if not, what is missing?"**

The second half is the whole reason the service exists. Any workflow engine can hold a checkbox
saying "docs attached". What this service adds is a *defensible refusal*: not "blocked" but
"blocked because two counter-signed agreements were required and one was supplied, under this
exact requirement, checked at this moment, for this person". Every design choice below follows
from that.

The doctrinal line it enforces is from `03-microservices.md §8.6`: **no finalization path may
skip required evidence states.** This service is the thing that makes that sentence true.

### Two halves: a catalog, and a gate

| | Holds | Who calls it |
|---|---|---|
| **The catalog** | effective-dated rules: for action X, evidence of kind Y must exist | administrators, via this page |
| **The gate** | takes an asserted list of evidence and answers against the catalog | a real business process, at the moment it tries to finalize something |

The catalog is keyed on **`(domain_code, action_type)`** — a business area and an action within
it, e.g. `FINANCE` / `INVOICE_APPROVAL`. Both are **free-form strings in the service**. Nothing
in the Go code enumerates a permitted set of domains, actions, or even evidence kinds. That is
deliberate and doctrinal: adding a new gated action must be an `INSERT`, never a code change.
The dropdowns in the console are the *console's own* narrowing, not the service's.

### Three outcomes, not two — the central decision

This is the design choice that makes the service worth trusting.

| Outcome | Means | The action |
|---|---|---|
| `SATISFIED` | every requirement in force was matched | may proceed |
| `MISSING` | at least one was not matched | **must be blocked**, and the answer says what to produce |
| `NO_REQUIREMENTS_DEFINED` | the catalog holds nothing for this action | **is not being gated at all** |

An empty catalog is a legitimate data state. If it were reported as `SATISFIED`, then *"nobody has
configured this yet"* would be indistinguishable from *"checked and verified complete"* — and
every ungated action in the platform would silently read as approved. The third outcome exists so
a caller cannot make that mistake, and the console never collapses it into a green tick.

The code comment naming the defect this avoids points at `tax-determination-svc`'s synthetic
`ZERO-TAX` fallback as the shape to not repeat.

### Requirements accumulate; they do not override

This is the sharpest contrast with `policy-svc`, and getting it backwards is the most likely
misreading of the whole service.

`policy-svc` resolves **one** winning version — narrowest scope wins, everything else is a
fallback. `evidence-requirements-svc` does the opposite:

```sql
WHERE tenant_id = $1 AND domain_code = $2 AND action_type = $3
  AND (legal_entity_id IS NULL OR legal_entity_id::text = $4)
```

Every requirement scoped to the company **plus** every tenant-wide one comes back, and **all of
them must be met**. A tenant-wide rule is not a default that a company-specific rule replaces —
it is an additional, independent obligation.

Consequence: adding a tenant-wide requirement tightens the gate for every company at once, and
cannot be relaxed for one company by adding a narrower rule. It can only be withdrawn.

### Effective dating is enforced here — unlike policy-svc

`policy-svc` records `effective_from` / `effective_to` and **never filters on them** (its dates
only order results). This service does filter:

```sql
AND effective_from <= $5 AND (effective_to IS NULL OR effective_to > $5)
```

So on this page, dates mean what they say:

* A requirement dated in the future gates nothing until then.
* A withdrawn one gates nothing after its end date.
* `effective_to` is **exclusive** — at the instant of the end date, the requirement is already off.
* You **can** legitimately pre-stage a change here by dating it forward (via the API; the console
  form does not expose the date — see Part 5).

### Withdrawal is a date, not a delete

There is **no `DELETE` route and no soft-delete flag anywhere in this service.** Retiring a
requirement sets `effective_to`, and the row stays fully readable.

This is what keeps a past decision explicable. A determination made in March was made against
what the catalog said in March; if that row were deleted, the recorded outcome would become
unjustifiable. Doing it twice is a **422**, never a silent no-op — the `UPDATE` carries its own
`WHERE effective_to IS NULL` guard, so the original withdrawal date and reason stand.

### What "evidence" actually means here — and the limit worth knowing

The gate does not go and find evidence. The **caller asserts** a list of artifacts, and the
service checks that list against the catalog. Only one kind of assertion is verified:

| Evidence kind | Verified? | How |
|---|---|---|
| `SUPPORTING_DOCUMENT` | **Yes** | looked up in `document-vault-svc`; must exist **and** belong to the same tenant *and* legal entity |
| everything else | **No** | counted exactly as asserted |

So a requirement for a signature is satisfied by someone *claiming* a signature exists. That is a
real limit of the gate, recorded in `context.md §10`: `document-vault-svc` owns document
lifecycle, and no spec section says which statuses count as valid evidence, so asserting one here
would be scope invention. The console says "recorded as stated — the platform does not look this
up" wherever it applies, rather than letting a green tick imply more checking than happened.

> Verification is currently **broken** for the one kind that is supposed to be verified. See
> Part 4.

### It refuses to guess

Four independent fail-closed paths, each choosing "no answer" over "a wrong answer":

| Situation | What happens | Why |
|---|---|---|
| `authorization-svc` unreachable | catalog write **refused** | cannot confirm permission ⇒ do not proceed |
| `document-vault-svc` unreachable | evaluation returns **503, no determination** | recording `MISSING` off an outage would write a false fact into a permanent ledger |
| `requirement_payload` unreadable | that requirement is reported **unmet** | a malformed rule must block the action, not vanish from the gate |
| no tenant / no principal | **refused** | never defaulted to a placeholder |

The document-vault case is the one worth dwelling on. The obvious shortcut — treat an
unverifiable document as absent — produces a `MISSING` row in an append-only evidence table that
is *not true*, and which will be read years later as a finding against whoever was blocked.
Returning no answer is worse operationally and better evidentially, and the service chooses
evidentially.

### Every catalog change is authorized, scoped to its breadth

| Action | Permission | Checked against |
|---|---|---|
| add a requirement | `EVIDENCE_REQUIREMENT_CREATE` | the **legal entity** if entity-scoped, otherwise the **tenant** |
| withdraw one | `EVIDENCE_REQUIREMENT_RETIRE` | same rule, read off the existing row |

A tenant-wide requirement gates every company, so it authorizes against the tenant itself — the
broadest scope, and therefore the correct one for a rule of that reach. Decisions are cached
briefly, short enough that a revocation takes effect quickly.

Note the asymmetry on **evaluate**: it requires an identified principal but performs **no
authorization check**. The determination is recorded *against* that principal, so an
unidentified caller cannot produce a meaningful evidence record — but asking "what does this
action require" is not itself a privileged act.

### The canonical envelope

Enforced by `internal/envelope`, mode `ZS_ENVELOPE_ENFORCEMENT` (default write-strict). Universal
across services: `X-Tenant-Id`, `X-Principal-Id`, `X-Request-Id`, `X-Correlation-ID`,
`X-Source-Channel`, plus `Idempotency-Key` on material writes. This service adds:

| Field | Policy |
|---|---|
| `X-Legal-Entity-Id` | **required on write** (INV-02) |
| `X-Purpose-Context` | not required |
| `X-Book-Id` | not required — posts to no accounting book |

A refusal names every missing field, so an incomplete envelope is diagnosable rather than
mysterious. Reads log a warning but are not blocked.

### Its own decisions are evidence

Every determination is written to `evidence_evaluations` — **append-only**, never updated — with
the unmet list and the asserted-artifact list **frozen as they stood at that moment**. That is
what lets an old check still explain itself after the catalog has moved on, and it is why a
replay is honest rather than helpful (below).

Two Kafka events are published on `zoiko.evidence-requirements.events`:

| Outcome | Event |
|---|---|
| `SATISFIED` | `evidence.requirement.satisfied` |
| `MISSING` | `evidence.requirement.missing` — carries the `unmet` detail, so a consumer learns *what* is missing |
| `NO_REQUIREMENTS_DEFINED` | **nothing published** — neither event is true of it. Logged at warn instead, because a permanently unconfigured gate is an operational problem |

### Replay returns the original answer, not a fresh one

`(tenant_id, correlation_id)` is a **real unique index** on both tables, not a convention. Re-send
the same correlation id and you get the stored determination back unchanged — even if the catalog
has since changed and a fresh check would now say something different.

That is deliberate: the recorded decision must not be rewritten because the rules moved. A replay
disagreeing with a fresh evaluation is not a bug to reconcile; it is the audit trail working.

---

## Part 2 — Data model and endpoints

### Tables

**`evidence_requirements`** — the catalog.

| Column | Note |
|---|---|
| `evidence_requirement_id` | PK |
| `tenant_id` | required |
| `legal_entity_id` | **nullable, and NULL is meaningful** — applies tenant-wide |
| `domain_code`, `action_type` | the gate key, free-form `VARCHAR(64)` |
| `evidence_type` | what kind of evidence, free-form |
| `requirement_payload` | `jsonb` — the sufficiency parameters |
| `effective_from` / `effective_to` | `effective_to IS NULL` means in force; setting it is withdrawal |
| `created_at`, `created_by_principal_id`, `correlation_id` | audit + idempotency |
| `retired_by_principal_id`, `retired_reason` | written on withdrawal |

**`evidence_evaluations`** — the append-only decision ledger: outcome, `unmet_payload`,
`present_artifacts_payload`, `evaluated_at`, `evaluated_for_principal_id`, `correlation_id`.

**Indexes that carry meaning:**

* `(tenant_id, domain_code, action_type, effective_from, effective_to)` — the evaluator's hot path.
* `UNIQUE (tenant_id, correlation_id)` on both tables — real, DB-enforced idempotency.
* `UNIQUE (tenant_id, COALESCE(legal_entity_id, '000…0'), domain_code, action_type, evidence_type,
  effective_from)` — the natural key. The `COALESCE` is load-bearing: Postgres treats NULLs as
  distinct, so listing `legal_entity_id` raw would allow unlimited duplicate tenant-wide rows.

**RLS** is enabled and `FORCE`d, and the policy collapses unset and empty scope to NULL so an
unscoped query matches nothing rather than erroring. But it is **defense-in-depth only** — the
services connect as a superuser, which bypasses row security entirely. The control that actually
isolates tenants is the explicit `tenant_id = $n` predicate on every statement, over a tenant read
from the verified header and nowhere else.

### `requirement_payload` — the shape that decides sufficiency

Every field optional. An empty payload means *"one artifact of this kind must be present"*.

| Field | Effect |
|---|---|
| `minimum_count` | how many matching artifacts are needed. Absent or `≤ 0` is treated as **1** |
| `artifact_subtype` | when set, a matching artifact must **also** declare this exact subtype |
| `description` | free text, surfaced in the unmet reason — the note a blocked person reads |

### The matching rule, exactly

For each requirement in force, count the asserted artifacts where **all** hold:

1. `evidence_type` matches exactly;
2. if the requirement names an `artifact_subtype`, the artifact's matches it **exactly** (plain
   string compare — case-sensitive, no normalisation);
3. the artifact **counts** — i.e. it is not a document that failed verification.

If `count >= minimum` the requirement is met. Any requirement not met makes the whole outcome
`MISSING`, and each unmet one is reported **individually with its own reason** — a bare boolean
is not explainable evidence.

**One artifact can satisfy several requirements.** Counting runs per requirement, independently,
with no consumption — so a single supplied approval record satisfies two identical requirements
at once.

### The five evidence kinds the console offers

Free-form in the service; this list is the console's own.

| Code | Reads as | Verified |
|---|---|---|
| `SUPPORTING_DOCUMENT` | Supporting document | **yes** |
| `SIGNATURE` | Signature | no |
| `APPROVAL_RECORD` | Approval record | no |
| `RECONCILIATION_PROOF` | Reconciliation proof | no |
| `THIRD_PARTY_CONFIRMATION` | Third-party confirmation | no |

An unrecognised code is humanised for display and reported as **not** verified — never as
verified, because guessing permissively about evidence is the one mistake that matters.

### Endpoints the console uses

```
GET  /v1/evidence-requirements/                       the catalog
GET  /v1/evidence-requirements/{id}                   one requirement
POST /v1/evidence/evaluate                            the gate
GET  /v1/evidence/evaluations/{id}                    one past determination
POST /v1/admin/evidence-requirements/                 add            (authorized)
POST /v1/admin/evidence-requirements/{id}/end-date    withdraw       (authorized)
```

Plus `/healthz`, `/readyz`, `/metrics`. Note the console uses **every** route this service has —
what it does not surface is a handful of *parameters* (Part 5).

---

## Part 3 — The five sections

The page is **one reader, one decision endpoint, two readers-by-reference, and two writes**:

```
Add a requirement      →  the gate now demands something more.
Withdraw a requirement →  it stops demanding it, from a date.
                                  │
Requirement catalog   ←───────────┤  what is demanded, and what used to be
Check an action       ←───────────┤  put the gate to work on a real case
Look up a past check  ←───────────┘  what a check said at the time, frozen
```

Only **Check an action** is what a real business process would call. The other four exist so that
its answer can be configured, and afterwards defended.

---

### 1. Requirement catalog

**What it is:** a read — the whole catalog for your organisation, **including withdrawn rows**.

`GET /v1/evidence-requirements/`

| Input | Type | Becomes on the wire |
|---|---|---|
| Business area | dropdown, 7 values + "All" | `domain_code` query param (omitted for All) |
| Action | free text, exact match | `action_type` query param |
| *(none)* | — | `tenant_id` — always your session tenant |

**Two things about this read that are easy to miss.**

*The tenant is a query parameter here, not a header* — this route is scoped by what the caller
asks for. The console always sends the session tenant. The header is still cross-checked: a
`tenant_id` that disagrees with your verified scope is a **403**, so you cannot read another
organisation's catalog by editing the URL. Omitting it is fine — the verified header is the real
scope, and the parameter is only a guard.

*`as_of` is deliberately never sent.* Passing `now` would return only what is currently in force.
A catalog listing that silently hid withdrawn rows would misrepresent what the gate *used to*
require — which is exactly the question an audit arrives with. So withdrawn rows are shown and
labelled instead.

**Reading the answer.** Rows are sorted in-force first, then newest. Each shows what must be on
file as a phrase ("Two supporting documents of the kind Signed contract"), whether it covers one
company or all of them, and a status badge distinguishing three states that the raw row conflates:
**In force**, **Not started yet** (future-dated), and **No longer in force** (withdrawn). An
amber note marks evidence the platform does not verify.

An empty catalog is reported as *"nothing is being checked"*, never as a clean bill of health.

---

### 2. Check an action

*(previously labelled "Evaluate an action")*

**What it is:** the gate itself, and the only section that *uses* the catalog rather than
administering it.

`POST /v1/evidence/evaluate`

| Input | Type | Becomes on the wire |
|---|---|---|
| Business area | dropdown | `domain_code` |
| Action to check | free text | `action_type` |
| Evidence you say exists | textarea, one item per line | `present_artifacts[]` |
| *(none)* | — | `legal_entity_id` — from your session, not a field |
| *(none)* | — | `correlation_id` — freshly generated per submit |

**The textarea format** is `TYPE reference-id [subtype]`, one per line:

```
SUPPORTING_DOCUMENT doc-1234 SIGNED_CONTRACT
APPROVAL_RECORD apr-5678
```

Two tokens minimum; a third is read as the subtype. A JSON textarea would be more expressive and
much harder to type correctly under time pressure, which is when this page gets used. **Leave it
blank** to ask the useful question *"what would this action require?"* — an empty list is a valid
evaluation, not an error.

**Reading the answer — and the trap.** A completed determination is **always HTTP 200**. `MISSING`
arrives as a *success*. The verdict must be read off `outcome`, never off the status code; a
caller that treats 200 as "proceed" has defeated the gate entirely.

| What you see | Outcome | What it means |
|---|---|---|
| **It can go ahead** | `SATISFIED` | everything required was matched |
| **It must be stopped** | `MISSING` | each unmet item is listed with what to produce |
| **Nothing is being checked** | `NO_REQUIREMENTS_DEFINED` | amber — not a pass, the action is ungated |
| **Needs checking** | *unrecognised* | never treated as a pass |
| **Could not be looked up** | 503 | no determination was made; not a block and not a pass |

Each unmet item is taken apart into the shortfall ("One approval record required, none supplied"),
the catalog's own note on what to produce, and — where relevant — why something that *was*
offered did not count. The reference for the check is part of the answer, not a technical detail:
it is what someone quotes later to show the check was made.

---

### 3. Look up a past check

*(previously labelled "Read a stored record")*

**What it is:** two reads by reference. Worth reading rather than re-running, because the record
froze what was required and what was supplied at the moment it was made.

`GET /v1/evidence/evaluations/{id}` · `GET /v1/evidence-requirements/{id}`

| Input | Type | Becomes on the wire |
|---|---|---|
| Reference for a past check | **UUID, 36 characters** | the `{evaluation_id}` in the path |
| Reference for a requirement | **UUID, 36 characters** | the `{evidence_requirement_id}` in the path |

Both require the tenant header. Both are scoped to your organisation, which means **404 covers
two different facts**: no such record, and a record belonging to someone else. The console says
"there is no … with that reference" rather than asserting non-existence.

**Reading the answer.** The stored check shows its verdict, what was missing, what was supplied
(with an "(taken as stated)" marker on anything unverified), and the frozen payloads under a
disclosure. A fresh check of the same action can legitimately disagree with an old record — that
is the point of freezing it, not a discrepancy to reconcile.

---

### 4. Add a requirement

**What it is:** tightening the gate. Live, writable, and authorized.

`POST /v1/admin/evidence-requirements/`

| Input | Type | Becomes | Notes |
|---|---|---|---|
| Business area | dropdown | `domain_code` | free-form in the service |
| Action to gate | free text | `action_type` | exactly the string the caller will evaluate |
| Who it applies to | dropdown, 2 values | `legal_entity_id` **present or omitted** | omitted ⇒ tenant-wide |
| Evidence needed | dropdown, 5 values | `evidence_type` | only documents are verified |
| How many are needed | number ≥ 1, blank = 1 | `requirement_payload.minimum_count` | |
| Narrow it to one kind | free text, optional | `requirement_payload.artifact_subtype` | **exact, case-sensitive** match |
| What to produce | free text, optional | `requirement_payload.description` | shown to whoever gets blocked |
| *(none)* | — | `tenant_id` | session tenant; a mismatch with the header is 403 |
| *(none)* | — | `correlation_id` | freshly generated per submit |

**"Who it applies to" is the consequential field.** *Every company in the group* leaves
`legal_entity_id` out, which (a) makes the requirement apply to every company, and (b) moves the
permission check to the tenant. *This company only* sends your session's legal entity. The
console does not let you type an arbitrary entity id — you can only write within scopes you
belong to.

**What the service does not check.** `requirement_payload` is stored as given; nothing validates
that `minimum_count` is sane or that `artifact_subtype` corresponds to anything real. A
requirement demanding 25 documents of a subtype nobody issues is accepted happily and blocks its
action forever. The console constrains the number field to whole numbers ≥ 1; the rest is on the
author.

**`effective_from`** is not on the form. The API accepts it; the console omits it, so the service
defaults to now — the requirement bites immediately.

---

### 5. Withdraw a requirement

*(previously labelled "Retire a requirement")*

**What it is:** end-dating. Not deletion — there is no route for that.

`POST /v1/admin/evidence-requirements/{id}/end-date`

| Input | Type | Becomes | Notes |
|---|---|---|---|
| Requirement reference | **UUID, 36 characters** | the `{id}` in the path | copy it from the catalog |
| Why | free text, **mandatory** | `reason` | the service rejects a withdrawal without one |
| *(none)* | — | `effective_to` | omitted ⇒ server-side now |

**The reason is not decoration.** It is stored in `retired_reason` alongside
`retired_by_principal_id`, and it is the only record of *why* the gate stopped demanding
something. A withdrawal without a reason is a hole in the audit trail, which is why the service
refuses it rather than defaulting it.

**Doing it twice is reported, never silently accepted.** The `UPDATE` guards on
`effective_to IS NULL`, so a second attempt affects no rows and comes back **422**. The original
date and reason stand, and the console says so in amber rather than showing a second success.

**Reading the answer.** The withdrawn requirement comes back rendered as "No longer in force",
and it stays in the catalog listing. That is the intended end state: it gates nothing, and it
remains readable so determinations made while it applied can still be explained.

---

## Part 4 — Known behaviours that surprise people

Each of these was confirmed against the running service.

### Document verification is broken — and it reports a healthy vault as an outage

**Every `SUPPORTING_DOCUMENT` assertion currently fails**, which means the one kind of evidence
this service is supposed to verify is the one kind that cannot be used at all.

`internal/documentvault/client.go` sends only `X-Tenant-Id` on its lookup:

```go
req.Header.Set("X-Tenant-Id", tenantID)
```

`document-vault-svc` also requires a caller identity, and answers **401 `identity_missing`**
without one. `VerifyDocument` maps any non-200/404 to `ErrDocumentServiceUnavailable`, so the
evaluation returns **503 `document_service_unavailable`** — *"the document service is
unavailable"* — while the vault is up and healthy.

Confirmed directly: the same document id returns `401` with the tenant header alone and `200`
with `X-Principal-Id` added.

Two things are wrong, and they are worth fixing separately:

1. **The missing header.** Add the principal to the outbound request. There is a design call in
   *whose* principal: the evaluating caller's (available on the request) or a service identity.
2. **The misdiagnosis.** Collapsing 401/403 into "unavailable" turns a configuration fault into a
   phantom outage. An auth failure against a reachable service is not the same fact as an
   unreachable service, and only the first is actionable by the person reading it.

Until (1) lands, the console's amber "could not be looked up" is a faithful report of what the
backend said — but the backend is saying the wrong thing.

### `MISSING` is a 200

Stated in Part 3 and repeated here because it is the single most consequential integration
detail. `ok` on the HTTP layer says a determination was *made*, not that the action may proceed.

### The console cannot reach the idempotent-replay path

Both writes and the evaluate call generate a **fresh** `correlation_id` per submit
(`crypto.randomUUID()`). The service's DB-enforced dedupe on `(tenant_id, correlation_id)` is
therefore unreachable from this page: submitting the same requirement twice creates **two rows**,
and running the same check twice creates **two determinations**.

The natural-key index tolerates this because it includes `effective_from`, and two submissions
land on different microsecond timestamps. The result is two independent, identical requirements,
both in force — and because matching does not consume artifacts, **one supplied artifact satisfies
both**, so the gate behaves the same. It is untidy in the catalog rather than wrong at the gate.

### A supplied `effective_from` collision reads as a database outage

`CreateRequirement`'s `ON CONFLICT` clause names only `(tenant_id, correlation_id)`. A violation
of the **natural key** is unhandled and surfaces as a raw unique-violation → **503
`store_unavailable`**, which reads as an outage. Unreachable from the console (it never sends the
date), but a direct API caller that supplies the same `effective_from` twice will hit it.

### Unlike policy-svc, a malformed reference is reported correctly

`mapPgError` translates Postgres `22P02` (invalid text representation) into
`ErrInvalidIdentifier`, which the handlers report as **400 `invalid_field`**. This service gets
right what `policy-svc` gets wrong — there, a mistyped id surfaces as a 503. Worth knowing when
comparing the two pages' error handling; do not "align" this one downward.

`legal_entity_id` on the list route is compared as `legal_entity_id::text = $n`, casting the
*column* rather than the parameter — so a malformed value there matches nothing instead of
erroring, and an empty result would read as "this company has no requirements", which for an
evidence gate reads as permission. The console pre-validates the format for that reason.

### Subtype matching is exact and unforgiving

`artifact_subtype` is compared with a plain `!=`. `signed_contract` does not match
`SIGNED_CONTRACT`, and neither matches `SIGNED CONTRACT`. A requirement with a subtype nobody
supplies exactly is unsatisfiable, and the failure looks identical to missing evidence.

### `NO_REQUIREMENTS_DEFINED` publishes no event

Neither `satisfied` nor `missing` is true of it, and minting a third event would extend the
published contract beyond the spec. It is logged at warn level instead. So a downstream consumer
watching the topic sees **nothing at all** for an ungated action — silence on the bus does not
mean the check did not happen.

### An unreadable `requirement_payload` blocks rather than disappears

If the `jsonb` cannot be unmarshalled, the requirement is reported **unmet** with
*"requirement payload is unreadable and cannot be evaluated"* — not skipped. A malformed rule
blocks its action, which is the correct direction for a gate but can look inexplicable to whoever
is blocked.

### RLS is not what isolates tenants

The policy is enabled and `FORCE`d, but `DB_USER` is a superuser in every local compose file, and
superusers bypass row security entirely. The policy has never been consulted for a single query
this service has made. Real isolation comes from the explicit `tenant_id = $n` predicate in every
statement. Migration `000002` removed the reason the policy could never work so that granting an
ordinary role starts enforcing it; granting that role is a platform-wide change and has not
happened.

---

## Part 5 — What the service has that the console does not show

No unused *routes* — the console calls all six. What it does not surface are parameters:

| Capability | Route | Why it is not on the page |
|---|---|---|
| `as_of` point-in-time catalog view | list | deliberately omitted so withdrawn rows stay visible; a "catalog as it stood on date X" view would be a genuine addition |
| `legal_entity_id` filter | list | the page filters by area and action only |
| explicit `effective_from` | create | would allow pre-staging a future requirement — and unlike `policy-svc`, the dates here are actually enforced, so this would really work |
| explicit `effective_to` | end-date | would allow scheduling a withdrawal |

The two date parameters are the interesting gap: the enforcement is already there, so exposing
them is a form change rather than a service change.

---

## Where the code lives

| Concern | File |
|---|---|
| Routes, handlers, the matching rule (`determine`) | `internal/handler/handler.go` |
| Catalog and evaluation queries | `internal/store/pg_store.go` |
| Document verification (**see Part 4**) | `internal/documentvault/client.go` |
| Authorization gate (fails closed) | `internal/authz/client.go` |
| Envelope requirements for this service | `internal/envelope/contract.go` |
| Event publishing | `internal/events/publisher.go` |
| Schema, RLS, the natural key | `deployments/migrations/` |
| Console API layer, explainers, the unmet-reason parser | `lib/api/evidence.ts` |
| Console page and server actions | `app/admin/evidence/` |
| Readable rendering of the three records | `components/admin/evidence/EvidenceSummary.tsx` |
| Lookup wrappers (client, to hold render functions) | `components/admin/evidence/EvidenceLookups.tsx` |
| Catalog table | `components/admin/evidence/CatalogPanel.tsx` |

### A note on the console's wording

Every plain-English label is paired with the stored code beneath it ("Recorded by the service as
`MISSING`"). The wording is the console's *reading* of the record, not the record itself, and
anyone citing an evidence determination to an auditor needs the value the service actually holds.

For the same reason, an outcome the console does not recognise is never mapped to the permissive
reading — it goes to "needs checking". This is not hypothetical here: the outcome mapping was
originally two `if`s and a fallthrough to `satisfied`, so any unknown verdict would have rendered
as a **green pass on an evidence gate**. It is now an exhaustive map with an explicit
`unrecognised` state.

One deliberate coupling to be aware of: the service composes its unmet explanation into a single
string for machine callers —

```
requires 2 matching artifact(s), 1 present (artifact_subtype "X"); an offered
artifact did not count: …; <description>
```

— and `explainUnmetReason` in `lib/api/evidence.ts` takes it back apart into a shortfall, a
rejection reason and an instruction. That parser is coupled to the service's wording, so it
**fails soft**: anything that does not match the expected shape is shown whole, which is no worse
than the raw string it replaced. If the Go wording changes, the parser degrades rather than
breaks — but it should be updated alongside.
