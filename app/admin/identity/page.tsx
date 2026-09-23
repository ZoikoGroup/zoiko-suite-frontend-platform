"use client";

import { useState, useCallback } from "react";
import { Copy, KeyRound, RefreshCw, ShieldAlert, UserRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DEMO_IDENTITY } from "@/lib/auth";
import {
  type ResolveRequest,
  type Principal,
  type PrincipalRoleAssignment,
  type DelegatedAuthority,
  type PrincipalStatus,
  type InvalidationReason,
  type ContextExplanation,
  type JWKSResponse,
  type HealthStatus,
  type SupportContext,
  type RefreshCacheResponse,
  type InvalidateTenantContextResponse,
  type AuthenticateResponse,
  type AttachSupportContextResponse,
  type SupportReasonCode,
} from "@/lib/api/identity";
import {
  authenticate,
  resolveIdentity,
  getSession,
  invalidateSession,
  explainContextResolution,
  getPrincipal,
  getPrincipalRoles,
  getPrincipalDelegations,
  updatePrincipalStatus,
  refreshTenantContextCache,
  invalidateTenantContext,
  attachSupportContext,
  getSupportContext,
  revokeSupportContext,
  getJWKS,
  getIdentityHealth,
  explainIdentityError,
} from "@/lib/api/identity-console";

// ─── Envelope payload decoding (display only; the signature is the gateway's
// ─── job, not the console's) ────────────────────────────────────────────────

type DecodedEnvelope = {
  principal?: { principal_id?: string; tenant_id?: string; principal_type?: string; display_name?: string };
  tenant_id?: string;
  legal_entity_id?: string;
  role_profile?: { role_assignments?: unknown[]; permission_bundle_ids?: string[] };
  delegated_authority?: unknown[];
  session_trust_posture?: {
    posture?: string;
    mfa_verified?: boolean;
    adaptive_risk_score?: number;
    session_context_id?: string;
  };
  correlation_id?: string;
  schema_version?: string;
  exp?: number;
  iat?: number;
};

function decodeEnvelopeClaims(jwt: string): DecodedEnvelope {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return {};
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as DecodedEnvelope;
  } catch {
    return {};
  }
}

const CALLER = {
  principalId: DEMO_IDENTITY.principalId,
  tenantId: DEMO_IDENTITY.tenantId,
  legalEntityId: DEMO_IDENTITY.legalEntityId,
};

const INVALIDATION_REASONS: InvalidationReason[] = [
  "LOGOUT",
  "ADMIN_REVOKE",
  "RISK_ESCALATION",
  "DELEGATION_REVOKED",
];

const SUPPORT_REASON_CODES: SupportReasonCode[] = [
  "INCIDENT_RESPONSE",
  "CUSTOMER_TICKET",
  "DATA_CORRECTION",
  "AUDIT_REQUEST",
];

const TABS = ["authenticate", "resolve", "principal", "sessions", "tenant", "support", "platform"] as const;
type Tab = (typeof TABS)[number];

function Field({ label, hint }: { label: string; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {hint && <p className="text-xs text-muted-foreground mb-1">{hint}</p>}
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      data-testid={`copy-${label}`}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function ResultBox({ title, value, testid }: { title: string; value: string; testid: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <CopyButton value={value} label={testid} />
      </div>
      <textarea
        readOnly
        value={value}
        data-testid={testid}
        className="w-full p-2 border rounded font-mono text-xs min-h-[90px] resize-y bg-muted dark:bg-slate-800"
        rows={4}
      />
    </div>
  );
}

/**
 * What just happened, in a sentence, above the identifiers it produced.
 *
 * The result panels on this page already carried sentence-case labels, but a
 * grid of monospace ids answers "what was returned" and not "what did I just
 * do" — which is the question an operator running break-glass or a tenant-wide
 * revocation actually has. The ids stay exactly as they were underneath: per
 * lib/humanize.ts, a readable summary must never be the only way to see what
 * was stored, because the ids are the evidence and the sentence is only
 * presentation.
 */
function Outcome({
  headline,
  detail,
  tone = "ok",
  testid,
}: {
  headline: string;
  detail?: string;
  tone?: "ok" | "warn";
  testid?: string;
}) {
  const palette =
    tone === "warn"
      ? "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200"
      : "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-200";
  return (
    <div className={`p-3 border rounded space-y-1 ${palette}`} data-testid={testid}>
      <p className="text-sm font-medium">{headline}</p>
      {detail && <p className="text-xs opacity-90">{detail}</p>}
    </div>
  );
}

/** Minutes from now until `iso`, for "expires in ..." phrasing. */
function minutesUntil(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div
      className="p-3 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm"
      data-testid="error-notice"
    >
      {message}
    </div>
  );
}

/** Strip the leading "OK:" marker used to drive the success styling. */
function messageOf(message: string): string {
  return message.startsWith("OK:") ? message.slice(3).trim() : message;
}

export default function IdentityAdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("authenticate");

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Identity Context Service</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Tier-0 platform foundation (GOV-01). Resolves the authenticated principal, tenant,
          legal-entity scope, role profile, delegated authority and session trust posture for
          every request — then signs that context into an RS256 envelope every downstream
          service trusts.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        <Badge tone="info">Acting principal: {CALLER.principalId}</Badge>
        <Badge tone="info">Tenant: {CALLER.tenantId}</Badge>
        <Badge tone="info">Legal entity: {CALLER.legalEntityId}</Badge>
        <Badge tone="neutral">All six dimensions fail closed — partial envelopes are prohibited</Badge>
      </div>

      {/* Tabs */}
      <div className="border-b" role="tablist">
        <nav className="flex gap-1 flex-wrap">
          {TABS.map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              data-testid={`tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "authenticate" && <AuthenticateTab />}
      {activeTab === "resolve" && <ResolveTab />}
      {activeTab === "principal" && <PrincipalTab />}
      {activeTab === "sessions" && <SessionsTab />}
      {activeTab === "tenant" && <TenantTab />}
      {activeTab === "support" && <SupportTab />}
      {activeTab === "platform" && <PlatformTab />}
    </div>
  );
}

// ─── POST /v1/authenticate ───────────────────────────────────────────────────

function AuthenticateTab() {
  const [tenantId, setTenantId] = useState<string>(CALLER.tenantId);
  const [email, setEmail] = useState("admin@zoikosuite.com");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<AuthenticateResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAuthenticate = useCallback(async () => {
    setResult(null);
    setError("");
    if (!tenantId.trim() || !email.trim() || !password) {
      setError("Tenant, email and password are all required.");
      return;
    }
    setLoading(true);
    const res = await authenticate({ tenant_id: tenantId.trim(), email: email.trim(), password });
    setLoading(false);
    if (res.ok) {
      setResult(res.data);
    } else {
      setError(explainIdentityError(res.error.message));
    }
  }, [tenantId, email, password]);

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <KeyRound className="h-5 w-5" /> Authenticate
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          POST /v1/authenticate — the platform&apos;s entry point. Exchanges a password for a
          short-lived (5 minute) bearer token that grants nothing. Rejections are deliberately
          uniform: a wrong password, unknown email, locked account and disabled principal all
          return the same 401, so this cannot be used to enumerate accounts.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Field label="Tenant ID" hint="Selects which tenant's principals to search. Confers nothing." />
          <input
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            data-testid="auth-tenant"
            className="w-full p-2 border rounded font-mono text-sm"
            spellCheck={false}
          />
        </div>
        <div>
          <Field label="Email" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="auth-email"
            className="w-full p-2 border rounded text-sm"
          />
        </div>
        <div>
          <Field label="Password" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAuthenticate()}
            data-testid="auth-password"
            className="w-full p-2 border rounded text-sm"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleAuthenticate} loading={loading} data-testid="authenticate-button">
          {loading ? "Verifying..." : "Exchange Password"}
        </Button>
      </div>

      {error && <ErrorNotice message={error} />}

      {result && (
        <div className="space-y-3" data-testid="authenticate-result">
          <Outcome
            testid="authenticate-outcome"
            headline="Password accepted — this is not yet an identity envelope."
            detail={`The token below proves only that this person knew the password. Exchange it on the Resolve tab for the signed envelope other services trust. It expires in ${Math.round(result.expires_in / 60)} minute${result.expires_in === 60 ? "" : "s"}.`}
          />
          <div className="grid gap-3 md:grid-cols-4">
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">Token type</p>
              <p className="font-mono text-sm">{result.token_type}</p>
            </div>
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">Expires in</p>
              <p className="font-mono text-sm">{result.expires_in}s</p>
            </div>
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">Principal ID</p>
              <p className="font-mono text-xs">{result.principal_id}</p>
            </div>
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">MFA required</p>
              <p className="text-sm">{result.mfa_required ? "Yes" : "No"}</p>
            </div>
          </div>

          <ResultBox title="Bearer access token (exchange at /v1/context/resolve)" value={result.access_token} testid="auth-token" />

          <p className="text-xs text-muted-foreground">
            This token grants nothing on its own. Hand it straight to the Resolve tab to obtain the
            signed IdentityContextEnvelope.
          </p>
        </div>
      )}
    </Card>
  );
}

// ─── POST /v1/context/resolve ────────────────────────────────────────────────

function ResolveTab() {
  const [bearerToken, setBearerToken] = useState("");
  const [samlAssertion, setSamlAssertion] = useState("");
  const [legalEntityId, setLegalEntityId] = useState<string>(CALLER.legalEntityId);
  const [result, setResult] = useState<{
    envelopeJwt?: string;
    evidenceId?: string;
    sessionContextId?: string;
    expiresAt?: number;
    claims?: DecodedEnvelope;
    error?: string;
  }>({});
  const [loading, setLoading] = useState(false);

  const handleResolve = useCallback(async () => {
    if (!bearerToken.trim() && !samlAssertion.trim()) {
      setResult({ error: "Provide a bearer token or a SAML assertion (exactly one)." });
      return;
    }
    setLoading(true);
    setResult({});

    const request: ResolveRequest = {
      ...(bearerToken.trim() ? { bearer_token: bearerToken.trim() } : {}),
      ...(samlAssertion.trim() ? { saml_assertion: samlAssertion.trim() } : {}),
      legal_entity_id: legalEntityId.trim(),
      correlation_id: crypto.randomUUID(),
    };

    const res = await resolveIdentity({ request, callerIdentity: CALLER });
    setLoading(false);
    if (res.ok) {
      setResult({
        envelopeJwt: res.data.envelope_jwt,
        evidenceId: res.data.evidence_id,
        sessionContextId: res.data.session_context_id,
        expiresAt: res.data.expires_at,
        claims: decodeEnvelopeClaims(res.data.envelope_jwt),
      });
    } else {
      setResult({ error: explainIdentityError(res.error.message) });
    }
  }, [bearerToken, samlAssertion, legalEntityId]);

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Resolve Identity Context</h2>
        <p className="text-sm text-muted-foreground mt-1">
          POST /v1/context/resolve — verifies the bearer token / SAML assertion and assembles the
          six-dimension IdentityContextEnvelope. All six dimensions (authenticated principal,
          tenant, legal entity, role profile, delegated authority, trust posture) must resolve or
          the service fails closed.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Field label="Bearer token" hint="OIDC JWT from the identity provider." />
          <textarea
            value={bearerToken}
            onChange={(e) => setBearerToken(e.target.value)}
            data-testid="resolve-bearer"
            placeholder="Paste IdP bearer token here (or a SAML assertion below)..."
            className="w-full p-2 border rounded font-mono text-xs min-h-[110px] resize-y"
            rows={5}
          />
        </div>
        <div className="space-y-4">
          <div>
            <Field label="SAML assertion (base64)" hint="Either this or the bearer token — never both, never neither." />
            <textarea
              value={samlAssertion}
              onChange={(e) => setSamlAssertion(e.target.value)}
              data-testid="resolve-saml"
              placeholder="Base64-encoded SAML 2.0 assertion..."
              className="w-full p-2 border rounded font-mono text-xs min-h-[72px] resize-y"
              rows={3}
            />
          </div>
          <div>
            <Field label="Legal Entity ID" hint="Sent as X-Legal-Entity-Id and in the body — required." />
            <input
              value={legalEntityId}
              onChange={(e) => setLegalEntityId(e.target.value)}
              data-testid="resolve-entity"
              className="w-full p-2 border rounded font-mono text-sm"
              spellCheck={false}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleResolve} loading={loading} data-testid="resolve-button">
          {loading ? "Resolving..." : "Resolve Identity"}
        </Button>
      </div>

      {result.error && <ErrorNotice message={result.error} />}

      {result.envelopeJwt && (
        <div className="space-y-4" data-testid="resolve-result">
          <Outcome
            testid="resolve-outcome"
            headline="Identity context resolved — a signed envelope was issued."
            detail={`All six dimensions passed: authenticated principal, tenant, legal entity, role profile, delegated authority and session trust. This envelope is what every downstream service trusts${result.expiresAt ? `, and it is valid until ${new Date(result.expiresAt * 1000).toLocaleTimeString()}` : ""}. Copy the Session Context ID below — the Sessions tab needs it.`}
          />
          <div className="grid gap-3 md:grid-cols-3">
            {result.evidenceId && (
              <div className="p-3 bg-muted rounded" data-testid="resolve-evidence">
                <p className="text-xs text-muted-foreground">Evidence ID (cite this decision)</p>
                <p className="font-mono text-xs">{result.evidenceId}</p>
              </div>
            )}
            {result.sessionContextId && (
              <div className="p-3 bg-muted rounded" data-testid="resolve-session-id">
                <p className="text-xs text-muted-foreground">Session Context ID</p>
                <p className="font-mono text-xs">{result.sessionContextId}</p>
              </div>
            )}
            {result.expiresAt && (
              <div className="p-3 bg-muted rounded" data-testid="resolve-expires">
                <p className="text-xs text-muted-foreground">Envelope expires</p>
                <p className="font-mono text-xs">{new Date(result.expiresAt * 1000).toLocaleString()}</p>
              </div>
            )}
          </div>

          <ResultBox title="Signed IdentityContextEnvelope (RS256 JWT)" value={result.envelopeJwt} testid="resolve-envelope" />

          {result.claims && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Decoded payload (display only — gateway-auth-svc verifies the signature)</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Principal</p>
                  <p className="text-sm">
                    {result.claims.principal?.display_name ?? "—"}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      ({result.claims.principal?.principal_id})
                    </span>
                  </p>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Tenant / Legal entity</p>
                  <p className="font-mono text-xs">{result.claims.tenant_id} / {result.claims.legal_entity_id}</p>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Permission bundles</p>
                  <p className="font-mono text-xs">
                    {(result.claims.role_profile?.permission_bundle_ids ?? []).length
                      ? result.claims.role_profile!.permission_bundle_ids!.join(", ")
                      : "None"}
                  </p>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Role assignments</p>
                  <p className="font-mono text-xs">
                    {(result.claims.role_profile?.role_assignments ?? []).length} assignment(s)
                  </p>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Delegated authority</p>
                  <p className="font-mono text-xs">
                    {(result.claims.delegated_authority ?? []).length} grant(s)
                  </p>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Trust posture</p>
                  <p className="text-sm flex items-center gap-2">
                    <Badge
                      tone={result.claims.session_trust_posture?.posture === "BLOCKED" ? "danger" : result.claims.session_trust_posture?.posture === "HIGH_RISK" ? "warning" : "success"}
                    >
                      {result.claims.session_trust_posture?.posture ?? "—"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      risk {result.claims.session_trust_posture?.adaptive_risk_score ?? "—"} · mfa{" "}
                      {result.claims.session_trust_posture?.mfa_verified ? "verified" : "not verified"}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Principal lookup + roles + delegations + status ─────────────────────────

function PrincipalTab() {
  const [principalId, setPrincipalId] = useState("");
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [roles, setRoles] = useState<PrincipalRoleAssignment[]>([]);
  const [delegations, setDelegations] = useState<DelegatedAuthority[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusAction, setStatusAction] = useState<{ status: PrincipalStatus; reason: string }>({
    status: "SUSPENDED",
    reason: "",
  });
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const handleLoad = useCallback(async () => {
    if (!principalId.trim()) {
      setError("Principal ID is required");
      return;
    }
    setLoading(true);
    setError("");
    setPrincipal(null);
    setRoles([]);
    setDelegations([]);
    setStatusMessage("");

    const [principalRes, rolesRes, delegationsRes] = await Promise.all([
      getPrincipal({ principalId: principalId.trim(), callerTenantId: CALLER.tenantId, callerPrincipalId: CALLER.principalId }),
      getPrincipalRoles({ principalId: principalId.trim(), callerTenantId: CALLER.tenantId, callerPrincipalId: CALLER.principalId }),
      getPrincipalDelegations({ principalId: principalId.trim(), callerTenantId: CALLER.tenantId, callerPrincipalId: CALLER.principalId }),
    ]);

    if (!principalRes.ok) {
      setError(explainIdentityError(principalRes.error.message));
    } else {
      setPrincipal(principalRes.data);
    }
    if (rolesRes.ok) setRoles(rolesRes.data);
    if (delegationsRes.ok) setDelegations(delegationsRes.data);
    setLoading(false);
  }, [principalId]);

  const handleUpdateStatus = useCallback(async () => {
    if (!principalId.trim() || !principal) {
      setStatusMessage("Load a principal first");
      return;
    }
    setStatusLoading(true);
    setStatusMessage("");

    const res = await updatePrincipalStatus({
      principalId: principalId.trim(),
      status: statusAction.status,
      reason: statusAction.reason.trim() || undefined,
      actorPrincipalId: CALLER.principalId,
      correlationId: crypto.randomUUID(),
      callerTenantId: CALLER.tenantId,
    });

    if (res.ok) {
      setStatusMessage(`OK: Status updated to ${statusAction.status}`);
      const refreshed = await getPrincipal({ principalId: principalId.trim(), callerTenantId: CALLER.tenantId, callerPrincipalId: CALLER.principalId });
      if (refreshed.ok) setPrincipal(refreshed.data);
    } else {
      setStatusMessage(explainIdentityError(res.error.message));
    }
    setStatusLoading(false);
  }, [principalId, principal, statusAction]);

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <UserRound className="h-5 w-5" /> Principal Lookup & Management
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            GET /v1/principals/{"{id}"} (+ roles, delegations) and PUT /v1/principals/{"{id}"}/status.
            Reads are tenant-scoped; a principal in another tenant answers 404, never 403.
          </p>
        </div>

        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Field label="Principal ID" />
            <input
              value={principalId}
              onChange={(e) => setPrincipalId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoad()}
              data-testid="principal-id"
              className="w-full p-2 border rounded font-mono text-sm"
              placeholder="e.g., 33333333-3333-3333-3333-333333333333"
              spellCheck={false}
            />
          </div>
          <Button onClick={handleLoad} loading={loading} data-testid="principal-load">
            {loading ? "Loading..." : "Load Principal"}
          </Button>
        </div>

        {error && <ErrorNotice message={error} />}

        {principal && (
          <div className="space-y-4" data-testid="principal-result">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Principal ID", principal.principal_id, "font-mono text-xs"],
                ["Tenant", principal.tenant_id, "font-mono text-xs"],
                ["Type", principal.principal_type, "text-sm"],
                ["Email", principal.email, "text-sm"],
                ["Display name", principal.display_name, "text-sm"],
                ["Status", principal.status, "text-sm badge"],
                ["Created", new Date(principal.created_at).toLocaleString(), "text-sm"],
                ["Classification", principal.data_classification, "text-sm"],
                ["IdP subject", principal.identity_provider_subject, "font-mono text-xs"],
              ].map(([label, value, cls]) => (
                <div key={label as string} className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  {cls === "text-sm badge" ? (
                    <Badge tone={value === "ACTIVE" ? "success" : value === "SUSPENDED" ? "warning" : "danger"}>
                      {value as string}
                    </Badge>
                  ) : (
                    <p className={cls as string}>{value?.toString() ?? "—"}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-medium mb-2">Status transition</h3>
              <div className="flex gap-3 items-end flex-wrap">
                <select
                  value={statusAction.status}
                  onChange={(e) => setStatusAction({ ...statusAction, status: e.target.value as PrincipalStatus })}
                  data-testid="status-select"
                  className="p-2 border rounded w-48"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="DISABLED">DISABLED</option>
                </select>
                <input
                  value={statusAction.reason}
                  onChange={(e) => setStatusAction({ ...statusAction, reason: e.target.value })}
                  placeholder="Reason (optional)"
                  className="p-2 border rounded flex-1 min-w-[200px]"
                />
                <Button onClick={handleUpdateStatus} loading={statusLoading} variant="primary" data-testid="status-update">
                  {statusLoading ? "Updating..." : "Update Status"}
                </Button>
              </div>
              {statusMessage && (
                <p
                  data-testid="status-message"
                  className={`text-sm mt-2 ${statusMessage.startsWith("OK:") ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
                >
                  {messageOf(statusMessage)}
                </p>
              )}
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-medium mb-2">Role assignments ({roles.length})</h3>
              {roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active role assignments</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="roles-table">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="p-2">Assignment ID</th>
                        <th className="p-2">Role ID</th>
                        <th className="p-2">Legal entity</th>
                        <th className="p-2">Effective from</th>
                        <th className="p-2">Effective to</th>
                        <th className="p-2">Assigned by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roles.map((r) => (
                        <tr key={r.assignment_id} className="border-b">
                          <td className="p-2 font-mono text-xs">{r.assignment_id}</td>
                          <td className="p-2 font-mono text-xs">{r.role_id}</td>
                          <td className="p-2 font-mono text-xs">{r.legal_entity_id ?? "Tenant-wide"}</td>
                          <td className="p-2">{new Date(r.effective_from).toLocaleDateString()}</td>
                          <td className="p-2">{new Date(r.effective_to).toLocaleDateString()}</td>
                          <td className="p-2 font-mono text-xs">{r.assigned_by}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-medium mb-2">Active delegations ({delegations.length})</h3>
              {delegations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active delegations</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="delegations-table">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="p-2">Delegation ID</th>
                        <th className="p-2">Delegator</th>
                        <th className="p-2">Scope</th>
                        <th className="p-2">Limit</th>
                        <th className="p-2">Effective</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delegations.map((d) => (
                        <tr key={d.delegated_authority_id} className="border-b">
                          <td className="p-2 font-mono text-xs">{d.delegated_authority_id}</td>
                          <td className="p-2 font-mono text-xs">{d.delegator_principal_id}</td>
                          <td className="p-2">{d.scope_type}{d.legal_entity_id ? ` / ${d.legal_entity_id}` : ""}</td>
                          <td className="p-2">
                            {d.authority_limit_type ? `${d.authority_limit_type}: ${d.authority_limit_value}` : "None"}
                          </td>
                          <td className="p-2">{new Date(d.effective_from).toLocaleDateString()} – {new Date(d.effective_to).toLocaleDateString()}</td>
                          <td className="p-2">
                            <Badge tone={d.revocation_status === "ACTIVE" ? "success" : "neutral"}>
                              {d.revocation_status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Sessions: get / explain / invalidate ────────────────────────────────────

function SessionsTab() {
  const [sessionId, setSessionId] = useState("");
  const [reason, setReason] = useState<InvalidationReason>("ADMIN_REVOKE");
  const [asOf, setAsOf] = useState("");
  const [envelope, setEnvelope] = useState("");
  const [explanation, setExplanation] = useState<ContextExplanation | null>(null);
  const [explanationError, setExplanationError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const clear = () => {
    setEnvelope("");
    setExplanation(null);
    setExplanationError("");
    setNotice("");
  };

  const handleGet = useCallback(async () => {
    if (!sessionId.trim()) {
      setNotice("Session Context ID is required");
      return;
    }
    setLoading(true);
    clear();
    const res = await getSession({ sessionContextId: sessionId.trim(), callerTenantId: CALLER.tenantId, callerPrincipalId: CALLER.principalId });
    setLoading(false);
    if (res.ok) setEnvelope(res.data.envelope_jwt);
    else setNotice(explainIdentityError(res.error.message));
  }, [sessionId]);

  const handleExplain = useCallback(async () => {
    if (!sessionId.trim()) {
      setNotice("Session Context ID is required");
      return;
    }
    setLoading(true);
    clear();
    const res = await explainContextResolution({
      sessionContextId: sessionId.trim(),
      asOf: asOf ? new Date(asOf).toISOString() : undefined,
      callerTenantId: CALLER.tenantId,
      callerPrincipalId: CALLER.principalId,
    });
    setLoading(false);
    if (res.ok) setExplanation(res.data);
    else setExplanationError(explainIdentityError(res.error.message));
  }, [sessionId, asOf]);

  const handleInvalidate = useCallback(async () => {
    if (!sessionId.trim()) {
      setNotice("Session Context ID is required");
      return;
    }
    setLoading(true);
    clear();
    const res = await invalidateSession({
      sessionContextId: sessionId.trim(),
      request: { reason },
      actorPrincipalId: CALLER.principalId,
      correlationId: crypto.randomUUID(),
      callerTenantId: CALLER.tenantId,
    });
    setLoading(false);
    setNotice(res.ok ? "OK: Session invalidated (idempotent — re-submitting is a no-op)" : explainIdentityError(res.error.message));
  }, [sessionId, reason]);

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Session Management</h2>
        <p className="text-sm text-muted-foreground mt-1">
          GET /v1/context/session/{"{id}"} (silent re-auth), GET .../explain (GOV-01 — the recorded
          six-dimension account of the resolution), and POST .../invalidate (idempotent logout/revoke).
        </p>
      </div>

      <div className="flex gap-3 items-end flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <Field label="Session Context ID" />
          <input
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            data-testid="session-id"
            className="w-full p-2 border rounded font-mono text-sm"
            placeholder="e.g., 01ARZ3NDEKTSV4RRFFQ69G5FAV"
            spellCheck={false}
          />
        </div>
        <div>
          <Field label="Invalidation reason" />
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as InvalidationReason)}
            data-testid="session-reason"
            className="p-2 border rounded w-48"
          >
            {INVALIDATION_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <Field label="Explain as-of (RFC3339, optional)" />
          <input
            type="datetime-local"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            data-testid="session-asof"
            className="p-2 border rounded text-sm"
          />
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Button onClick={handleGet} loading={loading} variant="secondary" data-testid="session-get">
          {loading ? "..." : "Get Session"}
        </Button>
        <Button onClick={handleExplain} loading={loading} variant="secondary" data-testid="session-explain">
          {loading ? "..." : "Explain"}
        </Button>
        <Button onClick={handleInvalidate} loading={loading} variant="primary" data-testid="session-invalidate">
          {loading ? "..." : "Invalidate"}
        </Button>
      </div>

      {notice && (
        <div
          data-testid="session-notice"
          className={`p-3 rounded text-sm ${
            notice.startsWith("OK:") ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30" : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}
        >
          {messageOf(notice)}
        </div>
      )}

      {envelope && (
        <>
          <Outcome
            testid="session-outcome"
            headline="Session is live — this is the credential it was issued with."
            detail="The same signed envelope the session started with, re-read rather than re-minted. If this returns Not Found instead, the session has expired, been invalidated, or belongs to another tenant — all three answer the same way on purpose, so session ids cannot be probed."
          />
          <ResultBox title="Session envelope JWT (same as issued, if still valid)" value={envelope} testid="session-envelope" />
        </>
      )}

      {explanationError && <ErrorNotice message={explanationError} />}

      {explanation && (
        <div className="space-y-3" data-testid="explain-result">
          <h3 className="text-sm font-medium">Recorded account of the resolution</h3>
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <Badge
              tone={explanation.outcome === "RESOLVED" ? "success" : explanation.outcome === "INVALIDATED" ? "warning" : "neutral"}
            >
              {explanation.outcome}
            </Badge>
            <span>evidence {explanation.evidence_id}</span>
            <span>decision {explanation.decision_id}</span>
            <span>reconstructed from {explanation.reconstructed_from}</span>
            <span>as of {new Date(explanation.as_of).toLocaleString()}</span>
          </div>
          {explanation.invalidation_reason && (
            <p className="text-sm text-warning">
              Invalidated {explanation.invalidated_at ? new Date(explanation.invalidated_at).toLocaleString() : ""} — {explanation.invalidation_reason}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="dimensions-table">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="p-2">#</th>
                  <th className="p-2">Dimension</th>
                  <th className="p-2">Result</th>
                  <th className="p-2">Source</th>
                  <th className="p-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {explanation.dimensions.map((d) => (
                  <tr key={d.dimension} className="border-b">
                    <td className="p-2 font-mono text-xs">{d.dimension}</td>
                    <td className="p-2">{d.name}</td>
                    <td className="p-2">
                      <Badge tone={String(d.result).toUpperCase() === "OK" || String(d.result).toUpperCase() === "RESOLVED" ? "success" : String(d.result).toUpperCase() === "FAILED" ? "danger" : "neutral"}>
                        {d.result}
                      </Badge>
                    </td>
                    <td className="p-2 font-mono text-xs">{d.source}</td>
                    <td className="p-2 text-xs">{d.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {explanation.support_context_id && (
            <p className="text-xs text-muted-foreground">Issued under support context {explanation.support_context_id}</p>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Tenant context: cache refresh + tenant-wide invalidate ──────────────────

function TenantTab() {
  // Cache refresh
  const [ingressIdentifiers, setIngressIdentifiers] = useState("");
  const [refreshReason, setRefreshReason] = useState("");
  const [refreshResult, setRefreshResult] = useState<RefreshCacheResponse | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const [refreshLoading, setRefreshLoading] = useState(false);

  // Tenant invalidate
  const [invalidateReason, setInvalidateReason] = useState<InvalidationReason>("ADMIN_REVOKE");
  const [justification, setJustification] = useState("");
  const [invalidResult, setInvalidResult] = useState<InvalidateTenantContextResponse | null>(null);
  const [invalidError, setInvalidError] = useState("");
  const [invalidLoading, setInvalidLoading] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshResult(null);
    setRefreshError("");
    if (!refreshReason.trim()) {
      setRefreshError("A reason is required for the cache refresh.");
      return;
    }
    setRefreshLoading(true);
    const res = await refreshTenantContextCache({
      request: {
        reason: refreshReason.trim(),
        ...(ingressIdentifiers.trim()
          ? { ingress_identifiers: ingressIdentifiers.split(",").map((s) => s.trim()).filter(Boolean) }
          : {}),
        correlation_id: crypto.randomUUID(),
      },
      callerTenantId: CALLER.tenantId,
      callerPrincipalId: CALLER.principalId,
    });
    setRefreshLoading(false);
    if (res.ok) setRefreshResult(res.data);
    else setRefreshError(explainIdentityError(res.error.message));
  }, [ingressIdentifiers, refreshReason]);

  const handleInvalidate = useCallback(async () => {
    setInvalidResult(null);
    setInvalidError("");
    if (justification.trim().length < 20) {
      setInvalidError("Justification is MANDATORY (min 20 characters) — the blast radius is every user of the tenant.");
      return;
    }
    setInvalidLoading(true);
    const res = await invalidateTenantContext({
      request: {
        reason: invalidateReason,
        justification: justification.trim(),
        correlation_id: crypto.randomUUID(),
      },
      callerTenantId: CALLER.tenantId,
      callerPrincipalId: CALLER.principalId,
    });
    setInvalidLoading(false);
    if (res.ok) setInvalidResult(res.data);
    else setInvalidError(explainIdentityError(res.error.message));
  }, [invalidateReason, justification]);

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <RefreshCw className="h-5 w-5" /> Refresh Tenant Context Cache
        </h2>
        <p className="text-sm text-muted-foreground">
          POST /v1/context/cache/refresh — GOV-01 RefreshTenantContextCache. Marks the
          caller&apos;s tenant routing hints stale so the next resolution re-reads them from the
          registry. Deliberately does NOT delete bindings, and is scoped to the caller&apos;s own
          verified tenant — there is no all-tenants form.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Field label="Ingress identifiers (comma-separated, optional)" hint="Empty refreshes every binding for the tenant." />
            <input
              value={ingressIdentifiers}
              onChange={(e) => setIngressIdentifiers(e.target.value)}
              data-testid="cache-ingress"
              className="w-full p-2 border rounded font-mono text-sm"
              placeholder="app.alpha.zoiko.io, app.beta.zoiko.io"
              spellCheck={false}
            />
          </div>
          <div>
            <Field label="Reason (required)" />
            <input
              value={refreshReason}
              onChange={(e) => setRefreshReason(e.target.value)}
              data-testid="cache-reason"
              className="w-full p-2 border rounded text-sm"
            />
          </div>
        </div>

        <Button onClick={handleRefresh} loading={refreshLoading} variant="secondary" data-testid="cache-refresh-button">
          {refreshLoading ? "Refreshing..." : "Refresh Cache"}
        </Button>

        {refreshError && <ErrorNotice message={refreshError} />}

        {refreshResult && (
          <>
          <Outcome
            testid="cache-refresh-outcome"
            headline={
              refreshResult.bindings_refreshed === 0
                ? "Cache refreshed — no routing hints were cached for this tenant."
                : `Cache refreshed — ${refreshResult.bindings_refreshed} routing hint${refreshResult.bindings_refreshed === 1 ? "" : "s"} marked stale.`
            }
            detail="Nothing was deleted. The next context resolution re-reads these from the tenant registry instead of trusting the cached copy. Zero is normal on an environment with no ingress bindings seeded."
          />
          <div className="grid gap-3 md:grid-cols-2" data-testid="cache-refresh-result">
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">Bindings marked stale</p>
              <p className="font-mono text-sm">{refreshResult.bindings_refreshed}</p>
            </div>
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">Evidence ID</p>
              <p className="font-mono text-xs">{refreshResult.evidence_id}</p>
            </div>
          </div>
          </>
        )}
      </Card>

      <Card className="p-6 space-y-4 border-rose-200 dark:border-rose-500/30">
        <h2 className="text-xl font-semibold flex items-center gap-2 text-rose-700 dark:text-rose-400">
          <ShieldAlert className="h-5 w-5" /> Invalidate All Tenant Sessions
        </h2>
        <p className="text-sm text-muted-foreground">
          POST /v1/context/tenant/invalidate — GOV-01 InvalidateTenantContext. Revokes every live
          session in the tenant. Justification is MANDATORY and travels on the event into SIEM at
          CRITICAL. This logs every user of the tenant out.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Field label="Reason" />
            <select
              value={invalidateReason}
              onChange={(e) => setInvalidateReason(e.target.value as InvalidationReason)}
              data-testid="tenant-reason"
              className="p-2 border rounded w-48"
            >
              {INVALIDATION_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <Field label="Justification (min 20 chars)" />
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              data-testid="tenant-justification"
              className="w-full p-2 border rounded text-sm"
              rows={3}
              placeholder="Why is every user of this tenant being logged out? An operator who cannot say why in a sentence should not be running this."
            />
          </div>
        </div>

        <Button onClick={handleInvalidate} loading={invalidLoading} variant="primary" data-testid="tenant-invalidate-button">
          {invalidLoading ? "Revoking..." : "Invalidate Tenant Context"}
        </Button>

        {invalidError && <ErrorNotice message={invalidError} />}

        {invalidResult && (
          <>
          <Outcome
            tone="warn"
            testid="tenant-invalidate-outcome"
            headline={
              invalidResult.sessions_revoked === 0
                ? "No live sessions to revoke — the tenant had none."
                : `${invalidResult.sessions_revoked} session${invalidResult.sessions_revoked === 1 ? "" : "s"} revoked across this tenant.`
            }
            detail="Every affected user must sign in again. The session records are kept and marked invalid, never deleted — they are evidence. Your own session is included if you were signed in to this tenant."
          />
          <div className="grid gap-3 md:grid-cols-2" data-testid="tenant-invalidate-result">
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">Sessions revoked</p>
              <p className="font-mono text-sm">{invalidResult.sessions_revoked}</p>
            </div>
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">Evidence ID</p>
              <p className="font-mono text-xs">{invalidResult.evidence_id}</p>
            </div>
          </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Support contexts (break-glass) ─────────────────────────────────────────

function SupportTab() {
  // Attach
  const [attach, setAttach] = useState<{
    tenant_id: string;
    support_principal_id: string;
    subject_principal_id: string;
    reason_code: SupportReasonCode;
    justification: string;
    ticket_ref: string;
    approver_principal_id: string;
    ttl_seconds: number;
  }>({
    tenant_id: "",
    support_principal_id: CALLER.principalId,
    subject_principal_id: "",
    reason_code: "INCIDENT_RESPONSE",
    justification: "",
    ticket_ref: "",
    approver_principal_id: "",
    ttl_seconds: 3600,
  });
  const [attachResult, setAttachResult] = useState<AttachSupportContextResponse | null>(null);
  const [attachError, setAttachError] = useState("");
  const [attachLoading, setAttachLoading] = useState(false);

  // Lookup / revoke
  const [lookupId, setLookupId] = useState("");
  const [grant, setGrant] = useState<SupportContext | null>(null);
  const [revokeReason, setRevokeReason] = useState("MANUAL_REVOCATION");
  const [lookupError, setLookupError] = useState("");
  const [notice, setNotice] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  const handleAttach = useCallback(async () => {
    setAttachResult(null);
    setAttachError("");
    if (!attach.tenant_id.trim() || !attach.approver_principal_id.trim() || !attach.ticket_ref.trim()) {
      setAttachError("Target tenant, approver and ticket reference are all required.");
      return;
    }
    if (attach.approver_principal_id === attach.support_principal_id) {
      setAttachError("Self-approval is refused — there is no single-party form of this command.");
      return;
    }
    if (attach.justification.trim().length < 20) {
      setAttachError("Justification must be at least 20 characters — a justification nobody can act on is not evidence.");
      return;
    }
    setAttachLoading(true);
    const res = await attachSupportContext({
      request: {
        tenant_id: attach.tenant_id.trim(),
        support_principal_id: attach.support_principal_id.trim(),
        ...(attach.subject_principal_id.trim() ? { subject_principal_id: attach.subject_principal_id.trim() } : {}),
        reason_code: attach.reason_code,
        justification: attach.justification.trim(),
        ticket_ref: attach.ticket_ref.trim(),
        approver_principal_id: attach.approver_principal_id.trim(),
        ...(attach.ttl_seconds ? { ttl_seconds: attach.ttl_seconds } : {}),
        correlation_id: crypto.randomUUID(),
      },
      supportPrincipalId: attach.support_principal_id.trim(),
    });
    setAttachLoading(false);
    if (res.ok) {
      setAttachResult(res.data);
      setLookupId(res.data.support_context_id);
    } else {
      setAttachError(explainIdentityError(res.error.message));
    }
  }, [attach]);

  const handleLookup = useCallback(async () => {
    if (!lookupId.trim()) {
      setNotice("Support Context ID is required");
      return;
    }
    setLookupLoading(true);
    setGrant(null);
    setLookupError("");
    setNotice("");
    const res = await getSupportContext({
      supportContextId: lookupId.trim(),
      callerTenantId: CALLER.tenantId,
      callerPrincipalId: CALLER.principalId,
    });
    setLookupLoading(false);
    if (res.ok) setGrant(res.data);
    else setLookupError(explainIdentityError(res.error.message));
  }, [lookupId]);

  const handleRevoke = useCallback(async () => {
    if (!lookupId.trim()) {
      setNotice("Support Context ID is required");
      return;
    }
    setLookupLoading(true);
    setLookupError("");
    setNotice("");
    const res = await revokeSupportContext({
      supportContextId: lookupId.trim(),
      reason: revokeReason,
      correlationId: crypto.randomUUID(),
      callerTenantId: CALLER.tenantId,
      callerPrincipalId: CALLER.principalId,
    });
    setLookupLoading(false);
    if (res.ok) {
      setNotice("OK: Support context revoked (idempotent; the first reason stands)");
      if (grant) setGrant({ ...grant, revoked_at: new Date().toISOString(), revocation_reason: revokeReason });
    } else {
      setNotice(explainIdentityError(res.error.message));
    }
  }, [lookupId, revokeReason, grant]);

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Support Contexts (break-glass)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          POST /v1/context/support, GET and DELETE /v1/context/support/{"{id}"} — GOV-01. Grants a
          scoped, time-limited, independently-approved elevation letting a support principal operate
          inside a customer tenant. This is NOT a role and grants no permissions; authorization still
          runs, unchanged, on every subsequent request.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium">Attach a support context</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Field label="Target tenant (authorization checked here)" />
            <input
              value={attach.tenant_id}
              onChange={(e) => setAttach({ ...attach, tenant_id: e.target.value })}
              data-testid="support-tenant"
              className="w-full p-2 border rounded font-mono text-sm"
            />
          </div>
          <div>
            <Field label="Support principal (grantee)" />
            <input
              value={attach.support_principal_id}
              onChange={(e) => setAttach({ ...attach, support_principal_id: e.target.value })}
              data-testid="support-principal"
              className="w-full p-2 border rounded font-mono text-sm"
            />
          </div>
          <div>
            <Field label="Approver (must differ from grantee)" />
            <input
              value={attach.approver_principal_id}
              onChange={(e) => setAttach({ ...attach, approver_principal_id: e.target.value })}
              data-testid="support-approver"
              className="w-full p-2 border rounded font-mono text-sm"
            />
          </div>
          <div>
            <Field label="Reason code" />
            <select
              value={attach.reason_code}
              onChange={(e) => setAttach({ ...attach, reason_code: e.target.value as SupportReasonCode })}
              data-testid="support-reason-code"
              className="p-2 border rounded w-full"
            >
              {SUPPORT_REASON_CODES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <Field label="Ticket reference (required)" />
            <input
              value={attach.ticket_ref}
              onChange={(e) => setAttach({ ...attach, ticket_ref: e.target.value })}
              data-testid="support-ticket"
              className="w-full p-2 border rounded font-mono text-sm"
            />
          </div>
          <div>
            <Field label="TTL seconds (max 3600)" />
            <input
              type="number"
              value={attach.ttl_seconds}
              onChange={(e) => setAttach({ ...attach, ttl_seconds: Number(e.target.value) })}
              data-testid="support-ttl"
              className="w-full p-2 border rounded text-sm"
            />
          </div>
          <div>
            <Field label="Subject principal (optional — omit = tenant-wide)" />
            <input
              value={attach.subject_principal_id}
              onChange={(e) => setAttach({ ...attach, subject_principal_id: e.target.value })}
              data-testid="support-subject"
              className="w-full p-2 border rounded font-mono text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <Field label="Justification (min 20 chars)" />
            <textarea
              value={attach.justification}
              onChange={(e) => setAttach({ ...attach, justification: e.target.value })}
              data-testid="support-justification"
              className="w-full p-2 border rounded text-sm"
              rows={3}
            />
          </div>
        </div>

        <Button onClick={handleAttach} loading={attachLoading} data-testid="support-attach-button">
          {attachLoading ? "Attaching..." : "Attach Support Context"}
        </Button>

        {attachError && <ErrorNotice message={attachError} />}

        {attachResult && (
          <>
          <Outcome
            tone="warn"
            testid="support-attach-outcome"
            headline={`Break-glass elevation granted — expires in ${minutesUntil(attachResult.expires_at)} minutes.`}
            detail="This grants no permissions by itself: authorization still runs unchanged on every request the support principal makes. It expires on its own, and an expired grant is reported for review until somebody signs it off."
          />
          <div className="grid gap-3 md:grid-cols-3" data-testid="support-attach-result">
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">Support Context ID</p>
              <p className="font-mono text-xs">{attachResult.support_context_id}</p>
            </div>
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">Expires at</p>
              <p className="font-mono text-xs">{new Date(attachResult.expires_at).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">Evidence ID</p>
              <p className="font-mono text-xs">{attachResult.evidence_id}</p>
            </div>
          </div>
          </>
        )}
      </div>

      <div className="pt-4 border-t space-y-4">
        <h3 className="font-medium">Lookup / revoke a support context</h3>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <Field label="Support Context ID" />
            <input
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              data-testid="support-id"
              className="w-full p-2 border rounded font-mono text-sm"
            />
          </div>
          <div>
            <Field label="Revoke reason" />
            <input
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              data-testid="support-revoke-reason"
              className="p-2 border rounded w-48 text-sm"
            />
          </div>
          <Button onClick={handleLookup} loading={lookupLoading} variant="secondary" data-testid="support-get-button">
            {lookupLoading ? "..." : "Get"}
          </Button>
          <Button onClick={handleRevoke} loading={lookupLoading} variant="primary" data-testid="support-revoke-button">
            {lookupLoading ? "..." : "Revoke"}
          </Button>
        </div>

        {notice && (
          <div
            data-testid="support-notice"
            className={`p-3 rounded text-sm ${
              notice.startsWith("OK:") ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30" : "bg-destructive/10 text-destructive border border-destructive/20"
            }`}
          >
            {messageOf(notice)}
          </div>
        )}

        {lookupError && <ErrorNotice message={lookupError} />}

        {grant && (
          <>
          <Outcome
            tone={grant.revoked_at || new Date(grant.expires_at) <= new Date() ? "warn" : "ok"}
            testid="support-grant-outcome"
            headline={
              grant.revoked_at
                ? "This elevation was revoked early and can no longer be used."
                : new Date(grant.expires_at) > new Date()
                  ? `This elevation is live for another ${minutesUntil(grant.expires_at)} minutes.`
                  : "This elevation has expired and can no longer be used."
            }
            detail={
              grant.reviewed_at
                ? `Reviewed by ${grant.reviewed_by}. The break-glass loop is closed for this grant.`
                : "Not yet reviewed. Expired grants are reported every 15 minutes until somebody independent signs them off — neither the grantee nor the approver may do it."
            }
          />
          <div className="p-3 bg-muted rounded space-y-2" data-testid="support-grant">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={grant.revoked_at ? "neutral" : new Date(grant.expires_at) > new Date() ? "success" : "warning"}>
                {grant.revoked_at ? "REVOKED" : new Date(grant.expires_at) > new Date() ? "ACTIVE" : "EXPIRED"}
              </Badge>
              <span className="text-xs text-muted-foreground">{grant.reason_code}</span>
              <span className="text-xs text-muted-foreground">ticket {grant.ticket_ref}</span>
              {grant.reviewed_at && (
                <span className="text-xs text-muted-foreground">reviewed by {grant.reviewed_by}</span>
              )}
            </div>
            <div className="grid gap-2 md:grid-cols-2 text-sm">
              <p><span className="text-xs text-muted-foreground">Tenant:</span> <span className="font-mono">{grant.tenant_id}</span></p>
              <p><span className="text-xs text-muted-foreground">Support principal:</span> <span className="font-mono">{grant.support_principal_id}</span></p>
              <p><span className="text-xs text-muted-foreground">Approver:</span> <span className="font-mono">{grant.approver_principal_id}</span></p>
              <p><span className="text-xs text-muted-foreground">Subject:</span> <span className="font-mono">{grant.subject_principal_id ?? "Tenant-wide"}</span></p>
              <p><span className="text-xs text-muted-foreground">Granted:</span> {new Date(grant.granted_at).toLocaleString()}</p>
              <p><span className="text-xs text-muted-foreground">Expires:</span> {new Date(grant.expires_at).toLocaleString()}</p>
              {grant.revoked_at && (
                <p><span className="text-xs text-muted-foreground">Revoked:</span> {new Date(grant.revoked_at).toLocaleString()} ({grant.revocation_reason})</p>
              )}
            </div>
            <p className="text-sm"><span className="text-xs text-muted-foreground">Justification:</span> {grant.justification}</p>
            <p className="text-xs text-muted-foreground">Evidence: <span className="font-mono">{grant.evidence_id}</span></p>
          </div>
          </>
        )}
      </div>
    </Card>
  );
}

// ─── Platform: JWKS + health ─────────────────────────────────────────────────

function PlatformTab() {
  const [jwks, setJwks] = useState<JWKSResponse | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [jwksError, setJwksError] = useState("");
  const [healthError, setHealthError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setJwksError("");
    setHealthError("");
    const [jwksRes, healthRes] = await Promise.all([getJWKS(), getIdentityHealth()]);
    if (jwksRes.ok) setJwks(jwksRes.data);
    else setJwksError(explainIdentityError(jwksRes.error.message));
    if (healthRes.ok) setHealth(healthRes.data);
    else setHealthError(explainIdentityError(healthRes.error.message));
    setLoading(false);
  }, []);

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Platform surface</h2>
        <p className="text-sm text-muted-foreground mt-1">
          GET /.well-known/jwks.json — the RSA public key every downstream service uses to verify
          the IdentityContextEnvelope (envelopes sign RS256; the bearer token is separately HS256).
          GET /health — readiness including Redis, Postgres and the outbox relay.
        </p>
      </div>

      <Button onClick={loadAll} loading={loading} variant="secondary" data-testid="platform-load">
        {loading ? "Loading..." : "Load JWKS & Health"}
      </Button>

      {healthError && <ErrorNotice message={healthError} />}
      {jwksError && <ErrorNotice message={jwksError} />}

      {health && (
        <div data-testid="health-result" className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge tone={health.status === "healthy" ? "success" : "danger"} dot>
              {health.status}
            </Badge>
            {health.checked_at && (
              <span className="text-xs text-muted-foreground">checked at {new Date(health.checked_at).toLocaleString()}</span>
            )}
          </div>
          {health.checks && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="health-checks">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="p-2">Dependency</th>
                    <th className="p-2">State</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(health.checks).map(([key, value]) => (
                    <tr key={key} className="border-b">
                      <td className="p-2 font-mono text-xs">{key}</td>
                      <td className="p-2">
                        <Badge tone={value === "ok" || value === "ready" ? "success" : value === "degraded" ? "warning" : "danger"}>
                          {value}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {jwks && (
        <div className="space-y-2" data-testid="jwks-result">
          <h3 className="text-sm font-medium">JWKS keys ({jwks.keys.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="jwks-table">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="p-2">kid</th>
                  <th className="p-2">kty</th>
                  <th className="p-2">use</th>
                  <th className="p-2">alg</th>
                  <th className="p-2">n (modulus)</th>
                  <th className="p-2">e (exponent)</th>
                </tr>
              </thead>
              <tbody>
                {jwks.keys.map((k) => (
                  <tr key={k.kid} className="border-b">
                    <td className="p-2 font-mono text-xs">{k.kid}</td>
                    <td className="p-2 font-mono text-xs">{k.kty}</td>
                    <td className="p-2 font-mono text-xs">{k.use}</td>
                    <td className="p-2 font-mono text-xs">{k.alg}</td>
                    <td className="p-2 font-mono text-xs max-w-[220px] truncate" title={k.n}>{k.n.slice(0, 32)}…</td>
                    <td className="p-2 font-mono text-xs">{k.e}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}