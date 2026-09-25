"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Play,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Server,
  Key,
  Lock,
  ArrowRight,
  Sparkles,
  Zap,
  Clock,
  Fingerprint,
  Info,
  Layers,
  Terminal,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from "@/components/ui";
import { FIELD, LABEL, HINT } from "@/components/admin/shared/form";
import {
  verifyGatewayAuthAction,
  runPresetScenarioAction,
  runFullGatewaySuiteAction,
  getGatewayStatusAction,
  generateCustomSignedTokenAction,
  type TestCaseReport,
} from "@/app/admin/identity/gateway-actions";
import type { ForwardAuthVerifyResult, GatewayHealthStatus, ScenarioPreset } from "@/lib/api/gateway-auth";

const PRESETS: {
  id: ScenarioPreset;
  title: string;
  type: "positive" | "negative";
  badge: string;
  desc: string;
}[] = [
  {
    id: "valid",
    title: "TC-01: Valid RS256 JWT",
    type: "positive",
    badge: "200 OK",
    desc: "Valid RS256 token matching JWKS with registered ZOIKO-DEMO tenant and active UK entity.",
  },
  {
    id: "missing_auth",
    title: "TC-02: Missing Auth Header",
    type: "negative",
    badge: "401 Missing",
    desc: "Unauthenticated request without Authorization bearer token at edge gateway.",
  },
  {
    id: "invalid_signature",
    title: "TC-03: Invalid Signature",
    type: "negative",
    badge: "401 Invalid",
    desc: "Tampered or forged token signed with unknown private key not in JWKS.",
  },
  {
    id: "expired_token",
    title: "TC-04: Expired Token",
    type: "negative",
    badge: "401 Expired",
    desc: "Token expired past its exp claim (tested with exp in the past).",
  },
  {
    id: "hostname_mismatch",
    title: "TC-05: Hostname Mismatch",
    type: "negative",
    badge: "403 Mismatch",
    desc: "GTRM tenant resolution mismatch: X-Zoiko-Resolved-Tenant-Id differs from claims.tenant_id.",
  },
  {
    id: "entity_not_in_tenant",
    title: "TC-06: Entity Not In Tenant",
    type: "negative",
    badge: "403 Denied",
    desc: "GOV-01 Cross-Tenant Isolation: legal entity is not owned by or mapped to the tenant.",
  },
  {
    id: "unknown_tenant",
    title: "TC-07: Unknown Tenant",
    type: "negative",
    badge: "403 Denied",
    desc: "Tenant ID in token does not exist or is inactive in tenant_entity_registry.",
  },
];

export function GatewayAuthWorkbench() {
  const [activeTab, setActiveTab] = useState<"simulator" | "testsuite" | "studio" | "arch">("simulator");
  const [isPending, startTransition] = useTransition();

  // Health Status
  const [gatewayStatus, setGatewayStatus] = useState<GatewayHealthStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Simulator Form State
  const [selectedPreset, setSelectedPreset] = useState<ScenarioPreset>("valid");
  const [bearerToken, setBearerToken] = useState("");
  const [forwardedUri, setForwardedUri] = useState("/admin/finance");
  const [forwardedMethod, setForwardedMethod] = useState("GET");
  const [resolvedTenantId, setResolvedTenantId] = useState("");
  const [verifyResult, setVerifyResult] = useState<ForwardAuthVerifyResult | null>(null);
  const [activeScenarioDesc, setActiveScenarioDesc] = useState<string>("");

  // Test Suite State
  const [suiteResults, setSuiteResults] = useState<TestCaseReport[]>([]);
  const [suiteRunning, setSuiteRunning] = useState(false);

  // Token Studio State
  const [studioPrincipalId, setStudioPrincipalId] = useState("33333333-3333-3333-3333-333333333333");
  const [studioTenantId, setStudioTenantId] = useState("11111111-1111-1111-1111-111111111111");
  const [studioLegalEntityId, setStudioLegalEntityId] = useState("22222222-2222-2222-2222-222222222222");
  const [studioExpMinutes, setStudioExpMinutes] = useState(60);
  const [generatedToken, setGeneratedToken] = useState("");

  // Load initial health status & default preset
  const refreshHealth = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await getGatewayStatusAction();
      setGatewayStatus(res);
    } catch {
      // Ignored
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadPreset = useCallback(async (preset: ScenarioPreset) => {
    setSelectedPreset(preset);
    startTransition(async () => {
      const res = await runPresetScenarioAction(preset);
      setVerifyResult(res);
      setActiveScenarioDesc(res.description);
      if (preset === "hostname_mismatch") {
        setResolvedTenantId("88888888-8888-8888-8888-888888888888");
      } else {
        setResolvedTenantId("");
      }
    });
  }, []);

  useEffect(() => {
    refreshHealth();
    loadPreset("valid");
  }, [refreshHealth, loadPreset]);

  // Execute custom verification
  const handleVerify = () => {
    startTransition(async () => {
      const res = await verifyGatewayAuthAction({
        authorization: bearerToken.trim() ? (bearerToken.startsWith("Bearer ") ? bearerToken : `Bearer ${bearerToken}`) : undefined,
        forwardedUri: forwardedUri.trim() || undefined,
        forwardedMethod: forwardedMethod.trim() || undefined,
        resolvedTenantId: resolvedTenantId.trim() || undefined,
      });
      setVerifyResult(res);
      setActiveScenarioDesc("Custom Verification Run");
    });
  };

  // Run full QA suite
  const handleRunFullSuite = async () => {
    setSuiteRunning(true);
    try {
      const reports = await runFullGatewaySuiteAction();
      setSuiteResults(reports);
    } finally {
      setSuiteRunning(false);
    }
  };

  // Generate custom token in studio
  const handleGenerateCustomToken = async () => {
    startTransition(async () => {
      const token = await generateCustomSignedTokenAction({
        principalId: studioPrincipalId.trim(),
        tenantId: studioTenantId.trim(),
        legalEntityId: studioLegalEntityId.trim(),
        expMinutes: Number(studioExpMinutes),
      });
      setGeneratedToken(token);
    });
  };

  const handleUseInSimulator = () => {
    if (!generatedToken) return;
    setBearerToken(`Bearer ${generatedToken}`);
    setActiveTab("simulator");
  };

  const suitePassedCount = suiteResults.filter((r) => r.passed).length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Service Status */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-xl border bg-gradient-to-r from-slate-900 via-navy-900 to-indigo-950 text-white shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/30">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                gateway-auth-svc
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                  PORT :8092
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono border border-blue-500/30">
                  ForwardAuth
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                Stateless Edge Guard • JWKS RSA Signature Verification • GOV-01 Multi-Tenant Context Resolution
              </p>
            </div>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 text-xs font-mono">
            <Server className="h-3.5 w-3.5 text-slate-300" />
            <span className="text-slate-300">/readyz:</span>
            {gatewayStatus?.readyz.ok ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Ready (200)
              </span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1">
                <XCircle className="h-3 w-3" /> Down
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 text-xs font-mono">
            <Key className="h-3.5 w-3.5 text-slate-300" />
            <span className="text-slate-300">JWKS (:8080):</span>
            {gatewayStatus?.jwksAvailable ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> {gatewayStatus.jwksKeysCount} Key(s)
              </span>
            ) : (
              <span className="text-amber-400">Offline</span>
            )}
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={refreshHealth}
            disabled={statusLoading}
            className="h-8 border-white/20 bg-white/5 hover:bg-white/10 text-white text-xs gap-1.5"
          >
            <RefreshCw className={`h-3 w-3 ${statusLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab("simulator")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "simulator"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Play className="h-4 w-4" />
          ForwardAuth Simulator
        </button>
        <button
          onClick={() => setActiveTab("testsuite")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "testsuite"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Zap className="h-4 w-4" />
          Full QA Test Suite
          {suiteResults.length > 0 && (
            <span className="ml-1 px-2 py-0.2 text-xs rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {suitePassedCount}/{suiteResults.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("studio")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "studio"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Fingerprint className="h-4 w-4" />
          JWT Envelope Studio
        </button>
        <button
          onClick={() => setActiveTab("arch")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "arch"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="h-4 w-4" />
          Security Architecture
        </button>
      </div>

      {/* TAB 1: ForwardAuth Simulator */}
      {activeTab === "simulator" && (
        <div className="space-y-6">
          {/* Preset Buttons Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Select QA Test Scenario Preset
              </label>
              <span className="text-xs text-muted-foreground">Clicking a preset automatically tests :8092/verify</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {PRESETS.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                const isPos = preset.type === "positive";
                return (
                  <button
                    key={preset.id}
                    onClick={() => loadPreset(preset.id)}
                    className={`p-3 rounded-lg border text-left transition-all relative overflow-hidden group ${
                      isSelected
                        ? isPos
                          ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-500"
                          : "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 ring-1 ring-indigo-500"
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-semibold text-xs text-foreground truncate">{preset.title}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                          isPos
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
                        }`}
                      >
                        {preset.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{preset.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Simulator Console & Results */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Request Parameters */}
            <div className="lg:col-span-5 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-primary" />
                      ForwardAuth Edge Request
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">GET /verify</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Configure the inbound HTTP headers presented to Traefik edge reverse proxy.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 text-xs">
                  <div>
                    <label className={LABEL}>Target Forwarded URI</label>
                    <input
                      type="text"
                      className={FIELD}
                      value={forwardedUri}
                      onChange={(e) => setForwardedUri(e.target.value)}
                      placeholder="/admin/finance"
                    />
                    <p className={HINT}>Passed in X-Forwarded-Uri header</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>HTTP Method</label>
                      <select
                        className={FIELD}
                        value={forwardedMethod}
                        onChange={(e) => setForwardedMethod(e.target.value)}
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="DELETE">DELETE</option>
                      </select>
                    </div>

                    <div>
                      <label className={LABEL}>X-Zoiko-Resolved-Tenant-Id</label>
                      <input
                        type="text"
                        className={FIELD}
                        value={resolvedTenantId}
                        onChange={(e) => setResolvedTenantId(e.target.value)}
                        placeholder="Optional (GTRM match)"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={LABEL}>Custom Bearer Token (Optional Override)</label>
                    <textarea
                      rows={3}
                      className={`${FIELD} font-mono text-[11px]`}
                      value={bearerToken}
                      onChange={(e) => setBearerToken(e.target.value)}
                      placeholder="Leave empty to use active preset token, or paste your own..."
                    />
                    <p className={HINT}>Leave empty to retain scenario preset token</p>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <Button onClick={handleVerify} disabled={isPending} className="w-full gap-2 text-xs">
                      {isPending ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Verifying...
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" /> Execute /verify
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Active Scenario Info Box */}
              {activeScenarioDesc && (
                <div className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-900/50 space-y-1.5 text-xs">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 text-blue-500" />
                    Active Scenario Details
                  </div>
                  <p className="text-muted-foreground">{activeScenarioDesc}</p>
                </div>
              )}
            </div>

            {/* Right: Verification Response & Injected Headers */}
            <div className="lg:col-span-7 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-primary" />
                      Gateway Decision & Downstream Headers
                    </span>
                    {verifyResult && (
                      <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {verifyResult.latencyMs}ms
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4 text-xs">
                  {verifyResult ? (
                    <>
                      {/* Big Decision Badge */}
                      <div
                        className={`p-4 rounded-xl border flex items-center justify-between ${
                          verifyResult.statusCode === 200
                            ? "bg-emerald-50 border-emerald-200 text-emerald-950 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-200"
                            : verifyResult.statusCode === 401
                            ? "bg-amber-50 border-amber-200 text-amber-950 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-200"
                            : "bg-rose-50 border-rose-200 text-rose-950 dark:bg-rose-950/20 dark:border-rose-800 dark:text-rose-200"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {verifyResult.statusCode === 200 ? (
                            <ShieldCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                          ) : verifyResult.statusCode === 401 ? (
                            <ShieldAlert className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <ShieldX className="h-8 w-8 text-rose-600 dark:text-rose-400" />
                          )}
                          <div>
                            <div className="font-mono font-bold text-lg">
                              HTTP {verifyResult.statusCode} {verifyResult.statusText || (verifyResult.statusCode === 200 ? "OK" : "DENIED")}
                            </div>
                            <div className="text-xs font-sans opacity-90">
                              {verifyResult.statusCode === 200
                                ? "Authentication & Governance Validation Passed. Request allowed forward."
                                : verifyResult.statusCode === 401
                                ? "Authentication Failed: Token missing, invalid, or expired."
                                : "Authorization / Isolation Blocked: Hostname or Legal Entity mismatch."}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider font-mono ${
                            verifyResult.statusCode === 200
                              ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200"
                              : "bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200"
                          }`}
                        >
                          {verifyResult.statusCode === 200 ? "ALLOWED" : "BLOCKED"}
                        </span>
                      </div>

                      {/* Injected Downstream Headers Table (For 200 OK) */}
                      {verifyResult.statusCode === 200 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs text-foreground uppercase tracking-wider">
                              Downstream Forwarded Headers (Injected by Gateway)
                            </span>
                            <span className="text-[11px] text-muted-foreground">Passed downstream to microservices</span>
                          </div>

                          <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                            <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800">
                              <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold text-muted-foreground text-[11px]">
                                <tr>
                                  <th className="py-2 px-3">Header Name</th>
                                  <th className="py-2 px-3">Injected Value</th>
                                  <th className="py-2 px-3">Source / Governance Scope</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 font-mono text-[11px]">
                                <tr>
                                  <td className="py-2 px-3 font-semibold text-primary">X-Principal-Id</td>
                                  <td className="py-2 px-3 text-foreground break-all">
                                    {verifyResult.injectedHeaders.principalId || "—"}
                                  </td>
                                  <td className="py-2 px-3 font-sans text-muted-foreground">Token claims.principal</td>
                                </tr>
                                <tr>
                                  <td className="py-2 px-3 font-semibold text-primary">X-Tenant-Id</td>
                                  <td className="py-2 px-3 text-foreground break-all">
                                    {verifyResult.injectedHeaders.tenantId || "—"}
                                  </td>
                                  <td className="py-2 px-3 font-sans text-muted-foreground">ZOIKO-DEMO Tenant</td>
                                </tr>
                                <tr>
                                  <td className="py-2 px-3 font-semibold text-primary">X-Legal-Entity-Id</td>
                                  <td className="py-2 px-3 text-foreground break-all">
                                    {verifyResult.injectedHeaders.legalEntityId || "—"}
                                  </td>
                                  <td className="py-2 px-3 font-sans text-muted-foreground">ZOIKO-DEMO-UK (Entity Registry)</td>
                                </tr>
                                <tr>
                                  <td className="py-2 px-3 font-semibold text-primary">X-Jurisdiction-Context</td>
                                  <td className="py-2 px-3 text-foreground break-all">
                                    {verifyResult.injectedHeaders.jurisdictionContext || "—"}
                                  </td>
                                  <td className="py-2 px-3 font-sans text-muted-foreground">Primary jurisdiction assignment</td>
                                </tr>
                                <tr>
                                  <td className="py-2 px-3 font-semibold text-primary">X-Timezone</td>
                                  <td className="py-2 px-3 text-foreground">
                                    {verifyResult.injectedHeaders.timezone || "—"}
                                  </td>
                                  <td className="py-2 px-3 font-sans text-muted-foreground">Entity registry primary timezone</td>
                                </tr>
                                <tr>
                                  <td className="py-2 px-3 font-semibold text-primary">X-Residency-Policy-Id</td>
                                  <td className="py-2 px-3 text-foreground break-all">
                                    {verifyResult.injectedHeaders.residencyPolicyId || "—"}
                                  </td>
                                  <td className="py-2 px-3 font-sans text-muted-foreground">Data residency policy mapping</td>
                                </tr>
                                <tr>
                                  <td className="py-2 px-3 font-semibold text-primary">X-Correlation-Id</td>
                                  <td className="py-2 px-3 text-foreground break-all">
                                    {verifyResult.injectedHeaders.correlationId || "—"}
                                  </td>
                                  <td className="py-2 px-3 font-sans text-muted-foreground">Trace correlation ID</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Error Body / Rejection Detail (For Non-200) */}
                      {verifyResult.statusCode !== 200 && (
                        <div className="space-y-2">
                          <span className="font-semibold text-xs text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                            Gateway Rejection Reason / Response Body
                          </span>
                          <div className="p-3 rounded-lg border bg-rose-50 dark:bg-rose-950/30 font-mono text-xs text-rose-800 dark:text-rose-300">
                            {verifyResult.body ? verifyResult.body : "(No body returned by gateway)"}
                          </div>
                          {verifyResult.headers["x-tenant-context"] && (
                            <div className="text-[11px] text-muted-foreground">
                              Header <span className="font-mono font-semibold">x-tenant-context</span>:{" "}
                              <span className="font-mono text-rose-600 dark:text-rose-400">
                                {verifyResult.headers["x-tenant-context"]}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Raw Response Headers */}
                      <details className="text-[11px] text-muted-foreground group">
                        <summary className="cursor-pointer font-medium hover:text-foreground">
                          View All Raw Response Headers ({Object.keys(verifyResult.headers).length})
                        </summary>
                        <pre className="mt-2 p-3 rounded-lg bg-slate-900 text-slate-200 font-mono text-[10px] overflow-x-auto max-h-48">
                          {JSON.stringify(verifyResult.headers, null, 2)}
                        </pre>
                      </details>
                    </>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Lock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      Select a scenario above or click Execute to test gateway-auth-svc.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Full QA Test Suite */}
      {activeTab === "testsuite" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Automated Gateway QA Acceptance Matrix
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Executes all 7 positive and negative ForwardAuth security test cases against gateway-auth-svc :8092.
                  </CardDescription>
                </div>

                <Button
                  onClick={handleRunFullSuite}
                  disabled={suiteRunning}
                  className="gap-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Play className={`h-3.5 w-3.5 ${suiteRunning ? "animate-spin" : ""}`} />
                  {suiteRunning ? "Executing Test Matrix..." : "Run All 7 QA Test Cases"}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {suiteResults.length > 0 ? (
                <>
                  {/* Summary Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/40 text-center">
                      <div className="text-xs text-muted-foreground uppercase font-semibold">Total Cases</div>
                      <div className="text-xl font-bold text-foreground font-mono">{suiteResults.length}</div>
                    </div>
                    <div className="p-3 rounded-lg border bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800 text-center">
                      <div className="text-xs text-emerald-700 dark:text-emerald-400 uppercase font-semibold">Passed</div>
                      <div className="text-xl font-bold text-emerald-600 font-mono">{suitePassedCount}</div>
                    </div>
                    <div className="p-3 rounded-lg border bg-rose-50/50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800 text-center">
                      <div className="text-xs text-rose-700 dark:text-rose-400 uppercase font-semibold">Failed</div>
                      <div className="text-xl font-bold text-rose-600 font-mono">
                        {suiteResults.length - suitePassedCount}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border bg-indigo-50/50 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-800 text-center">
                      <div className="text-xs text-indigo-700 dark:text-indigo-400 uppercase font-semibold">Pass Rate</div>
                      <div className="text-xl font-bold text-indigo-600 font-mono">
                        {Math.round((suitePassedCount / suiteResults.length) * 100)}%
                      </div>
                    </div>
                  </div>

                  {/* Test Cases Table */}
                  <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                    <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 font-semibold text-muted-foreground text-[11px]">
                        <tr>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Test Scenario</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Expected</th>
                          <th className="py-2.5 px-3">Actual</th>
                          <th className="py-2.5 px-3">Latency</th>
                          <th className="py-2.5 px-3">Response Detail</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-[11px]">
                        {suiteResults.map((tc) => (
                          <tr key={tc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                            <td className="py-2 px-3">
                              {tc.passed ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Pass
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                  <XCircle className="h-3 w-3 text-rose-600" /> Fail
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-medium text-foreground">
                              <div>{tc.title}</div>
                              <div className="text-[10px] text-muted-foreground">{tc.description}</div>
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                                  tc.category === "POSITIVE"
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                                    : "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
                                }`}
                              >
                                {tc.category}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono font-semibold text-slate-600 dark:text-slate-400">
                              HTTP {tc.expectedStatus}
                            </td>
                            <td className="py-2 px-3 font-mono font-bold">
                              <span className={tc.passed ? "text-emerald-600" : "text-rose-600"}>
                                HTTP {tc.actualStatus}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono text-muted-foreground">{tc.latencyMs}ms</td>
                            <td className="py-2 px-3 font-mono text-[10px] text-muted-foreground max-w-xs truncate">
                              {tc.responseBody ? `"${tc.responseBody}"` : "(Headers injected on 200 OK)"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Zap className="h-10 w-10 mx-auto mb-3 opacity-30 text-indigo-500" />
                  <p className="font-medium text-foreground">No test run recorded yet</p>
                  <p className="text-xs mt-1">
                    Click &quot;Run All 7 QA Test Cases&quot; above to execute the automated gateway test matrix.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: JWT Envelope Studio */}
      {activeTab === "studio" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-primary" />
                Live RS256 JWT Token Generator
              </CardTitle>
              <CardDescription className="text-xs">
                Generates a cryptographically authentic IdentityContextEnvelope signed with the local development RSA
                private key and kid: &quot;local-dev-key-1&quot;.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Principal ID (claims.principal.principal_id)</label>
                  <input
                    type="text"
                    className={FIELD}
                    value={studioPrincipalId}
                    onChange={(e) => setStudioPrincipalId(e.target.value)}
                  />
                  <p className={HINT}>Default demo principal UUID</p>
                </div>

                <div>
                  <label className={LABEL}>Tenant ID (claims.tenant_id)</label>
                  <input
                    type="text"
                    className={FIELD}
                    value={studioTenantId}
                    onChange={(e) => setStudioTenantId(e.target.value)}
                  />
                  <p className={HINT}>ZOIKO-DEMO: 11111111-1111-1111-1111-111111111111</p>
                </div>

                <div>
                  <label className={LABEL}>Legal Entity ID (claims.legal_entity_id)</label>
                  <input
                    type="text"
                    className={FIELD}
                    value={studioLegalEntityId}
                    onChange={(e) => setStudioLegalEntityId(e.target.value)}
                  />
                  <p className={HINT}>ZOIKO-DEMO-UK: 22222222-2222-2222-2222-222222222222</p>
                </div>

                <div>
                  <label className={LABEL}>Validity Duration (Minutes)</label>
                  <input
                    type="number"
                    className={FIELD}
                    value={studioExpMinutes}
                    onChange={(e) => setStudioExpMinutes(Number(e.target.value))}
                  />
                  <p className={HINT}>Set negative to test expired token rejection</p>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <Button onClick={handleGenerateCustomToken} disabled={isPending} className="gap-2 text-xs">
                  <Key className="h-3.5 w-3.5" />
                  Generate Signed RS256 Token
                </Button>
                {generatedToken && (
                  <Button variant="secondary" onClick={handleUseInSimulator} className="gap-2 text-xs">
                    <ArrowRight className="h-3.5 w-3.5" />
                    Load Into Simulator & Verify
                  </Button>
                )}
              </div>

              {generatedToken && (
                <div className="space-y-2 pt-2">
                  <label className={LABEL}>Generated JWT Token</label>
                  <textarea
                    rows={4}
                    readOnly
                    className={`${FIELD} font-mono text-[11px] bg-slate-50 dark:bg-slate-900`}
                    value={generatedToken}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: Architecture & Invariants Guide */}
      {activeTab === "arch" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Gateway Auth Service Architecture & Governance Invariants
              </CardTitle>
              <CardDescription className="text-xs">
                How gateway-auth-svc enforces zero-trust boundary verification across ZoikoSuite.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 text-xs leading-relaxed text-muted-foreground">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-900/50 space-y-2">
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    <span className="p-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 font-mono text-[10px]">
                      STEP 1
                    </span>
                    RS256 JWKS Signature
                  </div>
                  <p>
                    Edge requests presenting <code className="font-mono">Authorization: Bearer &lt;jwt&gt;</code> are
                    checked against <code className="font-mono">identity-context-svc:8080/.well-known/jwks.json</code>.
                    Missing or invalid signature immediately returns <code className="font-mono font-bold">401</code>.
                  </p>
                </div>

                <div className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-900/50 space-y-2">
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    <span className="p-1 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 font-mono text-[10px]">
                      STEP 2
                    </span>
                    GTRM Hostname Matching
                  </div>
                  <p>
                    If the edge gateway passed <code className="font-mono">X-Zoiko-Resolved-Tenant-Id</code> based on
                    the sub-domain/host, it MUST match the token&apos;s <code className="font-mono">tenant_id</code>.
                    Mismatches return <code className="font-mono font-bold">403 (tenant_hostname_mismatch)</code>.
                  </p>
                </div>

                <div className="p-4 rounded-lg border bg-slate-50 dark:bg-slate-900/50 space-y-2">
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    <span className="p-1 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 font-mono text-[10px]">
                      STEP 3
                    </span>
                    GOV-01 Context Resolution
                  </div>
                  <p>
                    Calls <code className="font-mono">tenant-entity-registry-svc:8081</code> to verify the tenant is
                    ACTIVE and the <code className="font-mono">legal_entity_id</code> belongs to it. Inactive or
                    unmapped entities return <code className="font-mono font-bold">403 (x-tenant-context: denied)</code>.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50 space-y-2">
                <div className="font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  Header Injection on HTTP 200 OK
                </div>
                <p className="text-amber-800 dark:text-amber-200">
                  When all gates succeed, <code className="font-mono">gateway-auth-svc</code> strips the client&apos;s
                  inbound Authorization header and injects trusted downstream headers:
                  <code className="font-mono"> X-Principal-Id, X-Tenant-Id, X-Legal-Entity-Id, X-Jurisdiction-Context, X-Timezone, X-Residency-Policy-Id, X-Correlation-Id</code>.
                  Internal microservices read these trusted headers rather than re-parsing the JWT.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
