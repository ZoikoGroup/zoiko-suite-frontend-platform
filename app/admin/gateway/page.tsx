import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Badge, Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { DetailList, PageHeader } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { GatewayVerifyForm } from "@/components/admin/gateway/GatewayVerifyForm";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { DENIAL_REASONS, readGatewayHealth, type ProbeResult } from "@/lib/api/gateway-auth";

export const metadata: Metadata = { title: "Gateway Authentication | Zoiko Suite" };

function probeBadge(p: ProbeResult, okText: string) {
  if (!p.reachable) return <Badge tone="danger">Not reachable</Badge>;
  if (p.status >= 200 && p.status < 300) return <Badge tone="success">{okText}</Badge>;
  return <Badge tone="warning">Answered {p.status}</Badge>;
}

async function Health() {
  const h = await readGatewayHealth();
  return (
    <DetailList
      items={[
        {
          label: "Process",
          value: probeBadge(h.liveness, "Running"),
          hint: h.liveness.reachable ? `/healthz in ${h.liveness.latencyMs} ms` : h.liveness.detail,
        },
        {
          label: "Able to verify sign-ins",
          value: probeBadge(h.readiness, "Ready"),
          hint: h.readiness.reachable
            ? h.readiness.status >= 300
              ? `The gateway cannot fetch identity-context-svc's keys, so it is refusing every gated request. ${h.readiness.detail ?? ""}`.trim()
              : "/readyz — the gateway can fetch identity-context-svc's signing keys"
            : h.readiness.detail,
        },
        {
          label: "Signing keys published by identity-context-svc",
          value: h.jwks.reachable
            ? h.jwks.keys.length === 0
              ? <Badge tone="danger">None</Badge>
              : `${h.jwks.keys.length} key${h.jwks.keys.length === 1 ? "" : "s"}`
            : <Badge tone="danger">Not reachable</Badge>,
          hint: h.jwks.reachable
            ? h.jwks.keys.map((k) => `${k.kid}${k.alg ? ` (${k.alg})` : ""}`).join(", ") || h.jwks.detail
            : h.jwks.detail,
          wide: true,
        },
      ]}
    />
  );
}

/** Outside the component: whether an envelope has lapsed is a fact about this
 *  request, read once, not something a re-render should be able to change. */
function hasLapsed(expiresAtSeconds: number | undefined): boolean {
  return expiresAtSeconds !== undefined && expiresAtSeconds * 1000 < Date.now();
}

async function SessionFacts() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const viaGateway = process.env.ZOIKO_USE_GATEWAY === "true";
  const expires = session.envelopeExpiresAt ? new Date(session.envelopeExpiresAt * 1000) : null;
  const expired = hasLapsed(session.envelopeExpiresAt);

  return (
    <DetailList
      items={[
        {
          label: "Signed envelope",
          value: session.envelopeJwt ? <Badge tone="success">Present</Badge> : <Badge tone="warning">None</Badge>,
          hint: session.envelopeJwt
            ? "Issued by identity-context-svc at sign-in. This is the credential the gateway verifies."
            : "This session came from the offline fallback. The gateway refuses every gated request without an envelope.",
        },
        {
          label: "Envelope expires",
          value: expires ? (expired ? <Badge tone="warning">Expired {formatDateTime(expires.toISOString())}</Badge> : formatDateTime(expires.toISOString())) : undefined,
          hint: expired ? "Sign in again — the gateway will answer invalid_token." : "Envelopes last minutes, not hours.",
        },
        {
          label: "This console's traffic",
          value: viaGateway ? "Goes through the gateway" : "Goes straight to each service",
          hint: viaGateway
            ? "ZOIKO_USE_GATEWAY=true: every page on this console is subject to the decision below."
            : "ZOIKO_USE_GATEWAY is off, so the gateway is not in this console's path today. The check below shows what it would decide.",
        },
      ]}
    />
  );
}

export default function GatewayPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <PageHeader
        title="Gateway Authentication"
        description="The check every gated request passes before it reaches a service: is the caller who they say they are, may their tenant transact, and does the risk engine object."
      />

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
        <p>
          <strong className="text-slate-900 dark:text-slate-100">Nothing here is configured from this page.</strong>{" "}
          gateway-auth-svc has no settings and no records of its own — it verifies the signed envelope
          from identity-context-svc, asks the tenant registry whether the tenant may transact, and
          sets the identity headers every service then trusts. This page shows whether it is healthy
          and what it would decide for <em>you</em>.
        </p>
        <p className="mt-2">
          <strong className="text-slate-900 dark:text-slate-100">It fails closed both ways.</strong>{" "}
          A caller it cannot verify is refused, and so is a request it cannot decide: when the tenant
          registry or the session check cannot answer it says 503 &ldquo;unresolved&rdquo;, never
          403, because nothing was actually refused.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gateway health</CardTitle>
            <CardDescription>Read live on each page load.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
              <Health />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your session</CardTitle>
            <CardDescription>What you would present to the gateway.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
              <SessionFacts />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Would the gateway let me through?</CardTitle>
          <CardDescription>
            Describes one request to the gateway with your own signed envelope and shows its
            decision — and, when it allows it, the identity it would hand the service. Your envelope
            stays on the server; nothing is minted or changed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GatewayVerifyForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What each refusal means</CardTitle>
          <CardDescription>
            The gateway names its reason in the X-Auth-Denial-Reason header, which reaches the caller
            unchanged. The same status codes mean different things depending on that reason.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900/60">
                <tr>
                  <th className={`${HEAD} text-left`}>Reason</th>
                  <th className={`${HEAD} text-left`}>Status</th>
                  <th className={`${HEAD} text-left`}>What happened</th>
                  <th className={`${HEAD} text-left`}>What to do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {DENIAL_REASONS.map((r) => (
                  <tr key={r.code}>
                    <td className={`${CELL} font-mono text-xs`}>{r.code}</td>
                    <td className={CELL}>{r.status}</td>
                    <td className={CELL}>{r.meaning}</td>
                    <td className={CELL}>{r.fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
