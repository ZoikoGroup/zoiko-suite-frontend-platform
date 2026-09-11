"use server";

import {
  verifyGatewayAuth,
  checkGatewayHealth,
  createPresetRequest,
  generateRS256Token,
  type ForwardAuthVerifyRequest,
  type ForwardAuthVerifyResult,
  type GatewayHealthStatus,
  type ScenarioPreset,
} from "@/lib/api/gateway-auth";

export type TestCaseReport = {
  id: ScenarioPreset;
  title: string;
  category: "POSITIVE" | "NEGATIVE";
  description: string;
  expectedStatus: number;
  actualStatus: number;
  passed: boolean;
  latencyMs: number;
  responseBody: string;
  injectedHeaders: Record<string, string | undefined>;
  notes: string;
};

export async function verifyGatewayAuthAction(
  req: ForwardAuthVerifyRequest
): Promise<ForwardAuthVerifyResult> {
  return await verifyGatewayAuth(req);
}

export async function runPresetScenarioAction(
  preset: ScenarioPreset
): Promise<ForwardAuthVerifyResult & { preset: ScenarioPreset; description: string; expectedStatus: number }> {
  const { request, description, expectedStatus } = createPresetRequest(preset);
  const result = await verifyGatewayAuth(request);
  return {
    ...result,
    preset,
    description,
    expectedStatus,
  };
}

export async function getGatewayStatusAction(): Promise<GatewayHealthStatus> {
  return await checkGatewayHealth();
}

export async function runFullGatewaySuiteAction(): Promise<TestCaseReport[]> {
  const presets: {
    id: ScenarioPreset;
    title: string;
    category: "POSITIVE" | "NEGATIVE";
    expectedStatus: number;
    notes: string;
  }[] = [
    {
      id: "valid",
      title: "TC-01: Valid RS256 JWT (ZOIKO-DEMO Tenant & Active Legal Entity)",
      category: "POSITIVE",
      expectedStatus: 200,
      notes: "Expects HTTP 200 with all 7 downstream headers injected (X-Principal-Id, X-Tenant-Id, X-Legal-Entity-Id, X-Jurisdiction-Context, etc.)",
    },
    {
      id: "missing_auth",
      title: "TC-02: Missing Authorization Header",
      category: "NEGATIVE",
      expectedStatus: 401,
      notes: "Expects HTTP 401 Unauthorized with 'missing bearer token' error body.",
    },
    {
      id: "invalid_signature",
      title: "TC-03: Malformed / Untrusted JWT Signature",
      category: "NEGATIVE",
      expectedStatus: 401,
      notes: "Expects HTTP 401 Unauthorized with 'invalid token' error body.",
    },
    {
      id: "expired_token",
      title: "TC-04: Expired Token (Past exp Claim)",
      category: "NEGATIVE",
      expectedStatus: 401,
      notes: "Expects HTTP 401 Unauthorized with 'invalid token' (token is expired).",
    },
    {
      id: "hostname_mismatch",
      title: "TC-05: GTRM Hostname-Resolved Tenant Mismatch",
      category: "NEGATIVE",
      expectedStatus: 403,
      notes: "Header X-Zoiko-Resolved-Tenant-Id != claims.tenant_id -> HTTP 403 'token tenant does not match the hostname-resolved tenant'.",
    },
    {
      id: "entity_not_in_tenant",
      title: "TC-06: GOV-01 Cross-Tenant Isolation (Entity Not In Tenant)",
      category: "NEGATIVE",
      expectedStatus: 403,
      notes: "Legal entity not owned by tenant in tenant_entity_registry -> HTTP 403 with x-tenant-context: denied.",
    },
    {
      id: "unknown_tenant",
      title: "TC-07: Unknown / Unregistered Tenant ID",
      category: "NEGATIVE",
      expectedStatus: 403,
      notes: "Tenant ID missing from registry -> HTTP 403 with x-tenant-context: denied.",
    },
  ];

  const reports: TestCaseReport[] = [];

  for (const item of presets) {
    const { request, description } = createPresetRequest(item.id);
    const result = await verifyGatewayAuth(request);
    const passed = result.statusCode === item.expectedStatus;

    reports.push({
      id: item.id,
      title: item.title,
      category: item.category,
      description,
      expectedStatus: item.expectedStatus,
      actualStatus: result.statusCode,
      passed,
      latencyMs: result.latencyMs,
      responseBody: result.body,
      injectedHeaders: result.injectedHeaders,
      notes: item.notes,
    });
  }

  return reports;
}

export async function generateCustomSignedTokenAction(claims: {
  principalId: string;
  tenantId: string;
  legalEntityId: string;
  expMinutes: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "identity-context-svc",
    aud: "zoiko-internal",
    exp: now + claims.expMinutes * 60,
    principal: { principal_id: claims.principalId },
    tenant_id: claims.tenantId,
    legal_entity_id: claims.legalEntityId,
    correlation_id: `corr-manual-${Date.now()}`,
  };

  return generateRS256Token(payload);
}
