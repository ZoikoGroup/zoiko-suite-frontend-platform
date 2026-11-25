// The Diagnostics tab: what a relying party sees of identity-context-svc
// (health, signing keys, OIDC metadata) and the recorded account of one
// session's resolution. Every value is read live; an unreadable source says
// so in its own card rather than showing an empty one.

import type { ReactNode } from "react";
import { Activity, FileSearch, KeyRound, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui";
import { DrawerFacts, DrawerNote } from "@/components/admin/console";
import type { ApiError, ApiResult } from "@/lib/api/client";
import type { ContextExplanation, HealthStatus, JWKSResponse, OidcDiscovery } from "@/lib/api/identity";
import { formatDateTime } from "@/lib/format";
import { BASE } from "./registers";

export type Diagnostics = {
  health: ApiResult<HealthStatus>;
  jwks: ApiResult<JWKSResponse>;
  discovery: ApiResult<OidcDiscovery>;
  /** The session asked about (?sid=), and the service's account of it. */
  sid?: string;
  explain?: ApiResult<ContextExplanation>;
};

function Card({ icon: Icon, title, children }: { icon: typeof Activity; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-navy-950 dark:text-slate-100">
        <Icon className="h-4 w-4 text-gold-500" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function unreadable(what: string, error: ApiError): ReactNode {
  const why = error.kind === "unreachable" || error.kind === "timeout" ? "the identity service is not reachable" : `HTTP ${error.status ?? error.kind}`;
  return <DrawerNote>{`The ${what} could not be read (${why}).`}</DrawerNote>;
}

export function DiagnosticsView({ d }: { d: Diagnostics }) {
  return (
    <div className="grid gap-4 p-5 lg:grid-cols-2">
      <Card icon={Activity} title="Service health">
        {d.health.ok ? (
          <DrawerFacts
            items={[
              { label: "Overall", value: <Badge tone={d.health.data.status === "healthy" ? "success" : "warning"}>{d.health.data.status}</Badge> },
              ...Object.entries(d.health.data.checks ?? {}).map(([k, v]) => ({
                label: k.replaceAll("_", " "),
                // A count (outbox_pending) is a reading, not a verdict.
                value: /^\d+$/.test(v) ? (
                  <span className="tabular-nums">{v}</span>
                ) : (
                  <Badge tone={v === "ok" ? "success" : "danger"}>{v}</Badge>
                ),
              })),
            ]}
          />
        ) : (
          unreadable("health report", d.health.error)
        )}
      </Card>

      <Card icon={KeyRound} title="Envelope signing keys (JWKS)">
        {d.jwks.ok ? (
          d.jwks.data.keys.length === 0 ? (
            <DrawerNote>The key set is empty: no relying party can verify an envelope.</DrawerNote>
          ) : (
            <DrawerFacts items={d.jwks.data.keys.map((k) => ({ label: k.kid, value: `${k.alg} · ${k.kty} · ${k.use}` }))} />
          )
        ) : (
          unreadable("key set", d.jwks.error)
        )}
      </Card>

      <Card icon={ShieldCheck} title="Hosted login (OIDC metadata)">
        {d.discovery.ok ? (
          <DrawerFacts
            items={[
              { label: "Issuer", value: d.discovery.data.issuer },
              { label: "Authorization", value: d.discovery.data.authorization_endpoint },
              { label: "Token", value: d.discovery.data.token_endpoint },
              { label: "PKCE", value: (d.discovery.data.code_challenge_methods_supported ?? []).join(", ") || "—" },
              { label: "Grants", value: (d.discovery.data.grant_types_supported ?? []).join(", ") || "—" },
              { label: "Client auth", value: (d.discovery.data.token_endpoint_auth_methods_supported ?? []).join(", ") || "—" },
              { label: "DPoP", value: (d.discovery.data.dpop_signing_alg_values_supported ?? []).join(", ") || "Not offered" },
            ]}
          />
        ) : (
          unreadable("OIDC metadata", d.discovery.error)
        )}
      </Card>

      <Card icon={FileSearch} title="Explain a session">
        <form action={BASE} method="get" className="flex gap-2">
          <input type="hidden" name="tab" value="diagnostics" />
          <label className="sr-only" htmlFor="diag-sid">
            Session context ID
          </label>
          <input
            id="diag-sid"
            name="sid"
            defaultValue={d.sid ?? ""}
            placeholder="Session context ID"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-[12px] dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-navy-950 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <Search className="h-3.5 w-3.5" />
            Explain
          </button>
        </form>
        {!d.sid ? (
          <DrawerNote>Paste a session context ID from the Live sessions tab to see how each of its six dimensions was resolved, and from where.</DrawerNote>
        ) : !d.explain ? null : d.explain.ok ? (
          <ExplainFacts e={d.explain.data} />
        ) : d.explain.error.status === 404 ? (
          <DrawerNote>No session with that ID in this tenant.</DrawerNote>
        ) : d.explain.error.status === 403 ? (
          <DrawerNote>You don&apos;t have access to session explanations.</DrawerNote>
        ) : (
          unreadable("explanation", d.explain.error)
        )}
      </Card>
    </div>
  );
}

function ExplainFacts({ e }: { e: ContextExplanation }) {
  return (
    <div className="mt-2">
      <DrawerFacts
        items={[
          { label: "Outcome", value: e.outcome.replaceAll("_", " ") },
          { label: "Principal", value: <span className="font-mono text-[11px]">{e.principal_id}</span> },
          { label: "Legal entity", value: e.legal_entity_id || "Tenant-wide" },
          { label: "Ingress", value: e.ingress_source },
          ...e.dimensions.map((x) => ({ label: `${x.dimension}. ${x.name}`, value: `${x.result} · from ${x.source}` })),
          { label: "Issued", value: formatDateTime(e.issued_at) },
          { label: "Expires", value: formatDateTime(e.expires_at) },
          ...(e.invalidated_at ? [{ label: "Ended", value: `${formatDateTime(e.invalidated_at)} · ${e.invalidation_reason ?? ""}` }] : []),
          { label: "Reconstructed from", value: e.reconstructed_from },
        ]}
      />
    </div>
  );
}
