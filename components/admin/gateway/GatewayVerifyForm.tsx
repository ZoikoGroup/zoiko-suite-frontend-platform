"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { CopyableId, DetailList, ResultBanner } from "@/components/admin/shared";
import { FIELD, HINT, LABEL } from "@/components/admin/shared/form";
import { verifySessionAction } from "@/app/admin/gateway/actions";
import { IDLE_GATEWAY_VERIFY, type GatewayVerifyState } from "@/app/admin/gateway/state";

/** allowed is green only when every compared header matches; a gateway that
 *  lets a request through as somebody else is not a success. */
function tone(state: GatewayVerifyState) {
  switch (state.status) {
    case "allowed":
      return Object.values(state.matches).every(Boolean) ? "success" : "error";
    case "refused":
      return "warning";
    case "unresolved":
    case "unreachable":
    case "error":
      return "error";
    default:
      return "neutral";
  }
}

const SUGGESTED_PATHS = [
  "/policy-svc/v1/policies",
  "/obligations-svc/v1/obligations",
  "/tenant-entity-registry-svc/v1/tenants",
  "/workflow-svc/v1/workflows/pending",
];

export function GatewayVerifyForm() {
  const [state, action, pending] = useActionState<GatewayVerifyState, FormData>(
    verifySessionAction,
    IDLE_GATEWAY_VERIFY,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label className={LABEL} htmlFor="forwarded_method">
            Method
          </label>
          <select id="forwarded_method" name="forwarded_method" className={FIELD} defaultValue="GET">
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <p className={HINT}>Only described to the gateway — nothing is sent to the service.</p>
        </div>
        <div className="sm:col-span-3">
          <label className={LABEL} htmlFor="forwarded_uri">
            Path, as it would arrive at the gateway
          </label>
          <input
            id="forwarded_uri"
            name="forwarded_uri"
            list="gateway-paths"
            defaultValue={SUGGESTED_PATHS[0]}
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
          <datalist id="gateway-paths">
            {SUGGESTED_PATHS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
      </div>

      <Button type="submit" size="sm" loading={pending}>
        {pending ? "Asking the gateway…" : "Check my session"}
      </Button>

      <ResultBanner tone={tone(state)} message={"message" in state ? state.message : undefined}>
        {"outcome" in state && (
          <div className="space-y-3">
            <DetailList
              items={[
                {
                  label: "Gateway answer",
                  value: state.outcome.status === 0 ? "No answer" : `${state.outcome.status}${state.outcome.allowed ? " — allowed" : " — refused"}`,
                },
                { label: "Reason given", value: state.outcome.denialReason, hint: state.outcome.body || undefined },
                { label: "Tenant context", value: state.outcome.tenantContext },
                { label: "Risk engine said", value: state.outcome.cartaDecision },
                { label: "Retry after", value: state.outcome.retryAfter ? `${state.outcome.retryAfter} s` : undefined },
                {
                  label: "Gateway's record of this refusal",
                  value: state.outcome.decisionId ? <CopyableId value={state.outcome.decisionId} /> : undefined,
                },
                { label: "Took", value: `${state.outcome.latencyMs} ms` },
                { label: "Sent a signed envelope", value: state.hadEnvelope ? "Yes" : "No — this session has none" },
              ]}
            />

            {state.outcome.injected.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide">What the service would be told</p>
                <ul className="space-y-1 text-xs">
                  {state.outcome.injected.map((h) => (
                    <li key={h.header} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{h.label}:</span>
                      <span className="font-mono">{h.value}</span>
                      {h.header in state.matches && (
                        <span className={state.matches[h.header] ? "text-emerald-700 dark:text-emerald-400" : "font-semibold text-rose-700 dark:text-rose-400"}>
                          {state.matches[h.header] ? "matches your session" : "does NOT match your session"}
                        </span>
                      )}
                      <span className="text-slate-400">({h.header})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </ResultBanner>
    </form>
  );
}
