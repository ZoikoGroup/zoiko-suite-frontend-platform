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

const TAX_SERVICES = [
  { name: "tax-rules-svc",             port: 8125 },
  { name: "tax-determination-svc",     port: 8126 },
  { name: "vat-gst-svc",               port: 8127 },
  { name: "corporate-tax-svc",         port: 8128 },
  { name: "withholding-tax-svc",       port: 8129 },
  { name: "filing-preparation-svc",    port: 8130 },
  { name: "tax-authority-interface-svc", port: 8147 },
] as const;

const PROBE_TIMEOUT_MS = 1500;

async function probe(port: number): Promise<"up" | "down"> {
  try {
    const res = await fetch(`http://localhost:${port}/readyz`, {
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
      status: await probe(svc.port),
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
