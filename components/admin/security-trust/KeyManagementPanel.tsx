"use client";

import { useState, useEffect } from "react";
import { Key, RefreshCw, RotateCw, CheckCircle2, AlertCircle } from "lucide-react";

type KmsKey = {
  key_id: string;
  key_type: "AES_256" | "RSA_4096" | "ECC_SECP256K1";
  purpose: "DATA_ENCRYPTION" | "SIGNING" | "ENVELOPE_ENCRYPTION";
  algorithm: string;
  status: "ACTIVE" | "ROTATING" | "DEPRECATED" | "REVOKED";
  created_by: string;
  expires_at: string;
  rotation_due_at: string;
};

export function KeyManagementPanel() {
  const [keys, setKeys] = useState<KmsKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState<string | null>(null);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/security/keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys ?? []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleRotate = async (keyId: string) => {
    setRotating(keyId);
    try {
      await fetch(`/api/v1/security/keys/${keyId}/rotate`, { method: "POST" });
      await fetchKeys();
    } catch {
      // fallback
    } finally {
      setRotating(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span>KMS Cryptographic Keys & HSM Master Vault</span>
          <span className="font-mono text-[11px] text-slate-400">(:8169)</span>
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

      {loading && keys.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded-md bg-slate-100 dark:bg-slate-800" />
        </div>
      ) : keys.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <Key className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-xs text-slate-500">No cryptographic keys registered.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {keys.map((k) => (
            <div key={k.key_id} className="p-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300">
                    <Key className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {k.key_id}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {k.key_type}
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {k.purpose}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      Algorithm: <span className="font-mono">{k.algorithm}</span> • Rotation due: {new Date(k.rotation_due_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      k.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    }`}
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {k.status}
                  </span>

                  <button
                    type="button"
                    disabled={rotating === k.key_id}
                    onClick={() => handleRotate(k.key_id)}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <RotateCw className={`h-3 w-3 ${rotating === k.key_id ? "animate-spin text-amber-500" : ""}`} />
                    Rotate
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
