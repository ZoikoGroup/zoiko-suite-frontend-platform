"use client";

// Create forms for the Block 10 panels. Registering a connection records it in
// its service; none of these services has a provider adapter in this build,
// so nothing here connects to a bank, HRIS, signature or market-data provider.

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { CreateRecordForm, CreateResult } from "@/components/admin/intelligence/CreateRecordForm";
import { IDLE, opts, type FieldSpec } from "@/components/admin/intelligence/create-state";
import { FIELD, LABEL, BANNER_ERROR } from "@/components/admin/shared/form";
import {
  createBridgeAction,
  createBankConnectionAction,
  createHrisIntegrationAction,
  createDataFeedAction,
  createEnvelopeAction,
  createSignatureProfileAction,
  lookupSignatureProfile,
  transitionSignatureProfileAction,
  type ProfileResult,
} from "@/app/admin/integration/actions";
import type { SignatureProfile } from "@/lib/api/integration";

type OnCreated = { onCreated?: () => void };

const BRIDGE_FIELDS: FieldSpec[] = [
  { name: "bridge_name", label: "Bridge name", kind: "text", required: true },
  { name: "provider_name", label: "Provider name", kind: "text", required: true },
  { name: "protocol", label: "Protocol", kind: "text", required: true, hint: "e.g. REST, GRAPHQL, GRPC, WEBHOOK" },
  { name: "endpoint_url", label: "Endpoint URL", kind: "url", required: true, hint: "An absolute URL; the service refuses anything else." },
  { name: "auth_type", label: "Auth type", kind: "text", required: true, hint: "e.g. OAUTH2, API_KEY" },
];

export function BridgeCreateForm({ onCreated }: OnCreated) {
  return (
    <CreateRecordForm
      title="Register bridge"
      description="connectivity-api-bridge-svc records the bridge as DRAFT. It does not call the endpoint."
      fields={BRIDGE_FIELDS}
      action={createBridgeAction}
      submitLabel="Register bridge"
      onCreated={onCreated}
    />
  );
}

const BANK_FIELDS: FieldSpec[] = [
  { name: "bank_name", label: "Bank name", kind: "text", required: true },
  { name: "bic", label: "BIC", kind: "text", required: true },
  { name: "account_number", label: "Account number", kind: "text", required: true },
  { name: "iban", label: "IBAN", kind: "text" },
  { name: "currency", label: "Currency", kind: "text", required: true, hint: "ISO 4217 code of the account." },
  { name: "account_type", label: "Account type", kind: "text", hint: "e.g. CURRENT, SAVINGS" },
];

export function BankConnectionCreateForm({ onCreated }: OnCreated) {
  return (
    <CreateRecordForm
      title="Register bank connection"
      description="banking-connector-svc records the connection. No bank API is called: no adapter is configured. Account details are not shown back here."
      fields={BANK_FIELDS}
      action={createBankConnectionAction}
      submitLabel="Register connection"
      onCreated={onCreated}
    />
  );
}

const HRIS_FIELDS: FieldSpec[] = [
  { name: "provider_name", label: "Provider name", kind: "text", required: true },
  { name: "sync_type", label: "Sync type", kind: "text", required: true, hint: "e.g. EMPLOYEES" },
  { name: "direction", label: "Direction", kind: "text", required: true, hint: "e.g. INBOUND, OUTBOUND" },
  { name: "api_endpoint", label: "API endpoint", kind: "url", required: true },
];

export function HrisIntegrationCreateForm({ onCreated }: OnCreated) {
  return (
    <CreateRecordForm
      title="Register HRIS integration"
      description="hris-connector-svc records the integration as PENDING. A sync is refused (503) until an HRIS adapter is configured."
      fields={HRIS_FIELDS}
      action={createHrisIntegrationAction}
      submitLabel="Register integration"
      onCreated={onCreated}
    />
  );
}

const FEED_FIELDS: FieldSpec[] = [
  { name: "provider", label: "Provider", kind: "text", required: true },
  { name: "feed_type", label: "Feed type", kind: "select", required: true, options: opts("MARKET_DATA", "CREDIT_SCORE", "COMPANY_INFO", "FX_RATE", "ESG_DATA") },
  { name: "symbol", label: "Symbol", kind: "text", required: true },
];

export function DataFeedCreateForm({ onCreated }: OnCreated) {
  return (
    <CreateRecordForm
      title="Subscribe to a data feed"
      description="external-data-feed-svc records the subscription. No market-data provider is connected, so no data arrives from it."
      fields={FEED_FIELDS}
      action={createDataFeedAction}
      submitLabel="Subscribe"
      onCreated={onCreated}
    />
  );
}

// ── eSignature ────────────────────────────────────────────────────────────────

const ENVELOPE_FIELDS: FieldSpec[] = [
  { name: "document_title", label: "Document title", kind: "text", required: true },
  { name: "signer_name", label: "Signer name", kind: "text", required: true },
  { name: "signer_email", label: "Signer email", kind: "email", required: true },
  { name: "provider", label: "Provider", kind: "select", required: true, options: opts("DOCUSIGN", "ADOBE_SIGN") },
];

export function EnvelopeCreateForm({ onCreated }: OnCreated) {
  return (
    <CreateRecordForm
      title="Send envelope"
      description="No e-signature provider adapter is configured in this build: esignature-integration-svc refuses the envelope (503) and records nothing. Its answer is shown as it is."
      fields={ENVELOPE_FIELDS}
      action={createEnvelopeAction}
      submitLabel="Send envelope"
      onCreated={onCreated}
    />
  );
}

const PROFILE_FIELDS: FieldSpec[] = [
  { name: "assurance_level", label: "Assurance level", kind: "select", required: true, options: opts("SES", "AES", "QES") },
  { name: "jurisdiction", label: "Jurisdiction", kind: "text", required: true, hint: "e.g. GB" },
  { name: "identity_requirement", label: "Identity requirement", kind: "select", required: true, options: opts("EMAIL_ONLY", "KBA", "GOV_ID", "VIDEO_ID") },
  { name: "witness_required", label: "Witness required", kind: "checkbox" },
];

const PROFILE_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  RETIRED: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

/**
 * Signature profiles: the governed terms an envelope is signed under. They
 * need no provider. esignature-integration-svc has no route that lists them,
 * so a profile is shown when it is created here or looked up by its id; the
 * ids created in this view are kept in memory only, never stored.
 */
export function SignatureProfilesSection() {
  const [state, formAction, pending] = useActionState(createSignatureProfileAction, IDLE);
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<SignatureProfile[]>([]);
  const [lookupId, setLookupId] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const lastSeq = useRef(0);

  // A created profile joins the list, read back from the service by its id.
  useEffect(() => {
    if (state.seq === lastSeq.current) return;
    lastSeq.current = state.seq;
    if (state.status !== "created") return;
    const id = state.fields.find(([k]) => k === "Profile ID")?.[1];
    if (!id) return;
    void lookupSignatureProfile(id).then((r) => {
      if (r.ok) setProfiles((list) => [r.profile, ...list.filter((p) => p.profile_id !== r.profile.profile_id)]);
    });
  }, [state]);

  const apply = (r: ProfileResult, verb: string) => {
    if (r.ok) {
      setProfiles((list) => [r.profile, ...list.filter((p) => p.profile_id !== r.profile.profile_id)]);
      setNote({ ok: true, text: `HTTP ${r.httpStatus}: profile ${r.profile.profile_id} is ${r.profile.status}.` });
    } else {
      setNote({ ok: false, text: `${verb} refused${r.httpStatus ? ` (HTTP ${r.httpStatus})` : ""}: ${r.message}` });
    }
  };

  const lookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    startTransition(async () => apply(await lookupSignatureProfile(lookupId), "Lookup"));
  };

  const transition = (id: string, to: "activate" | "retire") => {
    if (busy) return;
    startTransition(async () => apply(await transitionSignatureProfileAction(id, to), to === "activate" ? "Activation" : "Retirement"));
  };

  return (
    <section aria-label="Signature profiles" className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div>
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Signature profiles</p>
        <p className="text-[11px] text-slate-500">
          DRAFT → ACTIVE (terms become permanent) → RETIRED. Profiles need no provider. The service has no list route, so look one up by its id.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          New signature profile
        </button>
      </div>

      {open && (
        <form key={state.seq} action={formAction} aria-label="New signature profile" noValidate className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50/70 p-3 sm:grid-cols-2 dark:bg-slate-800/40">
          {PROFILE_FIELDS.map((f) => {
            const id = `sig-profile-${f.name}`;
            const initial = state.status === "error" ? state.values[f.name] ?? "" : "";
            if (f.kind === "checkbox") {
              return (
                <label key={f.name} htmlFor={id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <input id={id} name={f.name} type="checkbox" defaultChecked={initial === "on"} className="h-3.5 w-3.5" />
                  {f.label}
                </label>
              );
            }
            return (
              <div key={f.name}>
                <label htmlFor={id} className={LABEL}>{f.label}</label>
                {f.kind === "select" ? (
                  <select id={id} name={f.name} defaultValue={initial} aria-required className={FIELD}>
                    <option value="">Select…</option>
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input id={id} name={f.name} defaultValue={initial} aria-required placeholder={f.hint} autoComplete="off" className={FIELD} />
                )}
              </div>
            );
          })}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
            >
              {pending && <Loader2 className="h-3 w-3 animate-spin" />}
              {pending ? "Sending…" : "Create profile"}
            </button>
          </div>
        </form>
      )}
      <CreateResult state={state} />

      <form onSubmit={lookup} aria-label="Look up signature profile" className="flex flex-wrap items-end gap-2">
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="sig-profile-lookup" className={LABEL}>Profile ID</label>
          <input id="sig-profile-lookup" value={lookupId} onChange={(e) => setLookupId(e.target.value)} autoComplete="off" className={FIELD} />
        </div>
        <button
          type="submit"
          disabled={busy || !lookupId.trim()}
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          Look up
        </button>
      </form>

      {note && (
        <p role={note.ok ? "status" : "alert"} className={note.ok ? "text-xs text-slate-600 dark:text-slate-300" : `rounded-lg border px-3 py-2 text-xs ${BANNER_ERROR}`}>
          {note.text}
        </p>
      )}

      {profiles.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {profiles.map((p) => (
            <li key={p.profile_id} data-profile-id={p.profile_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                <span className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${PROFILE_BADGE[p.status] ?? PROFILE_BADGE.DRAFT}`} data-field="profile-status">
                  {p.status}
                </span>
                {p.assurance_level} · {p.jurisdiction || "no jurisdiction"} · {p.identity_requirement} · witness {p.witness_required ? "required" : "not required"}
                <span className="ml-2 font-mono text-slate-400">{p.profile_id}</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={busy || p.status !== "DRAFT"}
                  onClick={() => transition(p.profile_id, "activate")}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Activate
                </button>
                <button
                  type="button"
                  disabled={busy || p.status !== "ACTIVE"}
                  onClick={() => transition(p.profile_id, "retire")}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Retire
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
