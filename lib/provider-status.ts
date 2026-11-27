// The outside provider each Blocks 9-10 service would work with, and whether
// it is connected. None is: every service records what it is given and talks
// only to other ZoikoSuite services. Each page that shows one of these
// services says so beside it, so a record there is never read as the
// provider having done something.
//
// tests/provider-status.test.mjs checks this against the backend source: if a
// service gains an outbound client, or the tax-authority adapter stops being
// off by default, the test fails until this file is brought up to date.

export type ProviderService =
  | "tax-authority-interface-svc"
  | "siem-integration-svc"
  | "carta-svc"
  | "key-management-svc"
  | "banking-connector-svc"
  | "hris-connector-svc"
  | "esignature-integration-svc"
  | "external-data-feed-svc";

export type ProviderStatus = {
  /** The outside system the service would connect to. */
  provider: string;
  /** Always false today; see the file comment. */
  connected: false;
  /** What the service does instead, in one or two sentences. */
  detail: string;
};

export const PROVIDER_STATUS: Record<ProviderService, ProviderStatus> = {
  "tax-authority-interface-svc": {
    provider: "Tax authority (HMRC or another)",
    connected: false,
    detail:
      "The live authority adapter is off by default and no HMRC connector exists, so nothing is submitted to an authority: submissions stay PENDING and Test connection shows the service's refusal.",
  },
  "siem-integration-svc": {
    provider: "SIEM destination (Splunk, Sentinel, Datadog, syslog…)",
    connected: false,
    detail:
      "Events are recorded in ZoikoSuite only. siem-integration-svc has no delivery client, so nothing reaches an exporter's endpoint.",
  },
  "carta-svc": {
    provider: "Service identity (mutual TLS)",
    connected: false,
    detail:
      "Assessments are scored for the signed-in tenant and legal entity. carta-svc has no mutual-TLS listener, so calling services are not yet identified by certificate.",
  },
  "key-management-svc": {
    provider: "Key vault / KMS (AWS KMS, Azure Key Vault, GCP KMS, HSM…)",
    connected: false,
    detail:
      "Keys are registered, rotated and disabled in key-management-svc's own registry. No call is made to an external KMS, so a key ARN is recorded, not checked.",
  },
  "banking-connector-svc": {
    provider: "Bank / open-banking provider",
    connected: false,
    detail:
      "Connections and statements are recorded from what is submitted to banking-connector-svc. Nothing is fetched from a bank.",
  },
  "hris-connector-svc": {
    provider: "HRIS (Workday, SuccessFactors, ADP)",
    connected: false,
    detail: "hris-connector-svc has no provider adapter, so no employee data is synchronised from an HRIS.",
  },
  "esignature-integration-svc": {
    provider: "E-signature provider (DocuSign, Adobe Sign)",
    connected: false,
    detail:
      "Signature profiles are recorded. esignature-integration-svc has no provider adapter, so no envelope is sent for signature.",
  },
  "external-data-feed-svc": {
    provider: "Market-data provider",
    connected: false,
    detail: "Subscriptions are recorded and data is pushed in by callers. external-data-feed-svc calls no provider.",
  },
};
