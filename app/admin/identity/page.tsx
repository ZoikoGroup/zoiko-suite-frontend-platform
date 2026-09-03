"use client";

import { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  resolveIdentity,
  getSession,
  invalidateSession,
  getPrincipal,
  getPrincipalRoles,
  getPrincipalDelegations,
  updatePrincipalStatus,
  type ResolveRequest,
  type Principal,
  type PrincipalRoleAssignment,
  type DelegatedAuthority,
  type PrincipalStatus,
  explainIdentityError,
} from "@/lib/api/identity";
import { apiGet, type Identity } from "@/lib/api/client";

const DEMO_IDENTITY: Identity & { principalId: string; tenantId: string } = {
  principalId: "demo-admin",
  tenantId: "demo-tenant",
  legalEntityId: "demo-entity",
};

export default function IdentityAdminPage() {
  const [activeTab, setActiveTab] = useState<"resolve" | "principal" | "session">("resolve");

  // Resolve tab state
  const [bearerToken, setBearerToken] = useState("");
  const [legalEntityId, setLegalEntityId] = useState(DEMO_IDENTITY.legalEntityId!);
  const [resolveResult, setResolveResult] = useState<{ envelopeJwt?: string; error?: string }>({});
  const [resolving, setResolving] = useState(false);

  // Principal tab state
  const [principalId, setPrincipalId] = useState("");
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [roles, setRoles] = useState<PrincipalRoleAssignment[]>([]);
  const [delegations, setDelegations] = useState<DelegatedAuthority[]>([]);
  const [principalLoading, setPrincipalLoading] = useState(false);
  const [principalError, setPrincipalError] = useState("");
  const [statusAction, setStatusAction] = useState<{ status: PrincipalStatus; reason: string }>({ status: "SUSPENDED", reason: "" });
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState("");

  // Session tab state
  const [sessionId, setSessionId] = useState("");
  const [sessionResult, setSessionResult] = useState<{ envelopeJwt?: string; error?: string }>({});
  const [sessionLoading, setSessionLoading] = useState(false);

  const callerIdentity = DEMO_IDENTITY;

  // Resolve Identity
  const handleResolve = useCallback(async () => {
    if (!bearerToken.trim()) {
      setResolveResult({ error: "Bearer token is required" });
      return;
    }
    setResolving(true);
    setResolveResult({});

    const request: ResolveRequest = {
      bearer_token: bearerToken.trim(),
      legal_entity_id: legalEntityId.trim(),
      correlation_id: crypto.randomUUID(),
    };

    const result = await resolveIdentity({ request, callerIdentity });
    if (result.ok) {
      setResolveResult({ envelopeJwt: result.data.envelope_jwt });
    } else {
      setResolveResult({ error: explainIdentityError(result.error.message) });
    }
    setResolving(false);
  }, [bearerToken, legalEntityId]);

  // Get Session
  const handleGetSession = useCallback(async () => {
    if (!sessionId.trim()) {
      setSessionResult({ error: "Session Context ID is required" });
      return;
    }
    setSessionLoading(true);
    setSessionResult({});

    const result = await getSession({ sessionContextId: sessionId.trim(), callerTenantId: DEMO_IDENTITY.tenantId! });
    if (result.ok) {
      setSessionResult({ envelopeJwt: result.data.envelope_jwt });
    } else {
      setSessionResult({ error: explainIdentityError(result.error.message) });
    }
    setSessionLoading(false);
  }, [sessionId]);

  // Invalidate Session
  const handleInvalidateSession = useCallback(async () => {
    if (!sessionId.trim()) {
      setSessionResult({ error: "Session Context ID is required" });
      return;
    }
    setSessionLoading(true);

    const result = await invalidateSession({
      sessionContextId: sessionId.trim(),
      request: { reason: "ADMIN_REVOKE" },
      actorPrincipalId: DEMO_IDENTITY.principalId!,
      correlationId: crypto.randomUUID(),
      callerTenantId: DEMO_IDENTITY.tenantId!,
    });
    if (result.ok) {
      setSessionResult({ envelopeJwt: undefined, error: "Session invalidated successfully" });
    } else {
      setSessionResult({ error: explainIdentityError(result.error.message) });
    }
    setSessionLoading(false);
  }, [sessionId]);

  // Load Principal
  const handleLoadPrincipal = useCallback(async () => {
    if (!principalId.trim()) {
      setPrincipalError("Principal ID is required");
      return;
    }
    setPrincipalLoading(true);
    setPrincipalError("");
    setPrincipal(null);
    setRoles([]);
    setDelegations([]);

    const [principalRes, rolesRes, delegationsRes] = await Promise.all([
      getPrincipal({ principalId: principalId.trim(), callerTenantId: DEMO_IDENTITY.tenantId! }),
      getPrincipalRoles({ principalId: principalId.trim(), callerTenantId: DEMO_IDENTITY.tenantId! }),
      getPrincipalDelegations({ principalId: principalId.trim(), callerTenantId: DEMO_IDENTITY.tenantId! }),
    ]);

    if (!principalRes.ok) {
      setPrincipalError(explainIdentityError(principalRes.error.message));
    } else {
      setPrincipal(principalRes.data);
    }
    if (rolesRes.ok) setRoles(rolesRes.data);
    if (delegationsRes.ok) setDelegations(delegationsRes.data);

    setPrincipalLoading(false);
  }, [principalId]);

  // Update Principal Status
  const handleUpdateStatus = useCallback(async () => {
    if (!principalId.trim()) {
      setStatusError("Load a principal first");
      return;
    }
    setStatusLoading(true);
    setStatusError("");

    const result = await updatePrincipalStatus({
      principalId: principalId.trim(),
      status: statusAction.status,
      reason: statusAction.reason.trim() || undefined,
      actorPrincipalId: DEMO_IDENTITY.principalId!,
      correlationId: crypto.randomUUID(),
      callerTenantId: DEMO_IDENTITY.tenantId!,
    });

    if (result.ok) {
      setStatusError(`Status updated to ${statusAction.status}`);
      // Refresh principal
      const refreshed = await getPrincipal({ principalId: principalId.trim(), callerTenantId: DEMO_IDENTITY.tenantId! });
      if (refreshed.ok) setPrincipal(refreshed.data);
    } else {
      setStatusError(explainIdentityError(result.error.message));
    }
    setStatusLoading(false);
  }, [principalId, statusAction]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold">Identity Context Service</h1>
      <p className="text-muted-foreground">
        Identity resolution, session management, and principal administration.
        All calls forward X-Principal-Id / X-Tenant-Id / X-Legal-Entity-Id headers.
      </p>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4" role="tablist">
          {(["resolve", "principal", "session"] as const).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
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

      {/* Resolve Tab */}
      {activeTab === "resolve" && (
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Resolve Identity</h2>
          <p className="text-sm text-muted-foreground">
            Verifies a bearer token and returns a signed IdentityContextEnvelope (RS256 JWT)
            containing all six identity dimensions.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">Bearer Token</label>
              <textarea
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                placeholder="Paste IdP bearer token here..."
                className="w-full p-2 border rounded font-mono text-xs min-h-[120px] resize-y"
                rows={6}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Legal Entity ID</label>
              <input
                type="text"
                value={legalEntityId}
                onChange={(e) => setLegalEntityId(e.target.value)}
                className="w-full p-2 border rounded font-mono text-sm"
                placeholder="e.g., demo-entity"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleResolve} disabled={resolving} className="w-fit">
              {resolving ? "Resolving..." : "Resolve Identity"}
            </Button>
          </div>

          {resolveResult.envelopeJwt && (
            <div className="space-y-2">
              <h3 className="font-medium">Envelope JWT</h3>
              <textarea
                readOnly
                value={resolveResult.envelopeJwt}
                className="w-full p-2 border rounded font-mono text-xs min-h-[100px] bg-muted"
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                Copy this JWT to downstream services. It contains: principal, tenant, legal entity,
                role profile, delegations, and trust posture.
              </p>
            </div>
          )}

          {resolveResult.error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm">
              {resolveResult.error}
            </div>
          )}
        </Card>
      )}

      {/* Principal Tab */}
      {activeTab === "principal" && (
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h2 className="text-xl font-semibold">Principal Lookup & Management</h2>

            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Principal ID</label>
                <input
                  type="text"
                  value={principalId}
                  onChange={(e) => setPrincipalId(e.target.value)}
                  className="w-full p-2 border rounded font-mono text-sm"
                  placeholder="e.g., principal-123"
                />
              </div>
              <Button onClick={handleLoadPrincipal} disabled={principalLoading}>
                {principalLoading ? "Loading..." : "Load Principal"}
              </Button>
            </div>

            {principalError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm">
                {principalError}
              </div>
            )}

            {principal && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Principal ID</p>
                  <p className="font-mono text-sm">{principal.principal_id}</p>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Tenant</p>
                  <p className="font-mono text-sm">{principal.tenant_id}</p>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="font-mono text-sm">{principal.principal_type}</p>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm">{principal.email}</p>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Display Name</p>
                  <p className="text-sm">{principal.display_name}</p>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge tone={principal.status === "ACTIVE" ? "success" : principal.status === "SUSPENDED" ? "warning" : "danger"}>
                    {principal.status}
                  </Badge>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm font-mono">{new Date(principal.created_at).toLocaleString()}</p>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Classification</p>
                  <p className="text-sm">{principal.data_classification}</p>
                </div>
                <div className="p-3 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">IdP Subject</p>
                  <p className="font-mono text-xs">{principal.identity_provider_subject}</p>
                </div>
              </div>
            )}

            {principal && (
              <>
                <div className="pt-4 border-t">
                  <h3 className="font-medium mb-2">Status Transition</h3>
                  <div className="flex gap-3 items-end flex-wrap">
                    <select
                      value={statusAction.status}
                      onChange={(e) => setStatusAction({ ...statusAction, status: e.target.value as PrincipalStatus })}
                      className="p-2 border rounded w-48"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                      <option value="DISABLED">DISABLED</option>
                    </select>
                    <input
                      type="text"
                      value={statusAction.reason}
                      onChange={(e) => setStatusAction({ ...statusAction, reason: e.target.value })}
                      placeholder="Reason (optional)"
                      className="p-2 border rounded flex-1 min-w-[200px]"
                    />
                    <Button onClick={handleUpdateStatus} disabled={statusLoading} variant="primary">
                      {statusLoading ? "Updating..." : "Update Status"}
                    </Button>
                  </div>
                  {statusError && (
                    <p className={`text-sm mt-2 ${statusError.startsWith("Status updated") ? "text-green-600" : "text-destructive"}`}>
                      {statusError}
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <h3 className="font-medium mb-2">Role Assignments ({roles.length})</h3>
                  {roles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active role assignments</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b">
                            <th className="p-2">Assignment ID</th>
                            <th className="p-2">Role ID</th>
                            <th className="p-2">Legal Entity</th>
                            <th className="p-2">Effective From</th>
                            <th className="p-2">Effective To</th>
                            <th className="p-2">Assigned By</th>
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
                  <h3 className="font-medium mb-2">Active Delegations ({delegations.length})</h3>
                  {delegations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active delegations</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
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
              </>
            )}
          </Card>
        </div>
      )}

      {/* Session Tab */}
      {activeTab === "session" && (
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Session Management</h2>
          <p className="text-sm text-muted-foreground">
            Re-validate or invalidate a session context by its ID.
          </p>

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Session Context ID</label>
              <input
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="w-full p-2 border rounded font-mono text-sm"
                placeholder="e.g., 01ARZ3NDEKTSV4RRFFQ69G5FAV"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleGetSession} disabled={sessionLoading}>
                {sessionLoading ? "Loading..." : "Get Session"}
              </Button>
              <Button onClick={handleInvalidateSession} disabled={sessionLoading} variant="secondary">
                {sessionLoading ? "Invalidating..." : "Invalidate Session"}
              </Button>
            </div>
          </div>

          {sessionResult.envelopeJwt && (
            <div className="space-y-2">
              <h3 className="font-medium">Session Envelope JWT</h3>
              <textarea
                readOnly
                value={sessionResult.envelopeJwt}
                className="w-full p-2 border rounded font-mono text-xs min-h-[100px] bg-muted"
                rows={5}
              />
            </div>
          )}

          {sessionResult.error && (
            <div className={`p-3 rounded text-sm ${sessionResult.error.startsWith("Session invalidated") ? "bg-green-50 text-green-700 border border-green-200" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
              {sessionResult.error}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}