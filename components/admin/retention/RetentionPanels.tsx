import { Snowflake, ScrollText, ShieldAlert } from "lucide-react";
import { CopyableId, PanelEmptyState } from "@/components/admin/shared";
import {
  listLegalHolds,
  listRetentionPolicies,
  retentionWindow,
  scopeLabel,
  summariseHolds,
  type LegalHold,
  type RetentionPolicy,
} from "@/lib/api/retention";
import type { Identity } from "@/lib/api/client";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * The legal-hold register.
 *
 * Reachable for the first time: this service had no list endpoint, so the only
 * way to see a hold was to already know its id. An ACTIVE hold blocks deletion
 * regardless of every retention policy, which makes "what is currently frozen"
 * the single most important thing this page can answer.
 *
 * ACTIVE holds sort first, because a released hold is history and an active one
 * is a live constraint.
 */
export async function LegalHoldRegisterPanel({ identity }: { identity: Identity }) {
  const result = await listLegalHolds(identity);

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={Snowflake}
        label="retention-registry-svc could not be reached"
        hint={`${result.error.message}. Treat this as unknown rather than as "nothing is frozen" — an unreadable register is not an empty one.`}
        tone="warning"
      />
    );
  }

  const holds = result.data ?? [];
  if (holds.length === 0) {
    return (
      <PanelEmptyState
        icon={Snowflake}
        label="No legal holds in this tenant"
        hint="Nothing is frozen by a hold, so deletion is governed by the retention policies below alone."
      />
    );
  }

  const stats = summariseHolds(holds);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
          <strong className="text-slate-900 dark:text-slate-100">{stats.active}</strong> active —
          blocking deletion now
        </span>
        <span>
          <strong className="text-slate-900 dark:text-slate-100">{stats.released}</strong> released
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-208 border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2 pr-4 font-medium">Matter</th>
              <th className="py-2 pr-4 font-medium">Authority</th>
              <th className="py-2 pr-4 font-medium">Scope</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 font-medium">Id</th>
            </tr>
          </thead>
          <tbody>
            {holds.map((h) => (
              <HoldRow key={h.legal_hold_id} hold={h} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HoldRow({ hold }: { hold: LegalHold }) {
  const active = hold.hold_status === "ACTIVE";
  const platformWide = hold.tenant_id == null;

  return (
    <tr className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800">
      <td className="py-3 pr-4">
        <div className="font-medium text-slate-900 dark:text-slate-100">
          {hold.scope_description}
        </div>
        {hold.custodians_objects.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {hold.custodians_objects.map((c) => (
              <span
                key={c}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="py-3 pr-4 text-xs text-slate-700 dark:text-slate-300">{hold.authority}</td>
      <td className="py-3 pr-4 text-xs text-slate-600 dark:text-slate-400">
        <div>{scopeLabel(hold.record_class, "record class")}</div>
        <div>{scopeLabel(hold.entity_ref, "entity")}</div>
        {/* Said explicitly. A platform-wide hold freezes this tenant's records
            without belonging to this tenant, and a reader who assumed every row
            was theirs would misjudge who can release it. */}
        {platformWide && (
          <div className="mt-0.5 font-medium text-amber-600 dark:text-amber-400">
            platform-wide
          </div>
        )}
      </td>
      <td className="py-3 pr-4">
        <span
          className={
            active
              ? "inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
              : "inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          }
          title={
            active
              ? "Active: deletion, export and migration are blocked for this scope, overriding every retention policy."
              : "Released: this hold no longer blocks anything. Deletion is governed by the applicable retention policy alone."
          }
        >
          {active ? <Snowflake className="h-3 w-3" /> : null}
          {hold.hold_status}
        </span>
        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          from {fmtDate(hold.started_at)}
          {hold.released_at ? ` · released ${fmtDate(hold.released_at)}` : ""}
        </div>
        {hold.release_approved_by_principal_id && (
          <div className="text-[11px] text-slate-400 dark:text-slate-500">
            approved by {hold.release_approved_by_principal_id}
          </div>
        )}
      </td>
      <td className="py-3">
        <CopyableId value={hold.legal_hold_id} />
      </td>
    </tr>
  );
}

/**
 * The retention-policy register.
 *
 * Also newly reachable. Ordered newest-effective first, which is the rule in
 * force now — policies are immutable, so a change appends a row and the register
 * is a history rather than a current-state table.
 */
export async function RetentionPolicyPanel({ identity }: { identity: Identity }) {
  const result = await listRetentionPolicies(identity);

  if (!result.ok) {
    return (
      <PanelEmptyState
        icon={ScrollText}
        label="retention-registry-svc could not be reached"
        hint={result.error.message}
        tone="warning"
      />
    );
  }

  const policies = result.data ?? [];
  if (policies.length === 0) {
    return (
      <PanelEmptyState
        icon={ScrollText}
        label="No retention policies in this tenant"
        hint="Nothing here states how long any record class must be kept. Resolve will report no applicable policy, which is not the same as permission to delete."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-208 border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <th className="py-2 pr-4 font-medium">Record class</th>
            <th className="py-2 pr-4 font-medium">Retention</th>
            <th className="py-2 pr-4 font-medium">Basis</th>
            <th className="py-2 pr-4 font-medium">Scope</th>
            <th className="py-2 font-medium">Effective</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <PolicyRow key={p.retention_policy_id} policy={p} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PolicyRow({ policy }: { policy: RetentionPolicy }) {
  return (
    <tr className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800">
      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
        {policy.record_class}
      </td>
      <td className="py-3 pr-4 text-xs text-slate-700 dark:text-slate-300">
        {retentionWindow(policy)}
      </td>
      <td className="py-3 pr-4 text-xs text-slate-600 dark:text-slate-400">
        <div>{policy.legal_regulatory_basis}</div>
        {policy.privacy_basis && (
          <div className="text-[11px] text-slate-400 dark:text-slate-500">
            privacy: {policy.privacy_basis}
          </div>
        )}
      </td>
      <td className="py-3 pr-4 text-xs text-slate-600 dark:text-slate-400">
        <div>{scopeLabel(policy.jurisdiction_code, "jurisdiction")}</div>
        {policy.tenant_id == null && (
          <div className="mt-0.5 font-medium text-slate-500 dark:text-slate-400">platform-wide</div>
        )}
      </td>
      <td className="py-3 text-xs text-slate-600 dark:text-slate-400">
        <div>{fmtDate(policy.effective_from)}</div>
        <div className="text-[11px] text-slate-400 dark:text-slate-500">
          {policy.policy_status}
        </div>
      </td>
    </tr>
  );
}
