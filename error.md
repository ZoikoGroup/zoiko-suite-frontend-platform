# Errors found while testing policy-svc through the console

## Issue 1 — Create a policy / Add a draft version / Activate a version all fail with 401

Observed:
```
create a policy returned: policy-svc rejected the write (401) — missing_principal:
X-Principal-Id is required — the gateway sets it from a verified identity envelope

add a draft version returned: same 401
activate a version returned: same 401
```

Root cause:
The three write calls in `lib/api/policies.ts` (`createPolicy`, `createPolicyVersion`,
`activatePolicyVersion`) posted their body to `apiPost` but never passed the caller
identity object, so `identityHeaders()` produced no `X-Principal-Id` header. policy-svc
requires the principal header on every write (it is what the gateway would have set from
a verified envelope), so each write failed closed with 401 `missing_principal`. Only
`evaluatePolicy` forwarded `identity`, which is why evaluation already worked.

Fix (in `lib/api/policies.ts`):
- `createPolicy` → added 4th arg `{ identity: { principalId: input.principalId } }`
- `createPolicyVersion` → added `{ identity: { principalId: input.principalId } }`
- `activatePolicyVersion` → added `{ identity: { principalId: input.principalId } }`

Verified: `npx eslint lib/api/policies.ts` clean; FE dev server hot-reloads the change.

Result now:
- Create a policy → green success banner + policy JSON (201), gray "already existed"
  banner on replay (200), red conflict banner on same-code-different-name (409).
- Add a draft version → green "Version created as DRAFT…" (201), gray replay (200).
- Activate a version → green "Version is now ACTIVE…" (200), supersede of prior holder.

## Issue 2 — Active policy set output formatting

Observed paste (from the “Active policy set = Global” read):
```
PO_APPROVAL_10K decides
policy a543fb58…bb52
version 855d107c…e1f4
Global 50,000 06 Aug 2026 → open 07 Aug 2026, 17:04 by 33333333…3333
```
This is the **correct** output, not an error — it is one ACTIVE **global** version of
`PO_APPROVAL_10K` (threshold 50,000, effective 06 Aug 2026 → open, activated 07 Aug
2026 17:04 by principal `3333…`). The pasted line breaks came from copying the card
markup. Correct readings per scope:

- `Global` → the one global version (50,000), as pasted above.
- `This tenant` → tenant 20,000 + leftover `SPEND-LIMIT-V1` + global 50,000.
- `This legal entity` → entity 10,000 (top row = what evaluation uses) + tenant 20,000
  + `SPEND-LIMIT-V1` + global 50,000.