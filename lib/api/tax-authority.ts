// lib/api/tax-authority.ts
// Registering a tax-authority interface in tax-authority-interface-svc.
//
// Separate from lib/api/tax.ts on purpose: this write goes through the shared
// client (full §4 envelope, the service's refusal folded into the message with
// its status). The service requires X-Purpose-Context on writes and answers
// 400 envelope_incomplete without it.
//
// Registering an interface records it; it does not connect to the authority.
// Submissions stay PENDING while AUTHORITY_ADAPTER_ENABLED is off, and a
// provider_key that is not an approved connector is refused (400).

import { apiPost, type Identity } from "./client";
import type { TaxAuthorityInterface } from "./tax";

export async function registerAuthorityInterface(
  identity: Identity,
  body: { jurisdiction: string; authority_name: string; protocol?: string; provider_key?: string },
) {
  // An interface belongs to the session's legal entity; without one there is
  // nothing to register it for.
  if (!identity.legalEntityId) {
    return { ok: false as const, error: { kind: "http" as const, status: 400, message: "Your session has no legal entity, so an interface cannot be registered." } };
  }
  const payload: Record<string, string> = {
    legal_entity_id: identity.legalEntityId,
    jurisdiction: body.jurisdiction,
    authority_name: body.authority_name,
  };
  if (body.protocol) payload.protocol = body.protocol;
  if (body.provider_key) payload.provider_key = body.provider_key;
  return apiPost<TaxAuthorityInterface>("taxAuthorityInterface", "/v1/tax-authority/interfaces", payload, {
    identity,
    purposeContext: "tax_compliance",
  });
}
