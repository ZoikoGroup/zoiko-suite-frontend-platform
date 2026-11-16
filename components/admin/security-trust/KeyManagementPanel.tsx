"use client";

import { useState, useEffect } from "react";
import { Key, RefreshCw, RotateCw, CheckCircle2 } from "lucide-react";
import { fetchPanelList } from "@/lib/panel-fetch";
import type { CustomerKey } from "@/lib/api/security-trust";
import { CreateRecordForm } from "@/components/admin/intelligence/CreateRecordForm";
import { opts, type FieldSpec } from "@/components/admin/intelligence/create-state";
import { registerKeyAction, disableKeyAction } from "@/app/admin/security/actions";

const KEY_FIELDS: FieldSpec[] = [
  { name: "key_alias", label: "Key alias", kind: "text", required: true },
  { name: "key_model", label: "Key model", kind: "select", required: true, options: opts("SYSTEM_MANAGED", "BYOK", "HYOK") },
  { name: "key_provider", label: "Key provider", kind: "select", required: true, options: opts("AWS_KMS", "AZURE_KEY_VAULT", "GCP_KMS", "HASHICORP_VAULT", "EXTERNAL_HSM") },
  {
    name: "external_key_arn",
    label: "External key reference (ARN / key URI)",
    kind: "text",
    hint: "Required by the service for BYOK and HYOK. The key itself stays in your KMS or HSM.",
  },
];

export function KeyManagementPanel() {
  const [keys, setKeys] = useState<CustomerKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const fetchKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await fetchPanelList<CustomerKey>("/api/v1/security/keys", "keys", "key-management-svc"));
    } catch (e) {
      setKeys([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleRotate = async (keyId: string) => {
    setRotating(keyId);
    setActionError(null);
    try {
      const res = await fetch(`/api/v1/security/keys/${encodeURIComponent(keyId)}/rotate`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setActionError(`Rotation was refused: ${body?.error ?? `HTTP ${res.status}`}`);
      }
      await fetchKeys();
    } catch {
      setActionError("Rotation could not be sent to key-management-svc.");
    } finally {
      setRotating(null);
    }
  };

  // Disabling records the key as DISABLED in the registry; it does not touch
  // the key in the customer's KMS. Two clicks, so a stray one does nothing.
  const handleDisable = async (keyId: string) => {
    if (confirmDisable !== keyId) {
      setConfirmDisable(keyId);
      return;
    }
    setConfirmDisable(null);
    setDisabling(keyId);
    setActionError(null);
    setActionNote(null);
    try {
      const res = await disableKeyAction(keyId);
      if (res.ok) setActionNote(res.message);
      else setActionError(`Disable was refused${res.httpStatus ? ` (HTTP ${res.httpStatus})` : ""}: ${res.message}`);
      await fetchKeys();
    } catch {
      setActionError("Disable could not be sent to key-management-svc.");
    } finally {
      setDisabling(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>Customer key registry: key metadata only, no cryptographic operations</span>
          <span className="font-mono text-[11px] text-slate-400">key-management-svc</span>
        </div>
        <button
          type="button"
          onClick={fetchKeys}
          className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <CreateRecordForm
        title="Register key metadata"
        description="key-management-svc records the key's alias, model, provider and external reference only. It is a registry, not a KMS: no key is generated, imported or used for any cryptographic operation."
        fields={KEY_FIELDS}
        action={registerKeyAction}
        submitLabel="Register metadata"
        onCreated={fetchKeys}
      />
      {actionNote && <p role="status" className="text-xs text-slate-600 dark:text-slate-300">{actionNote}</p>}

      {loading && keys.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : error ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">{error}</p>
      ) : keys.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <Key className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-xs text-slate-500">No cryptographic keys registered.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {actionError && (
            <p className="px-3.5 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10">{actionError}</p>
          )}
          {keys.map((k) => (
            <div key={k.id} className="p-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300">
                    <Key className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {k.key_alias}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {k.key_model}
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {k.key_provider.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      Version {k.key_version} • rotated {k.rotation_count}×
                      {k.last_rotated_at ? ` • last ${new Date(k.last_rotated_at).toLocaleDateString()}` : ""} •{" "}
                      <span className="font-mono">{k.external_key_arn}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      k.state === "ENABLED"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    }`}
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {k.state}
                  </span>

                  <button
                    type="button"
                    disabled={rotating === k.id}
                    onClick={() => handleRotate(k.id)}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <RotateCw className={`h-3 w-3 ${rotating === k.id ? "animate-spin text-amber-500" : ""}`} />
                    Rotate
                  </button>
                  <button
                    type="button"
                    disabled={disabling === k.id || k.state === "DISABLED"}
                    onClick={() => handleDisable(k.id)}
                    className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900 dark:bg-slate-800 dark:text-rose-300"
                  >
                    {disabling === k.id ? "Disabling…" : confirmDisable === k.id ? "Confirm disable" : "Disable"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
