"use server";

// Server Actions for the Block 10 integration services: register a bridge,
// bank connection, HRIS integration or data-feed subscription, manage
// e-signature profiles, and attempt an envelope.
//
// Registering a connection records it; none of these services has a provider
// adapter in this build, so nothing connects to a bank, HRIS, signature or
// market-data provider. An envelope is refused with 503
// esignature_provider_not_configured, and that refusal is returned as it is.

import { refresh } from "next/cache";
import {
  createBridge,
  createBankConnection,
  createHrisIntegration,
  createDataFeedSubscription,
  createEsignatureEnvelope,
  createSignatureProfile,
  getSignatureProfile,
  transitionSignatureProfile,
  type SignatureProfile,
} from "@/lib/api/integration";
import type { CreateState } from "@/components/admin/intelligence/create-state";
import { sessionIdentity, expired, missing, text, checked, toState, show, describeError } from "../intelligence/create-support";

const SESSION_EXPIRED = "Your session has expired — sign in again.";

export async function createBridgeAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const refusal = missing(previous, fd, [
    ["bridge_name", "Bridge name"],
    ["provider_name", "Provider name"],
    ["protocol", "Protocol"],
    ["endpoint_url", "Endpoint URL"],
    ["auth_type", "Auth type"],
  ]);
  if (refusal) return refusal;
  const res = await createBridge(identity, {
    bridge_name: text(fd, "bridge_name"),
    provider_name: text(fd, "provider_name"),
    protocol: text(fd, "protocol"),
    endpoint_url: text(fd, "endpoint_url"),
    auth_type: text(fd, "auth_type"),
  });
  if (res.ok) refresh();
  return toState(previous, fd, res, "connectivity-api-bridge-svc", (b) => [
    ["Bridge ID", show(b.bridge_id)],
    ["Status", show(b.status)],
    ["Bridge name", show(b.bridge_name)],
    ["Provider (as stored)", show(b.provider_name)],
    ["Protocol / auth", `${show(b.protocol)} / ${show(b.auth_type)}`],
  ]);
}

export async function createBankConnectionAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const refusal = missing(previous, fd, [
    ["bank_name", "Bank name"],
    ["bic", "BIC"],
    ["account_number", "Account number"],
    ["currency", "Currency"],
  ]);
  if (refusal) return refusal;
  const res = await createBankConnection(identity, {
    bank_name: text(fd, "bank_name"),
    bic: text(fd, "bic"),
    account_number: text(fd, "account_number"),
    iban: text(fd, "iban") || undefined,
    currency: text(fd, "currency"),
    account_type: text(fd, "account_type") || undefined,
  });
  if (res.ok) refresh();
  // Account number and IBAN are not echoed back to the page.
  return toState(previous, fd, res, "banking-connector-svc", (c) => [
    ["Connection ID", show(c.connection_id)],
    ["Status", show(c.status)],
    ["Bank", `${show(c.bank_name)} (${show(c.bic)})`],
    ["Currency", show(c.currency)],
  ]);
}

export async function createHrisIntegrationAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const refusal = missing(previous, fd, [
    ["provider_name", "Provider name"],
    ["sync_type", "Sync type"],
    ["direction", "Direction"],
    ["api_endpoint", "API endpoint"],
  ]);
  if (refusal) return refusal;
  const res = await createHrisIntegration(identity, {
    provider_name: text(fd, "provider_name"),
    sync_type: text(fd, "sync_type"),
    direction: text(fd, "direction"),
    api_endpoint: text(fd, "api_endpoint"),
  });
  if (res.ok) refresh();
  return toState(previous, fd, res, "hris-connector-svc", (h) => [
    ["Integration ID", show(h.integration_id)],
    ["Status", show(h.status)],
    ["Provider", show(h.provider_name)],
    ["Sync type / direction", `${show(h.sync_type)} / ${show(h.direction)}`],
  ]);
}

export async function createDataFeedAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const refusal = missing(previous, fd, [["provider", "Provider"], ["feed_type", "Feed type"], ["symbol", "Symbol"]]);
  if (refusal) return refusal;
  const res = await createDataFeedSubscription(identity, {
    provider: text(fd, "provider"),
    feed_type: text(fd, "feed_type"),
    symbol: text(fd, "symbol"),
  });
  if (res.ok) refresh();
  return toState(previous, fd, res, "external-data-feed-svc", (f) => [
    ["Feed ID", show(f.feed_id)],
    ["Status", show(f.status)],
    ["Subscription", `${show(f.provider)} ${show(f.feed_type)} ${show(f.symbol)}`],
  ]);
}

// ── eSignature ────────────────────────────────────────────────────────────────

export async function createEnvelopeAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const refusal = missing(previous, fd, [
    ["document_title", "Document title"],
    ["signer_email", "Signer email"],
    ["signer_name", "Signer name"],
    ["provider", "Provider"],
  ]);
  if (refusal) return refusal;
  const res = await createEsignatureEnvelope(identity, {
    document_title: text(fd, "document_title"),
    signer_email: text(fd, "signer_email"),
    signer_name: text(fd, "signer_name"),
    provider: text(fd, "provider"),
  });
  if (res.ok) refresh();
  return toState(previous, fd, res, "esignature-integration-svc", (e) => [
    ["Envelope ID", show(e.envelope_id)],
    ["Status", show(e.status)],
    ["Document", show(e.document_title)],
  ]);
}

export async function createSignatureProfileAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const refusal = missing(previous, fd, [
    ["assurance_level", "Assurance level"],
    ["jurisdiction", "Jurisdiction"],
    ["identity_requirement", "Identity requirement"],
  ]);
  if (refusal) return refusal;
  const res = await createSignatureProfile(identity, {
    assurance_level: text(fd, "assurance_level"),
    jurisdiction: text(fd, "jurisdiction"),
    identity_requirement: text(fd, "identity_requirement"),
    witness_required: checked(fd, "witness_required"),
  });
  return toState(previous, fd, res, "esignature-integration-svc", (p) => [
    ["Profile ID", show(p.profile_id)],
    ["Status", show(p.status)],
    ["Assurance / jurisdiction", `${show(p.assurance_level)} / ${show(p.jurisdiction)}`],
    ["Identity requirement", show(p.identity_requirement)],
    ["Witness required", show(p.witness_required)],
  ]);
}

export type ProfileResult = { ok: true; httpStatus: number; profile: SignatureProfile } | { ok: false; httpStatus?: number; message: string };

/** esignature-integration-svc has no profile list; a profile is read back by its id. */
export async function lookupSignatureProfile(profileId: string): Promise<ProfileResult> {
  const identity = await sessionIdentity();
  if (!identity) return { ok: false, httpStatus: 401, message: SESSION_EXPIRED };
  const id = String(profileId ?? "").trim();
  if (!id) return { ok: false, message: "A profile id is required." };
  const res = await getSignatureProfile(identity, id);
  return res.ok ? { ok: true, httpStatus: 200, profile: res.data } : { ok: false, httpStatus: res.error.status, message: describeError(res.error) };
}

export async function transitionSignatureProfileAction(profileId: string, to: "activate" | "retire"): Promise<ProfileResult> {
  const identity = await sessionIdentity();
  if (!identity) return { ok: false, httpStatus: 401, message: SESSION_EXPIRED };
  if (to !== "activate" && to !== "retire") return { ok: false, message: "Unknown transition." };
  const res = await transitionSignatureProfile(identity, String(profileId ?? ""), to);
  return res.ok ? { ok: true, httpStatus: res.status, profile: res.data } : { ok: false, httpStatus: res.error.status, message: describeError(res.error) };
}
