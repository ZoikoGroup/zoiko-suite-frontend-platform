# schema-registry-svc — the theory, and the four sections the console builds on it

**Service:** `schema-registry-svc` · port `8093` · console page `/admin/schemas`
**Backend:** `zoiko-suite-backend/services/schema-registry-svc`
**Console:** `app/admin/schemas/`, `components/admin/schemas/`, `lib/api/schemas.ts`

This document explains *why* the service is shaped the way it is, then walks each section on the
Event Schemas page: what the feature is, what it sends, what every input means, and what the
answer actually tells you. Every behaviour in Part 4 was confirmed against the running service,
not read off the code alone.

---

## Part 1 — The theory

### The one question it answers

> **"What is an event of this kind required to contain — and what has happened to that
> requirement over time?"**

The second half is the reason the service exists. Any repository can hold a JSON Schema. What
this registry adds is the ability to say, months later, *what the contract said in March, who
changed it, and whether anyone checked that the change was safe*. Every design choice below
follows from that.

### It is a register of promises, not a gate on traffic

Nothing in the platform validates a published event against its registered schema at runtime.
A producer can emit whatever it likes; this service will not know and cannot stop it.

```
    producer ──── event ────► Kafka ────► consumer
                    │
                    ╳  no validation hop. Ever.
                    │
              event_schemas   ← what the payload was PROMISED to contain
```

That sounds like a weakness and is actually the boundary of the doctrine
(`04-data-model.md §17.2`): the registry's job is to make the contract **stated, versioned and
attributable**, so a breakage can be argued about afterwards with evidence. It is a governance
record, not a firewall. The console says this on the page, because a reader who assumes otherwise
will trust the register further than it can carry.

### Append-only: there is no edit and no delete

A version, once registered, is never modified and never removed. Evolution always **inserts a new
row**. There is no `PUT`, no `PATCH`, no `DELETE` — not unimplemented, deliberately absent.

If the current contract were one editable row, then changing a field's type would destroy the
evidence that the old shape ever existed, and every event published under it becomes
unexplainable. So the old version stays readable forever and the new one sits above it. Identity
(`event_name`) stays stable while content (`version`) moves.

This is why the console has no "edit schema" form, and why it must never grow one.

### Compatibility is declared per version, not per event

`compatibility_mode` lives on **each row**, not on the event. A contract can be registered under
a check for years and then, once, not be.

| Mode | Means | Recorded so that… |
|---|---|---|
| `BACKWARD` | this version was compared with the one before it and would have been refused if it broke an existing reader | the default, and what the service applied unconditionally before the mode was declarable |
| `NONE` | no comparison was made | the `§17.2` "breaking changes require controlled rollout" case — the **exemption is on the row**, visible in the register rather than inferred from a payload that inexplicably changed shape |

`FORWARD` and `FULL` are deliberately **absent**. The service refuses a mode it cannot actually
apply rather than storing one and quietly checking something else — a register that claims a
discipline it is not keeping to is worse than one that rejects the request.

Omitting the mode entirely defaults to `BACKWARD` (verified: a body with no `compatibility_mode`
comes back `"compatibility_mode":"BACKWARD"`).

### What "checked" actually compares

The checker (`internal/compat`) reads **two members** of the schema and nothing else:

```
{
  "type": "object",
  "properties": {              ← read: field name → declared `type` (a plain string)
    "tenant_id": { "type": "string" },
    "actor":     { "type": "object", "properties": { … } }   ← NOT read: never descends
  },
  "required": ["tenant_id"]    ← read: which fields must be present
}
```

Two consequences, both documented v1 boundaries rather than oversights:

1. **Outermost fields only.** A breaking change made *inside* a field that holds a group or a
   list is accepted, because the comparison never opens it.
2. **Against the latest version only.** A consumer still pinned to v2 is not considered when v5
   is registered. "Backward compatible" here means *compatible with the contract in use now*,
   never *with every version ever published*.

### Four ways a change breaks a reader

These are the only four things the checker calls a violation. Everything else — adding an
optional field, removing a field that was never compulsory — is always safe.

| The change | Why it breaks something | The checker's words |
|---|---|---|
| A compulsory field is **dropped** | readers count on it arriving | `field "x" was required and has been removed` |
| A compulsory field becomes **optional** | readers have no path for it being absent | `field "x" was required and is no longer required` |
| A field's **type changes** | readers expect the old kind of value | `field "x" changed type from "number" to "string"` |
| A field becomes **newly compulsory** | the publisher does not send it yet, so every event it publishes would breach its own contract | `field "x" is newly required and existing producers don't populate it` |

The console translates each into what to do instead, and keeps the original string underneath —
see *A note on the console's wording*.

### The version number belongs to the registry

The caller never chooses a version. It is computed **inside the INSERT**, guarded by the version
the caller checked against:

```sql
INSERT INTO event_schemas (…)
SELECT $1, COALESCE(MAX(version), 0) + 1, …
FROM   event_schemas
WHERE  event_name = $1
HAVING COALESCE(MAX(version), 0) = $6   ← the baseline the caller validated against
```

If the `HAVING` guard excludes the row, someone else registered first. That is **409, not 503** —
two people registering at once is ordinary, not an outage — and the loser must **re-read and
resubmit** rather than retry blindly, because its schema was checked against a version that is no
longer latest.

**So this endpoint returns 409 for two completely different facts**, and they need opposite
responses:

| 409 | Body | What the reader must do |
|---|---|---|
| Incompatible schema | `{"error":"incompatible schema change","violations":[…]}` | change the schema |
| Lost version race | `{"error":"a concurrent registration claimed this version — re-read the latest version and retry"}` | resubmit the same schema, unchanged |

The console distinguishes them on the presence of `violations`, and reports them as separate
states. Collapsing both into "conflict" would send half the readers to edit a schema that did not
need editing.

### Reads are identity-gated; writes are authorized and fail closed

| Operation | Bar |
|---|---|
| Any read | a verified principal (`X-Principal-Id`). No permission, no entity scope |
| Registration | the `SCHEMA_PUBLISH` grant from authorization-svc, checked synchronously |

Reads used to be **open**: anything that could reach the port could enumerate every event name,
every payload field, and which service owns each — a map of the platform's internals.
`05-security.md §14.6` names schema-registry *access*, not only mutation, as the thing to
protect, so reads now require identity.

Deliberately **identity only, with no per-entity grant**: an event contract is platform-wide
reference data with no legal entity of its own, so a permission scoped to one entity would answer
a question the data does not have.

Writes fail closed in every direction:

| Situation | Answer | Written |
|---|---|---|
| no verified principal | `401` | nothing |
| authorization-svc says anything but `GRANTED` | `403` | nothing |
| authorization-svc unreachable, or answers non-200 | `503` | nothing |

A registration carrying no `X-Legal-Entity-Id` is authorized against a **synthetic platform
scope** (`00000000-0000-0000-0000-00000000f001`). Passing an empty entity through instead drew a
400 from authorization-svc, which the client reports as "authorization service unavailable" — a
503 blaming infrastructure for a scope the request was never going to carry.

### The authorization gate runs *before* validation

Unusual ordering, and intentional. An unauthenticated caller must not be able to learn what this
service considers a well-formed event name or a well-formed schema by watching which 400s come
back. The first thing a caller establishes is who they are; only then does the service start
discussing their input.

### The canonical envelope

The envelope middleware runs in **write-strict** mode (the platform default): material writes are
refused without the full contract, reads are admitted.

| Header | On a write | On a read |
|---|---|---|
| `X-Principal-Id` | required | **required** |
| `X-Tenant-Id` | required | not checked |
| `X-Request-Id`, `X-Correlation-ID` | required | not checked |
| `X-Source-Channel` | required, from a fixed set (`web` for the console) | not checked |
| `Idempotency-Key` | required | n/a |
| `X-Legal-Entity-Id` | `NotRequired` — but it selects the authorization scope when present | not checked |
| `X-Purpose-Context`, `X-Book-Id` | `NotRequired` | n/a |

An incomplete envelope on a write is **`401 envelope_incomplete`**, not a 400 — missing tenant
authority is treated as an authentication failure. The console's action always sends the full set,
so from the UI this only appears if something between console and service strips headers.

### No evidence trail, and no event emitted

Unlike policy-svc, this service writes **nothing** to governance-decision-log-svc and publishes
**no** Kafka event when a contract changes. A registration exists in `event_schemas` and in the
service log (`NONE` is logged at INFO, because a contract evolving without a check is a
governance event rather than a routine one) — and nowhere else. The register *is* the record.

---

## Part 2 — Data model and endpoints

### Table

One table. `event_schemas`:

| Column | Type | Notes |
|---|---|---|
| `event_name` | `varchar(255)` | part of the PK, and the register's key |
| `version` | `int` | part of the PK, assigned by the service, starts at 1 |
| `json_schema` | `jsonb` | the payload contract |
| `compatibility_mode` | `varchar(32) NOT NULL` | default `'BACKWARD'` |
| `owning_service` | `varchar(255)` | nullable |
| `registered_by` | `varchar(255)` | the principal, nullable |
| `registered_at` | `timestamptz NOT NULL` | default `now()` |

`PRIMARY KEY (event_name, version)`. `varchar` rather than an enum for the mode, per platform
doctrine: new modes arrive by data migration, not a code change.

Indexes: on `event_name`; a partial index on `compatibility_mode WHERE <> 'BACKWARD'` (supporting
the governance question *"which contracts are exempt"*); a partial index on `owning_service WHERE
NOT NULL`.

Five CHECK constraints back up the service's own validation — `json_schema` is an object, is not
`{}`, `version >= 1`, mode is one of the two known values, and `event_name` matches the dotted
lowercase pattern. **All five are `NOT VALID`**: they apply to every future write but the table
was never scanned, because this table is append-only by doctrine and rows written before the
rules existed are history, not errors to correct by migration. So *old rows may hold values the
service would now refuse* — which is precisely why the console never reads an unrecognised mode
as "checked".

### Wire shape

```
EventSchema
───────────
event_name           str      dotted lowercase, ≥ 2 segments
version              int      assigned by the registry
json_schema          object   the payload contract; only its top level is ever analysed
compatibility_mode   str      BACKWARD | NONE
owning_service       str?     omitted when empty
registered_by        str?     principal id
registered_at        ts
```

The **payload shape only**. The shared envelope fields every publisher already carries
(`event_type`, `emitted_at`, `schema_version`, `source_service`) are not registered here.

### Endpoints

| Method | Path | Returns | Console section |
|---|---|---|---|
| `GET` | `/v1/schemas` | bare array of names, `DISTINCT`, name-ascending | 1 — Contract register |
| `GET` | `/v1/schemas/{name}/versions/latest` | one `EventSchema` | 1 and 2 |
| `GET` | `/v1/schemas/{name}/versions` | array, **oldest first** | 2 — Look up one contract |
| `GET` | `/v1/schemas/{name}/versions/{version}` | one `EventSchema` | *(unused by the console)* |
| `POST` | `/v1/schemas/{name}/versions` | `201` + the stored `EventSchema` | 3 — Register a version |

Paging on both list routes: `limit` default **100**, maximum **500**; `offset` ≥ 0. Out of range
is a 400 naming the parameter (`limit must be an integer between 1 and 500`), never a silent
default.

Not-found semantics differ per route and the difference matters:

| Route | 404 when | 200 when |
|---|---|---|
| `/versions/latest`, `/versions/{n}` | no such event, or no such version | the row exists |
| `/versions` | the list is empty **and** `offset` is 0 | an empty page past the end of a real history |
| `/versions/{n}` with `n < 1` | — | **400** `version must be 1 or greater` (a caller mistake, not a lookup) |

An event name that could never be registered (wrong case, one segment) reads as **404 on a read**
rather than a validation error — a name that names no contract is simply not found.

---

## Part 3 — The four sections

The page is **two readers, one writer, and one page of caveats**. There is no third authoring
step and no activation, because a registered version is live the moment it exists — the flow that
policy-svc splits into draft/activate has no counterpart here.

```
Register a version   →  appends the next version. It is current immediately.
                              │
Contract register    ←────────┤  what every event must contain right now
Look up one contract ←────────┤  one contract in full, and how it got that way
Limits of the check  ←────────┘  what the register above cannot tell you
```

---

### 1. Contract register

**What it is:** the whole catalogue at a glance — one row per event, showing the contract in force
and whether the change that produced it was examined.

**Input:** none. It reads on page load.

**What it sends:** `GET /v1/schemas` for the names, then `GET /v1/schemas/{name}/versions/latest`
**once per name**. There is no bulk endpoint, so this is an N+1 by necessity — acceptable because
the register is one row per event *type* on the platform, not per event.

**Reading the answer:**

| Column | Answers |
|---|---|
| Event | the exact name a publisher puts on the event |
| In use now | which version a producer must satisfy today |
| What it must contain | *"4 fields, 2 compulsory"* — the shape, summarised |
| Was the change checked? | **Checked** / **Not checked** / **First version**, with the stored code beneath |
| Published by | `owning_service`, or *"Not recorded"* |
| Registered | when this version was appended |

The column to read first is *Was the change checked?*. **First version** is neither of the other
two: nothing was compared, because there was nothing to compare with. An amber **Not checked** is
the only row a governance reader needs to act on — and the count above the table
(*"1 of them was last changed without being checked against the version before"*) deliberately
excludes first versions, which would otherwise inflate it with events that have simply never
changed.

A name that comes back from the register but whose current version cannot be read says so in the
row, rather than showing five dashes that read as *"nothing is registered"*.

---

### 2. Look up one contract

**What it is:** one contract in full — every field a producer must send, and every change the
contract has been through to get there. Before this section existed the only way to see what an
event required was to read its JSON Schema.

**What it sends:** two reads composed into one answer — `GET …/versions/latest`, then
`GET …/versions?limit=500&offset=max(0, latest − 500)`. `latest` is read separately rather than
taken as the last element of the list, because the list is paged: on a long history the default
page would not contain the current version at all. The offset window means the **most recent**
versions are shown, not the founding ones.

| Input | Control | Becomes on the wire | Rules |
|---|---|---|---|
| Event name | free text | the `{name}` path segment | dotted lowercase, ≥ 2 segments, ≤ 255 chars. Checked in the console first, so a malformed name is never sent as a 404 |

**No other input.** No version picker: the answer contains the current contract *and* the history,
because *"what does it say"* and *"how did it get there"* are the same question asked twice.

**Reading the answer:**

* A badge and a sentence on the discipline (**Checked against the previous version** /
  **Registered without a check** / **First version**), with the stored code beneath.
* Field table — label, the exact key a publisher must spell, the kind of value, and
  **Compulsory / Optional**. A field holding a group or a list is marked *"Contents not
  checked"*.
* History, newest first, with the current version marked **In use now**. Each entry lists what
  changed from the version below it — *"Added Contract ID (Text), optional"*, *"Vendor ID is now
  compulsory"*, *"Removed Occurred at"* — computed from the same two members the service's own
  checker compares, so the history never claims to have spotted something the check itself would
  have missed. A version registered without a check carries an amber line naming the version it
  was not compared with.
* **"Show the contract as it is stored"** — the raw JSON Schema, one disclosure away on every
  version. The field table is the console's *reading* of the contract; anyone writing a producer
  or citing the contract in a finding needs the document.

**Worked inputs** (against the seeded local registry):

| Input | What comes back |
|---|---|
| `vendor.onboarding.completed` | v3, **Not checked / NONE**. History: *"Vendor ID is now compulsory"*, *"Removed Occurred at"* — a change that **would have been refused** under a check |
| `supplier.contract.signed` | v2, Checked. History: *"Added Contract ID (Text), optional"*, then v1 as the first version |
| `demo.nested.probe` | `settlement` and `tags` marked *"Contents not checked"* |
| `demo.orphan.probe` | `jurisdiction_code` marked **"Not declared"**, with the warning that the *next* version will be refused for dropping it |
| `demo.nofields.probe` | *"This contract names no fields…"* — every future version of it will pass unexamined |
| `nothing.here.atall` | *"No event is registered under that name…"* (404, reported as a fact rather than an error) |
| `Vendor.Onboarding.Completed` | refused in the console, no request sent |

---

### 3. Register a version

**What it is:** the only write. It appends the next version of one event's payload contract, and
that version is **current from the moment it is stored** — there is no draft state and no
activation step.

`POST /v1/schemas/{eventName}/versions`

| Input | Control | Becomes | What it means, and the rules |
|---|---|---|---|
| **Event name** | free text with suggestions from the register | the `{eventName}` path segment | The register's primary key. Dotted lowercase, at least two segments, ≤ 255 chars (`^[a-z][a-z0-9]*(\.[a-z0-9]+)+$`) — the convention every publisher already follows. **A name already in the register appends the next version to it; a new name starts at version 1.** That single field is the entire difference between "create" and "evolve" |
| **How this version should be checked** | dropdown, 2 values | `compatibility_mode` | *Check it against the current version* (`BACKWARD`) compares this schema with the one in force and refuses anything that would break an existing reader. *Register it without a check* (`NONE`) skips the comparison and records the exemption on the row. Omitted defaults to `BACKWARD`; any other value is refused |
| **Who publishes this event** | free text, optional | `owning_service` | The service that emits it — the first thing anyone asks when a contract breaks. ≤ 255 chars. Nothing verifies that the named service exists |
| **What the payload must contain** | textarea, JSON | `json_schema` | The payload contract. Must be a JSON **object**; must not be `{}`; `properties` and `required` must be in the shape the checker reads. Body capped at **1 MiB**. Payload fields only — the shared envelope fields are not registered here |

**The validation ladder**, in the order the service applies it — worth knowing because the first
failure is the one you are told about:

```
1. is the caller identified?          no → 401
2. is the caller granted SCHEMA_PUBLISH?   no → 403   (unreachable → 503)
3. is the event name well-formed?     no → 400
4. does the body decode?              no → 400   (unknown JSON fields are refused, not ignored)
5. is json_schema a usable contract?  no → 400
6. is owning_service short enough?    no → 400
7. is the mode one we can apply?      no → 400
8. read the current version ────────────► store unreachable → 503
9. mode BACKWARD → compare with it    breaks → 409 + violations
10. INSERT with the version guard     raced → 409
                                      else → 201
```

**Every outcome, and what the console shows:**

| Outcome | Console state | Wording |
|---|---|---|
| `201` | green | *"Registered as version N of …"* — and for a first version it says plainly that nothing was compared |
| `409` with violations | **amber**, not red | the control working as intended: each violation becomes what broke, why it breaks something, and what to do instead |
| `409` without violations | neutral | nothing was wrong with the submission; re-read and resubmit |
| `403` | red | this account lacks permission to publish contracts (`SCHEMA_PUBLISH` named so it can be quoted when asking) |
| `401` | amber | the registry could not tell who was asking — a wiring fault, not a permissions one |
| `503` | amber | permission could not be confirmed, or the store was unreachable. **Nothing was written** |
| `400` | red | the console pre-checks the name, the JSON syntax, the object-ness, `{}` and the mode, so most 400s never leave the browser |

**Worked inputs.** Run in order on a fresh name (`demo.playground.created`):

<details>
<summary><strong>A · First version</strong> — expect green, version 1</summary>

Mode *Check it against the current version*; publisher `playground-svc`.

```json
{
  "type": "object",
  "properties": {
    "tenant_id":   { "type": "string" },
    "occurred_at": { "type": "string" },
    "amount":      { "type": "number" }
  },
  "required": ["tenant_id", "amount"]
}
```
</details>

<details>
<summary><strong>B · Safe evolution</strong> — expect green, version 2</summary>

Adds one optional field. Adding an optional field is always safe.

```json
{
  "type": "object",
  "properties": {
    "tenant_id":   { "type": "string" },
    "occurred_at": { "type": "string" },
    "amount":      { "type": "number" },
    "note":        { "type": "string" }
  },
  "required": ["tenant_id", "amount"]
}
```
</details>

<details>
<summary><strong>C · Breaking change, check on</strong> — expect amber, nothing written, three violations</summary>

Drops a compulsory field, retypes another, and makes a new one compulsory.

```json
{
  "type": "object",
  "properties": {
    "occurred_at": { "type": "integer" },
    "amount":      { "type": "number" },
    "note":        { "type": "string" }
  },
  "required": ["amount", "note"]
}
```

> *Tenant ID has been dropped, and it has to be there* · *Occurred at changed from Text to Whole
> number* · *Note is now compulsory, and nothing sends it yet*
</details>

<details>
<summary><strong>D · The same schema, check off</strong> — expect green, and the register marks it</summary>

Switch to *Register it without a check*. It is stored as version 3, and the register row flips to
amber **Not checked / NONE**. This is the `§17.2` controlled-rollout path: the breaking change is
allowed, and the fact that nobody checked it is now permanent public record.
</details>

<details>
<summary><strong>E · Refusals the console catches itself</strong></summary>

| Input | Message |
|---|---|
| `{"type": "object", "properties": {` | *"That is not valid JSON — …"* |
| `{}` | *"An empty object declares no contract at all…"* |
| `Demo.Playground` / `demoplayground` | the dotted-lowercase rule |
</details>

---

### 4. Limits of the compatibility check

**What it is:** a static panel, no inputs, no requests. Four things the register above cannot
show, recorded on the page because a reader who assumes otherwise would trust the register
further than it can carry:

1. **Outermost fields only** — nothing inside a group or a list is compared.
2. **Compared with the current version only** — anything still reading an older version is not
   considered.
3. **Registration is not enforcement** — nothing validates a published event against its schema.
4. **Anyone signed in can read all of it** — reading asks only that you are identified.

It exists because these are properties of the *service*, invisible in the data. A panel of prose
is the honest way to carry them; the alternative is a register that looks more authoritative than
it is.

---

## Part 4 — Known behaviours that surprise people

Each was confirmed against the running service.

### A breaking change inside a nested field is accepted

The checker never descends. Restructure the inside of a `"type": "object"` field however you like
and `BACKWARD` will pass it. The console marks such fields *"Contents not checked"* rather than
describing their contents, so the table never implies a guarantee that does not exist.

### The mode on a first version was never applied to anything

A first version is stored with `BACKWARD` (or whatever was declared) and **nothing was compared**,
because there was nothing to compare with. Worse, it is not predictive either: each registration
declares its own discipline, so a v1 marked `BACKWARD` does not mean v2 will be checked.

The console therefore renders version 1 as **First version** everywhere — badge, register cell,
and the confirmation message after a write — and excludes it from the "went in unchecked" count.
Reading that row as a clean green *"checked"* asserts a comparison the registry never made.

### `required` may name a field that `properties` never declares

Accepted, silently (verified: `{"properties":{"rule_id":…},"required":["rule_id","jurisdiction_code"]}`
→ 201). Nothing at the boundary or in the database cross-checks the two lists.

The damage lands one version later: the checker compares the lists, finds `jurisdiction_code`
required-and-absent, and refuses the **next** version for "removing" a field that was never
declared. The console flags such a field as **"Not declared"** with that consequence spelled out,
because the register is the only place anyone would notice before it bites.

### A schema that declares no fields at all is accepted

`{"type": "object"}` passes: it has one member, so it is not the `{}` that is refused, and the
shape parses. But with no `properties` and no `required` there is nothing for the checker to hold
later versions to — **every future version of that event passes unexamined** while showing a
reassuring `BACKWARD`. The console says so outright when it reads one.

### A union type is refused

`{"type": ["string", "null"]}` → **400** *"json_schema has a properties/required member the
compatibility checker cannot read"*. The shape parser reads `type` as a plain string, so a union
fails to parse. Refused at registration deliberately: if it were stored, every future version of
that event would fail its compatibility check instead, forever.

### Unknown fields in the body are refused, not ignored

`{"json_schemas": …}` → **400** *invalid request body*. Before `DisallowUnknownFields`, a typo'd
key was discarded and answered *"json_schema is required"* for a field the caller believed they
had sent — and `{"compatibility_mode_": "NONE"}` would have been stored as `BACKWARD`, recording
a discipline nobody asked for.

### The same 409 means two different things

See *The version number belongs to the registry*. The console splits them on the presence of the
`violations` array in the body — **not** on the message text, and not by scraping the array out of
the folded error string. `lib/api/client.ts` preserves the parsed error body (`ApiError.body`)
specifically for this endpoint: folding it into one human string kept only *"incompatible schema
change"*, so every breaking change was reported as a version race, telling readers to retry
something that would fail identically forever.

### Reads need identity but no permission

Any signed-in principal can enumerate the entire catalogue — every event name, every payload
field, every owning service. That is a map of the platform's internals, and it is intentional:
there is no per-entity grant to scope it by, because a contract has no entity. Treat "who can
sign in" as the real access boundary here.

### `envelope_incomplete` is a 401

Not the 400 you would expect from a missing header. Missing tenant authority is classed as an
authentication failure, so a curl caller who forgets `X-Request-Id` sees a 401 whose body names
every field it wanted.

### The database's own guards are `NOT VALID`

All five CHECK constraints apply to new writes only; the existing table was never scanned. A row
predating a rule can hold a value the service would now refuse — including a
`compatibility_mode` that is neither `BACKWARD` nor `NONE`. This is the concrete reason the
console maps an unrecognised mode to **"Needs checking"** and never to the reassuring reading.

### Over-long values used to be reported as an outage

A name or `owning_service` wider than its column reached Postgres, died as SQLSTATE 22001, and
came back as **503 "schema store unavailable"** — an outage status for a value that was simply too
long, sending the reader to look at the database. Both are now checked at the boundary and answer
400.

---

## Part 5 — What the service has that the console does not show

* **`GET /v1/schemas/{name}/versions/{version}`** — a direct fetch of one version by number. The
  console gets every version it needs from the history read, so this route is exercised only by
  tests.
* **Paging parameters on both lists.** The console pins `limit=500` for a history window and takes
  the default 100 for the name list. An installation with more than 100 event types would need
  the register to page — today it would silently show the first 100 names.
* **`/healthz`, `/readyz`** — used by the container healthcheck, not surfaced on the page.

And, by design, there is nothing else: no update, no delete, no validation endpoint, no
subscription, no event emitted on change. The absence is the doctrine.

---

## Where the code lives

| Concern | File |
|---|---|
| Routes, validation ladder, both 409s | `internal/handler/handler.go` |
| The compatibility checker (four violations) | `internal/compat/compat.go` |
| Types, modes, name regex, schema validation | `internal/domain/types.go` |
| Version assignment and the race guard | `internal/store/pg_store.go` |
| Envelope policy for this service | `internal/envelope/contract.go` |
| Authorization gate (fails closed) | `internal/authz/client.go` |
| Schema and constraints | `deployments/migrations/` |
| Console API layer, explainers, contract reader | `lib/api/schemas.ts` |
| Console page and server actions | `app/admin/schemas/` |
| Readable rendering of a contract, a history, a refusal | `components/admin/schemas/SchemaSummary.tsx` |
| The register table | `components/admin/schemas/SchemaRegisterPanel.tsx` |
| The lookup | `components/admin/schemas/SchemaLookup.tsx` |

### A note on the console's wording

Every plain-English label is paired with the stored value beneath it — *"Recorded by the service
as `NONE`"*, and each violation keeps the checker's own sentence under the advice. The wording is
the console's *reading* of the record, not the record itself, and anyone quoting a contract to an
auditor needs what the registry actually holds.

For the same reason, nothing unrecognised is ever mapped to the reassuring reading: an unknown
compatibility mode goes to **"Needs checking"**, a first version to **"First version"**, and a
violation the console cannot parse is shown whole rather than paraphrased into the wrong advice.
Reading an unknown governance value as "checked" is the one mistake this page must not make.

### Running it locally

```bash
docker start schema-registry-svc        # image is prebuilt; DB schema_registry already migrated
curl -H "X-Principal-Id: <uuid>" http://localhost:8093/v1/schemas
docker stop schema-registry-svc
```

It needs `zoiko-postgres` (database `schema_registry`) and `authorization-svc` on :8089 —
without the latter every registration answers 503 by design, while reads keep working.
