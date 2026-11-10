"use server";

// Server Actions for the Block 9 security services: issue an mTLS
// certificate, register and disable customer-key metadata, register a SIEM
// exporter and record a test event against it.
//
// The identity is the session's. Nothing here is logged: the mTLS private key
// in particular is returned to the one browser that asked for it and is not
// written anywhere on the way.

import { refresh } from "next/cache";
import {
  provisionMtlsCertificate,
  registerKmsKey,
  disableKmsKey,
  createSiemExporter,
  streamSiemEvent,
  listSiemExporters,
  listSiemEvents,
  type KeyModel,
  type KeyProvider,
  type SiemPlatform,
  type EventSeverity,
  type SiemExporter,
  type SiemEvent,
  type MtlsCertificate,
} from "@/lib/api/security-trust";
import type { CreateState } from "@/components/admin/intelligence/create-state";
import { siemStatusText } from "@/components/admin/security-trust/siem-caveat";
import { sessionIdentity, expired, missing, invalid, text, toState, show, describeError } from "../intelligence/create-support";

const SESSION_EXPIRED = "Your session has expired — sign in again.";

// ── mTLS ──────────────────────────────────────────────────────────────────────

export type IssueCertificateResult =
  | {
      ok: true;
      httpStatus: number;
      certificate: Pick<MtlsCertificate, "id" | "status" | "service_name" | "common_name" | "serial_number" | "fingerprint" | "valid_to" | "issuer">;
      /** Returned once by mtls-management-svc and never stored by it or by the console. */
      privateKeyPem: string;
      certificatePem: string;
      caCertificatePem: string;
    }
  | { ok: false; httpStatus?: number; message: string };

/**
 * Issue a certificate. Called directly rather than through useActionState so
 * the client can drop the private key from its state when the dialog closes.
 */
export async function issueMtlsCertificateAction(input: {
  service_name: string;
  common_name: string;
  rotation_days: string;
  auto_rotate: boolean;
}): Promise<IssueCertificateResult> {
  const identity = await sessionIdentity();
  if (!identity) return { ok: false, httpStatus: 401, message: SESSION_EXPIRED };
  const serviceName = String(input.service_name ?? "").trim();
  const commonName = String(input.common_name ?? "").trim();
  const rotationRaw = String(input.rotation_days ?? "").trim();
  if (!serviceName) return { ok: false, message: "Service name is required." };
  if (!commonName) return { ok: false, message: "Common name is required." };
  if (!rotationRaw) return { ok: false, message: "Rotation days is required." };
  const rotationDays = Number(rotationRaw);
  // The service treats 0 or less as "use 90"; the console sends only what the reader chose.
  if (!Number.isInteger(rotationDays) || rotationDays < 1) {
    return { ok: false, message: "Rotation days must be a whole number of at least 1." };
  }
  const res = await provisionMtlsCertificate(identity, {
    service_name: serviceName,
    common_name: commonName,
    rotation_days: rotationDays,
    auto_rotate: Boolean(input.auto_rotate),
  });
  if (!res.ok) return { ok: false, httpStatus: res.error.status, message: describeError(res.error) };
  if (!res.data?.certificate?.id || !res.data.private_key_pem) {
    return { ok: false, httpStatus: res.status, message: "mtls-management-svc answered without a certificate and key." };
  }
  refresh();
  const c = res.data.certificate;
  return {
    ok: true,
    httpStatus: res.status,
    certificate: {
      id: c.id,
      status: c.status,
      service_name: c.service_name,
      common_name: c.common_name,
      serial_number: c.serial_number,
      fingerprint: c.fingerprint,
      valid_to: c.valid_to,
      issuer: c.issuer,
    },
    privateKeyPem: res.data.private_key_pem,
    certificatePem: c.certificate_pem,
    caCertificatePem: res.data.ca_certificate_pem,
  };
}

// ── Key management (metadata only) ────────────────────────────────────────────

export async function registerKeyAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const refusal = missing(previous, fd, [["key_alias", "Key alias"], ["key_model", "Key model"], ["key_provider", "Key provider"]]);
  if (refusal) return refusal;
  const res = await registerKmsKey(identity, {
    key_alias: text(fd, "key_alias"),
    key_model: text(fd, "key_model") as KeyModel,
    key_provider: text(fd, "key_provider") as KeyProvider,
    external_key_arn: text(fd, "external_key_arn") || undefined,
  });
  if (res.ok) refresh();
  return toState(previous, fd, res, "key-management-svc", (k) => [
    ["Key ID", show(k.id)],
    ["State", show(k.state)],
    ["Alias", show(k.key_alias)],
    ["Model / provider", `${show(k.key_model)} / ${show(k.key_provider)}`],
    ["External key reference", show(k.external_key_arn)],
    ["Version", show(k.key_version)],
  ]);
}

export async function disableKeyAction(keyId: string): Promise<{ ok: true; message: string } | { ok: false; httpStatus?: number; message: string }> {
  const identity = await sessionIdentity();
  if (!identity) return { ok: false, httpStatus: 401, message: SESSION_EXPIRED };
  if (!keyId) return { ok: false, message: "A key id is required." };
  const res = await disableKmsKey(identity, keyId);
  if (!res.ok) return { ok: false, httpStatus: res.error.status, message: describeError(res.error) };
  refresh();
  return { ok: true, message: `key-management-svc answered ${res.status}: ${res.data?.message ?? "no message"}` };
}

// ── SIEM ──────────────────────────────────────────────────────────────────────

export async function createSiemExporterAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const secret = ["auth_token"];
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd, secret);
  const refusal = missing(previous, fd, [["name", "Name"], ["platform", "Platform"], ["endpoint_url", "Endpoint URL"]], [], secret);
  if (refusal) return refusal;
  const res = await createSiemExporter(identity, {
    name: text(fd, "name"),
    platform: text(fd, "platform") as SiemPlatform,
    endpoint_url: text(fd, "endpoint_url"),
    auth_token: text(fd, "auth_token") || undefined,
  });
  if (res.ok) refresh();
  return toState(
    previous,
    fd,
    res,
    "siem-integration-svc",
    (x) => [
      ["Exporter ID", show(x.id)],
      ["Status", show(x.status)],
      ["Name / platform", `${show(x.name)} / ${show(x.platform)}`],
      ["Endpoint (not contacted)", show(x.endpoint_url)],
      ["Events recorded", show(x.events_sent)],
    ],
    secret,
  );
}

export async function sendSiemTestEventAction(previous: CreateState, fd: FormData): Promise<CreateState> {
  const identity = await sessionIdentity();
  if (!identity) return expired(previous, fd);
  const refusal = missing(previous, fd, [
    ["exporter_id", "Exporter"],
    ["source_service", "Source service"],
    ["event_type", "Event type"],
    ["severity", "Severity"],
    ["message", "Message"],
  ]);
  if (refusal) return refusal;
  const payload = text(fd, "payload");
  if (payload) {
    try {
      JSON.parse(payload);
    } catch {
      return invalid(previous, fd, "Payload must be JSON, or left blank.");
    }
  }
  const res = await streamSiemEvent(identity, {
    exporter_id: text(fd, "exporter_id"),
    source_service: text(fd, "source_service"),
    event_type: text(fd, "event_type"),
    severity: text(fd, "severity") as EventSeverity,
    message: text(fd, "message"),
    payload: payload || undefined,
  });
  if (res.ok) refresh();
  const state = toState(previous, fd, res, "siem-integration-svc", (e) => [
    ["Event ID", show(e.id)],
    // The stored status is shown only beside what it means: nothing was sent.
    ["Status", siemStatusText(show(e.status))],
    ["Exporter", show(e.exporter_id)],
    ["Event", `${show(e.severity)} ${show(e.event_type)}`],
  ]);
  if (state.status === "created") {
    state.message = "Event recorded by siem-integration-svc — no external delivery is configured; nothing was sent to the exporter's endpoint.";
  }
  return state;
}

export async function loadSiemExporters(): Promise<{ ok: true; exporters: SiemExporter[] } | { ok: false; message: string }> {
  const identity = await sessionIdentity();
  if (!identity) return { ok: false, message: SESSION_EXPIRED };
  const res = await listSiemExporters(identity);
  return res.ok ? { ok: true, exporters: res.data } : { ok: false, message: res.error.message };
}

export async function loadSiemEvents(exporterId: string): Promise<{ ok: true; events: SiemEvent[] } | { ok: false; message: string }> {
  const identity = await sessionIdentity();
  if (!identity) return { ok: false, message: SESSION_EXPIRED };
  if (!exporterId) return { ok: false, message: "An exporter id is required." };
  const res = await listSiemEvents(identity, exporterId);
  if (!res.ok) return { ok: false, message: res.error.message };
  return { ok: true, events: [...res.data].sort((a, b) => b.timestamp.localeCompare(a.timestamp)) };
}
