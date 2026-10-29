// Lightweight health probe for all 7 Tax domain microservices.
// Called by TaxActionHeader (client component) on mount to show live status.
//
// Probes /readyz (not /healthz) — a service that is up but can't reach its
// database is not usable, so we mirror exactly what the Overview dashboard does
// via getSingleDomainHealth() in lib/api/health.ts.
//
// This route must live under /api/backend/* (not /api/v1/*) to keep it
// clearly separated from the business data gateway.

import { NextResponse } from "next/server";
import { serviceUrl, type ServiceName } from "@/lib/api/config";

// `port` is a display label for the status chips only. The probe itself goes
// through serviceUrl(), so env overrides and gateway mode are honoured.
const TAX_SERVICES: readonly { name: string; key: ServiceName; port: number }[] = [
  { name: "tax-rules-svc",             key: "taxRules",              port: 8125 },
  { name: "tax-determination-svc",     key: "taxDetermination",      port: 8126 },
  { name: "vat-gst-svc",               key: "vatGst",                port: 8127 },
  { name: "corporate-tax-svc",         key: "corporateTax",          port: 8128 },
  { name: "withholding-tax-svc",       key: "withholdingTax",        port: 8129 },
  { name: "filing-preparation-svc",    key: "filingPreparation",     port: 8130 },
  { name: "tax-authority-interface-svc", key: "taxAuthorityInterface", port: 8147 },
];

const PROBE_TIMEOUT_MS = 1500;

async function probe(service: ServiceName): Promise<"up" | "down"> {
  try {
    const res = await fetch(`${serviceUrl(service)}/readyz`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok ? "up" : "down";
  } catch {
    return "down";
  }
}

export type TaxServiceHealth = {
  name: string;
  port: number;
  status: "up" | "down";
};

export type TaxHealthResponse = {
  services: TaxServiceHealth[];
  upCount: number;
  total: number;
  allUp: boolean;
  checkedAt: string;
};

export async function GET(): Promise<NextResponse<TaxHealthResponse>> {
  const results = await Promise.all(
    TAX_SERVICES.map(async (svc) => ({
      name: svc.name,
      port: svc.port,
      status: await probe(svc.key),
    }))
  );

  const upCount = results.filter((r) => r.status === "up").length;

  return NextResponse.json({
    services: results,
    upCount,
    total: TAX_SERVICES.length,
    allUp: upCount === TAX_SERVICES.length,
    checkedAt: new Date().toISOString(),
  });
}
