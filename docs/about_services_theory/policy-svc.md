# policy-svc — the theory, and the six things the console does with it

**Service:** `policy-svc` · port `8085` · console page `/admin/policies`
**Backend:** `zoiko-suite-backend/services/policy-svc`
**Console:** `app/admin/policies/`, `components/admin/policies/`, `lib/api/policies.ts`

This document explains *why* the service is shaped the way it is, then walks each of the six
sections on the Policies page: what the feature is, what it sends, what every input means, and
what the answer actually tells you.

---

## Part 1 — The theory

### The one question it answers

> **"Does this action need approving, and on what authority?"**

The second half is the whole reason the service exists. Any config table can hold a spending
limit. What policy-svc adds is the ability to defend the answer months later — to say not just
"this needed approval" but "under this exact rule, in this version, put into force by this
person, on this date". Every design choice below follows from that.

### Two levels, deliberately separated

| | Holds | Changes over time? |
|---|---|---|
| **Policy** | a name: code, title, kind | No — immutable once created |
| **Policy version** | the actual rule content, its scope, its dates | Yes — by adding new versions |

A policy carries **no rule content at all**. If a spending limit were one editable row, raising
it from 10,000 to 25,000 would destroy the evidence that the old limit ever existed, and every
decision made under it becomes unexplainable. Instead the old version is kept and marked
replaced. Identity stays stable while content moves, which is what keeps *"what did this rule
require in March"* answerable.

### Four standings, one legal move

```
                 ┌──────────────── activate a newer version ───────────────┐
                 │                                                         ▼
   (created) ─► DRAFT ──── activate ────► ACTIVE ──────────────────► SUPERSEDED
                 │                          │
                 └──────────────────────────┴──────────────────► RETIRED
```

* A version is **born DRAFT** and does nothing. There is no way to create an already-active one.
* **Only DRAFT → ACTIVE is permitted.** You cannot resurrect a replaced version (409).
* Activating supersedes whatever previously held the **same scope on the same rule** — enforced
  by a unique partial index on `(policy_id, tenant_id, legal_entity_id) WHERE version_status =
  'ACTIVE'`, with the supersede running first inside the same transaction.
* `activated_by_principal_id` / `activated_at` are written **once and never overwritten**, even
  after the version is later replaced. Its own enactment history stands.

Authoring a rule and enacting it are separate acts because they carry different authority and
different blame. That separation is the reason the console has three steps rather than one form.

### Three scopes, narrowest wins

A version binds exactly one scope, made explicit by `scope_type` (`GLOBAL` / `TENANT` /
`LEGAL_ENTITY`), with a CHECK constraint tying it to the nullable columns:

| scope_type | tenant_id | legal_entity_id | Means |
|---|---|---|---|
| `GLOBAL` | null | null | every organisation on the platform |
| `TENANT` | set | null | one organisation |
| `LEGAL_ENTITY` | set | set | one legal entity |

When a decision is needed the service collects every ACTIVE version that *could* apply — tenant
is yours or unset, entity is yours or unset — and sorts **most specific first**, then by
`effective_from` descending. **Only the first is used.**

```
LEGAL_ENTITY  (2)  ─┐
TENANT        (1)  ─┼─► specificity DESC, then effective_from DESC ─► [0] decides
GLOBAL        (0)  ─┘
```

So a legal entity's own limit overrides its organisation's, which overrides the platform
default. Superseding is per-rule-per-scope: activating an entity-scoped limit leaves the
organisation-wide one untouched and still in force for everyone else.

### It answers "what applies here", never "what exists"

There is **no list-all endpoint**. Every read requires a policy type, and a scope. The service is
built to answer *"what governs this case"*, not *"what is in the catalogue"*. That is why the
first console section makes you pick both before it shows you anything, and why the history
section needs a specific rule reference rather than offering a picker.

### Three outcomes for a repeated write, not two

| Status | Meaning |
|---|---|
| `201` | created |
| `200` | something **identical** already existed; nothing was written |
| `409` | the key exists but you have described it **differently** |

The third is kept separate on purpose. It is not a retry — it is an attempt to redefine a
governance rule under a name already in use. Folding it into "already exists" would hide that,
so the distinction is carried all the way to the screen as a different colour and wording.

The natural keys:

* **Policy** — `policy_code`, unique **platform-wide** (`idx_policies_code_unique` is on the
  code alone, not per tenant).
* **Version** — `(policy_id, tenant_id, legal_entity_id, effective_from)`.

### It refuses to guess

If no rule is in force for a scope, evaluation returns **404**, not an approval and not a
rejection. The service deliberately declines to pick fail-open or fail-closed and leaves the
judgement to the caller. An undecided action is not an approved action — the console renders this
as its own outcome for exactly that reason.

### Every change is authorized, and fails closed

All three writes call authorization-svc before proceeding. If the authorizer cannot be reached
the change is **refused (503)**, never waved through.

| Action | Needed for |
|---|---|
| `POLICY_CREATE` | creating a rule |
| `POLICY_VERSION_CREATE` | setting a limit |
| `POLICY_VERSION_ACTIVATE` | bringing one into force |
| `POLICY_VERSION_CREATE_GLOBAL` / `POLICY_VERSION_ACTIVATE_GLOBAL` | the same, for versions binding *every* tenant |

The `_GLOBAL` variants exist because publishing a rule that applies platform-wide has a far
larger blast radius — a principal holding only the tenant-scoped grant must not be able to reach
global scope by simply omitting `tenant_id`. The permission is checked against the version's own
`legal_entity_id`, or against a synthetic platform-scope entity when the version is not
entity-scoped.

### The canonical envelope

Every **write** must carry the full input contract or it is refused before any handler runs:

| Header | Requirement |
|---|---|
| `X-Tenant-Id` | always — missing is a **401**, not a 400 (it is an authentication failure) |
| `X-Principal-Id` | always (the actor) |
| `X-Request-Id`, `X-Correlation-ID` | always |
| `X-Source-Channel` | always, from a fixed set (`web` for the console) |
| `Idempotency-Key` | on every material write |
| `X-Legal-Entity-Id` | **on every write** — this service sets `LegalEntityID: RequiredOnWrite` |

That last row is easy to miss and there is nothing in the form to hint at it. Note the
distinction it creates: the **header** is the caller's own entity context, while
`legal_entity_id` in the **body** is the scope the version binds. A global version binds no
entity but is still published *from* one.

### Evidence

Every evaluation also appends a decision to governance-decision-log-svc — **best-effort by
design**. Evaluation's availability must not depend on the evidence store's uptime, so a failure
there is logged and swallowed and the evaluation still returns 200. A successful answer therefore
does **not** prove the decision was recorded. See *Known behaviours* below.

---

## Part 2 — Data model and endpoints

### Tables

| Table | Holds |
|---|---|
| `policies` | the named containers |
| `policy_versions` | rule content, scope, dates, standing |
| `control_test_definitions`, `control_test_executions` | control testing (no console UI) |
| `attestations` | attestations (no console UI) |

### Wire shapes

```
Policy                          PolicyVersion
──────                          ─────────────
policy_id                 uuid  policy_version_id           uuid
policy_code               str   policy_id                   uuid
policy_name               str   tenant_id            uuid | null   ← null = every tenant
policy_type               str   legal_entity_id      uuid | null   ← null = whole tenant
created_at                ts    scope_type                  str    GLOBAL|TENANT|LEGAL_ENTITY
created_by_principal_id   uuid  rule_payload               jsonb   ← free-form, unvalidated
                                effective_from              ts
                                effective_to         ts   | null
                                version_status              str    DRAFT|ACTIVE|SUPERSEDED|RETIRED
                                activated_by_principal_id uuid|null ← written once, never rewritten
                                activated_at         ts   | null
                                created_at                  ts
                                created_by_principal_id     uuid
```

`version_status` is a plain VARCHAR, not an enum — the console never assumes an unrecognised
value is safe.

### The four policy kinds

| Code | Reads as | Can the platform decide it? |
|---|---|---|
| `APPROVAL_THRESHOLD` | Approval threshold | **Yes** — the only one implemented |
| `SPEND_CONTROL` | Spend control | No — returns 501 |
| `SOD_RULE` | Separation of duties | No — returns 501 |
| `SIGNATORY_MATRIX` | Signatory matrix | No — returns 501 |

This is a real limit, not a rollout gap. The other three can be created, given limits and brought
into force, and will then be consulted by nothing. **Being in force is not the same as being
applied**, and the console says so wherever one of them appears.

### Endpoints the console uses

| Method | Path | Console section |
|---|---|---|
| `GET` | `/v1/policies?policy_type=&tenant_id=&legal_entity_id=` | 1 — What is in force right now |
| `GET` | `/v1/policies/{policy_id}/versions` | 2 — The history of one rule |
| `POST` | `/v1/policies/evaluate` | 3 — Check an amount |
| `POST` | `/v1/policies` | 4 — Create a rule |
| `POST` | `/v1/policies/{policy_id}/versions` | 5 — Set the limit |
| `POST` | `/v1/policies/{policy_id}/versions/{version_id}/activate` | 6 — Bring a limit into force |

---

## Part 3 — The six sections

The page is **two readers, one decision endpoint, and a three-step authoring flow**. The steps are
numbered because each is a different kind of act: *naming* a rule, *authoring* its content,
*enacting* it.

```
Create a rule       →  a name.       Decides nothing.
Set the limit       →  the content.  Decides nothing.
Bring into force    →  enactment.    Now it decides.
                            │
What is in force ←──────────┤  what would decide, right now
The history      ←──────────┤  what has ever decided, and who enacted it
Check an amount  ←──────────┘  put it to work on a real number
```

Sections 1 and 2 are the same data seen through different questions: 1 asks *what is live here*,
2 asks *what has this rule ever said*. Section 3 is the only one a real business process would
call — the other five exist so that its answer can be justified.

---

### 1. What is in force right now

**What it is:** a read — the live picture of what would decide, for one kind of rule in one scope.

`GET /v1/policies`

| Input | Type | Becomes on the wire |
|---|---|---|
| Kind of rule | dropdown, 4 fixed values | `policy_type` query param — **mandatory**, there is no "show everything" |
| Who it applies to | dropdown, 3 values | decides whether your tenant id, tenant + entity, or neither is sent |

**No free text at all.** The scope dropdown does not take an id — it selects which parts of your
own session identity get sent, so you can only ask about scopes you belong to.

**Reading the answer.** Rows are ordered most-specific-first and a badge marks the top one. The
rest are shown because they *would* apply if the narrower one were withdrawn — useful for seeing
the fallback chain, but only the top row decides. An empty result means an evaluation in this
scope comes back undecided; the service will not invent a limit.

---

### 2. The history of one rule

**What it is:** the audit read — every version a rule has ever had, whatever its standing,
including drafts never enacted and versions long replaced. This is the view that answers *"what
did this require in March"* and *"who put that limit into force"*.

`GET /v1/policies/{policy_id}/versions`

| Input | Type | Becomes on the wire |
|---|---|---|
| Rule reference | **UUID, 36 characters** | the `{policy_id}` in the path |

> **The commonest mistake.** This wants the reference the service *generated*
> (`5ccf655a-77b9-4e9f-9eb6-bc17b8329295`), **not** the code you chose
> (`TRAVEL-LIMIT-2026`). Both identify the same rule, but only the UUID is the database key.
> Pasting the code sends a value that will not cast to `uuid`, which the service reports as a
> database problem — see *Known behaviours*.

**Reading the answer.** Results are scoped to your organisation plus any global versions. Two
different facts look similar and are not: a rule that **does not exist** returns 404, while a
rule that **exists with no versions** returns an empty list — the second means it is enforcing
nothing and can decide nothing.

---

### 3. Check an amount

**What it is:** the only section that *uses* a policy. Everything else administers them.

`POST /v1/policies/evaluate`

| Input | Type | Becomes on the wire |
|---|---|---|
| Kind of rule | dropdown | `policy_type` |
| Who it applies to | dropdown | `tenant_id` / `legal_entity_id` |
| Amount to check | number, decimals allowed | `action_context: { amount }` |

The console also generates a `decision_id` per check, which doubles as the correlation id and the
key the evidence row is filed under.

**The comparison:** `amount > threshold_amount` → approval needed; otherwise within. **Equal
counts as within.**

**Three answers, not two:**

| Answer | Meaning |
|---|---|
| `WITHIN_THRESHOLD` | at or under the limit — proceed without approval |
| `APPROVAL_REQUIRED` | over the limit. **Not a refusal** — a referral to someone who can approve it |
| `404`, nothing applies | **undecided.** Not a pass. The caller must decide what to do |

The response names the exact version that decided, and a `rule_basis` of
`<policy_code>:<policy_version_id>` — because "approval needed" is worthless as evidence without
the rule that produced it.

---

### 4. Create a rule — step 1 of 3

**What it is:** creating the empty container.

`POST /v1/policies`

| Input | Type | Becomes | Notes |
|---|---|---|---|
| Short code | free text | `policy_code` | Stable, permanent, **and the dedup key** |
| Kind of rule | dropdown | `policy_type` | Fixes what the rule can ever decide |
| Name | free text | `policy_name` | Display only |

**This changes nothing.** The rule enforces nothing, decides nothing, and appears in no
in-force table until it has an active version.

The code does double duty — human handle *and* idempotency key — which is why reusing it with a
different name is refused rather than treated as an edit. It is unique platform-wide and cannot
be changed, so pick it as carefully as a database column name.

The output gives you the **rule reference**, which steps 2 and 3 both need.

---

### 5. Set the limit — step 2 of 3

**What it is:** authoring the actual rule content.

`POST /v1/policies/{policy_id}/versions`

| Input | Type | Becomes | Notes |
|---|---|---|---|
| Rule reference | UUID | `{policy_id}` in the path | The generated reference, not the code |
| Limit | number ≥ 0 | `rule_payload.threshold_amount` | The one number that does the work |
| Dated from | date | `effective_from` (RFC3339) | Recorded, **not enforced** — see below |
| Who it applies to | dropdown | `tenant_id` / `legal_entity_id` in the body | The scope the version **binds** |
| Extra details | optional JSON object | merged into `rule_payload` | Leave empty for a normal threshold |

**Why there is a JSON box at all.** `rule_payload` is a free-form `jsonb` column with no fixed
shape, and a future kind of rule may need more than a single number in it. The threshold gets its
own numeric field because typing `{"threshold_amount": 10000}` is not a reasonable thing to ask
of the person setting a spending limit — but the escape hatch stays, folded shut, so a rule that
needs more is still writable.

**The date does not schedule anything.** See *Known behaviours*.

**The result is always a DRAFT.** There is no way to create an already-active version, and that
is the point: it forces enactment to be a separate, attributable decision.

**Conflict semantics.** A 409 here means a version already exists with the same
`(rule, scope, effective_from)` and says something different. Give it a later date, or a narrower
scope.

---

### 6. Bring a limit into force — step 3 of 3

**What it is:** the only action on the page that changes what the platform enforces.

`POST /v1/policies/{policy_id}/versions/{version_id}/activate`

| Input | Type | Becomes |
|---|---|---|
| Rule reference | UUID | `{policy_id}` |
| Limit reference | UUID | `{version_id}` |

Two long generated values, easy to confuse — the first says **which rule**, the second says
**which of its limits**.

**What it does:** promotes the draft to ACTIVE and supersedes whatever previously held the same
scope on the same rule. Attributed to you permanently.

**On reversing it:** you cannot re-activate a replaced version, so backing out means authoring a
new limit and enacting that instead. Repeating the action on a limit *already* in force is
accepted and changes nothing, so a double-click is safe.

---

## Part 4 — Known behaviours that surprise people

Each of these was confirmed against the running service, and each is a place where the honest
reading differs from what a field name suggests.

### `effective_from` and `effective_to` are recorded but never enforced

`FindApplicableVersions` filters on policy type, status and scope only. **There is no date
predicate** — the dates are used solely in `ORDER BY`. A version dated a year out starts deciding
the moment it is activated.

Consequences:

* You **cannot** pre-stage a policy change by dating it forward.
* The date's only real effect is ranking two versions of the same scope, later date winning.
* This is why the console labels the column **"Dated from"** rather than "In force from", and
  warns when something in force is future-dated. Do not re-introduce scheduling language unless
  the store query gains a date predicate.

### `rule_payload` is not validated at creation

A version with no `threshold_amount` is accepted happily and only fails when it is asked to
decide something — at which point it errors outright as the deciding version. The console rejects
such a version at the form instead, and flags any existing one, because a rule that can never
decide is worse than a rejected form.

### Activation is idempotent; re-activation of a replaced version is not

| From | Activating gives |
|---|---|
| `DRAFT` | 200, becomes ACTIVE |
| `ACTIVE` | **200, no-op** — nothing in the response distinguishes this from a first activation |
| `SUPERSEDED` / `RETIRED` | **409** — cannot be resurrected |

Because a repeat is indistinguishable from a first activation, the console's success wording says
what is true *afterwards* rather than claiming something moved.

### 409 and 404 come back with empty bodies

There is no error code in the response to explain, so each console write supplies its own wording
for those two statuses. Without that, the reader saw the client's own diagnostic.

### A malformed reference is reported as a database outage

References are cast straight to `uuid` in SQL. A value that will not cast — a rule code, a
truncated id — surfaces as **503 `store_unavailable`**, which reads as an outage. It should be a
400. The console pre-checks the format so this does not reach the service, and no longer asserts
an outage in its wording.

### The evidence write is currently failing, silently

policy-svc's decision-log client does not send the canonical envelope, so
governance-decision-log-svc rejects every evidence write with `400 envelope_incomplete` (missing
`X-Request-Id`, `X-Source-Channel`, `Idempotency-Key`, `X-Legal-Entity-Id`, `X-Purpose-Context`).
The handler logs and swallows it by design, so **no evaluation is being recorded at all** while
answers keep returning 200.

Open, in `internal/decisionlog/client.go`. The fix is to mirror the header set the console builds
in `lib/api/envelope.ts`. It must **not** be "fixed" by making evaluation fail when the log write
fails — best-effort is deliberate. The console's warning copy is accurate and should stay.

---

## Part 5 — What the service has that the console does not show

Eight further routes exist with no UI:

**Control testing** — evidence that a control was tested and works, not just declared:

```
POST /v1/control-test-definitions
GET  /v1/control-test-definitions/{id}
POST /v1/control-test-definitions/{id}/executions
GET  /v1/control-test-definitions/{id}/executions
GET  /v1/controls/{control_ref}/effectiveness
```

**Attestations** — a named party asserting something is true, revocably:

```
POST /v1/attestations
GET  /v1/attestations/{id}
POST /v1/attestations/{id}/revoke
```

There is also `GET /v1/policy-versions/{version_id}`, a direct fetch of one version by reference,
which the console does not use.

---

## Where the code lives

| Concern | File |
|---|---|
| Routes and handlers | `internal/handler/handler.go` |
| Control tests / attestations | `internal/handler/control_test_handler.go` |
| Applicable-set and history queries | `internal/store/pg_store.go` |
| Envelope requirements for this service | `internal/envelope/contract.go` |
| Authorization gate (fails closed) | `internal/authz/client.go` |
| Evidence write | `internal/decisionlog/client.go` |
| Schema | `deployments/migrations/` |
| Console API layer, explainers | `lib/api/policies.ts` |
| Console page and server actions | `app/admin/policies/` |
| Readable rendering of the three records | `components/admin/policies/PolicySummary.tsx` |

### A note on the console's wording

Every plain-English label on the page is paired with the stored code beneath it ("Recorded by the
service as `APPROVAL_REQUIRED`"). That is deliberate: the wording is the console's *reading* of
the record, not the record itself, and anyone quoting a policy to an auditor needs the value the
service actually holds. For the same reason, an outcome or status the console does not recognise
is never mapped to the permissive reading — it goes to "needs checking", because reading an
unknown governance value as approval is the one mistake this page must not make.
