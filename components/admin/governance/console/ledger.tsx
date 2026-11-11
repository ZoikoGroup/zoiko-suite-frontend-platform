// The Replays and Evidence chain tabs of the Governance Log register.

import Link from "next/link";
import { CheckCircle2, CircleAlert, Download, Layers } from "lucide-react";
import { Badge } from "@/components/ui";
import { DetailDrawer } from "@/components/admin/console";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { person } from "@/lib/directory";
import { humanizeCode } from "@/lib/humanize";
import type { DecisionSummary, EvidencePackage, ReplayManifest } from "@/lib/api/governance";
import { BASE, href, type Query } from "./data";
import { SealDialog, VerifyChainDialog, VerifyPackageDialog } from "./forms";
import { Pager } from "./register";

const TH = "whitespace-nowrap px-3 py-2.5 text-left text-[11.5px] font-semibold text-slate-500 first:pl-5 dark:text-slate-400";
const TD = "px-3 py-3 text-slate-600 first:pl-5 dark:text-slate-300";

function short(h?: string | null) {
  return h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—";
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-14 text-center text-[13px] text-slate-500 dark:text-slate-400">{children}</div>;
}

export function ReplaysTab({
  records,
  total,
  query,
  page,
  size,
}: {
  records: ReplayManifest[];
  total: number;
  query: Query;
  page: number;
  size: number;
}) {
  const mismatches = query.mismatches === "true";
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 text-[12.5px] dark:border-slate-800">
        <p className="text-slate-500 dark:text-slate-400">
          Every replay re-evaluates a decision against the exact policy version it used and records whether the outcome reproduced.
        </p>
        <Link href={href(query, { mismatches: mismatches ? undefined : "true", page: undefined })} scroll={false}
          className={cn("rounded-lg border px-3 py-1.5 font-medium", mismatches ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200")}>
          {mismatches ? "Showing mismatches only — show all" : "Show mismatches only"}
        </Link>
      </div>
      {records.length === 0 ? (
        <Empty>
          {mismatches ? "No replay has failed to reproduce its decision." : "No decision has been replayed yet. Replay an APPROVAL_THRESHOLD decision from its Evidence tab."}
        </Empty>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="min-w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/30">
                {["Decision", "Action", "Original", "Replayed", "Result", "Policy version", "Replayed at", "By"].map((h) => (
                  <th key={h} className={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {records.map((m) => (
                <tr key={m.replay_manifest_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                  <td className={TD}>
                    <Link href={href({ tab: "decisions", id: m.decision_id, pane: "audit" })} className="font-mono text-[12px] font-semibold text-navy-600 hover:underline dark:text-navy-300">
                      {m.decision_display_ref || m.decision_id}
                    </Link>
                    {m.decision_title && <span className="block max-w-56 truncate text-[11px] text-slate-500">{m.decision_title}</span>}
                  </td>
                  <td className={TD}>{humanizeCode(m.decision_action_type ?? "") || "—"}</td>
                  <td className={TD}>{m.original_outcome}</td>
                  <td className={TD}>{m.replayed_outcome}</td>
                  <td className={TD}>
                    <Badge tone={m.outcomes_match ? "success" : "danger"}>{m.outcomes_match ? "Reproduced" : "Mismatch"}</Badge>
                  </td>
                  <td className={cn(TD, "font-mono text-[11px]")} title={m.policy_version_id}>{m.policy_version_id.slice(0, 8)}…</td>
                  <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{formatDateTime(m.replayed_at)}</td>
                  <td className={TD} title={m.replayed_by_principal_id}>{person(m.replayed_by_principal_id).name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager query={query} page={page} size={size} total={total} noun="replays" />
    </>
  );
}

export function EvidenceTab({
  summary,
  packages,
  query,
}: {
  summary: DecisionSummary | null;
  packages: EvidencePackage[];
  query: Query;
}) {
  const chain = summary?.chain;
  const unsealed = chain ? Math.max(0, chain.length - chain.sealed_through) : 0;
  const stats = [
    { label: "Decisions in the chain", value: chain ? chain.length.toLocaleString() : "—" },
    { label: "Sealed through", value: chain?.sealed_through ? `#${chain.sealed_through}` : "Nothing sealed" },
    { label: "Not yet sealed", value: chain ? unsealed.toLocaleString() : "—" },
    { label: "Head hash", value: short(chain?.head_hash), mono: true, title: chain?.head_hash },
  ];
  return (
    <>
      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">
            Every decision is hash-linked to the one before it by the database the moment it is stored. A sealed package commits to
            the chain with an RFC 6962 Merkle root, so re-verifying it later proves no sealed decision was changed — even by
            someone able to rewrite the database.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <VerifyChainDialog />
            <a href={`${BASE}/evidence-bundle`}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <Download className="h-4 w-4" />
              Export Evidence
            </a>
            <SealDialog unsealed={unsealed} />
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
              <dt className="text-[11.5px] text-slate-500">{s.label}</dt>
              <dd className={cn("mt-1 text-[16px] font-bold text-navy-950 dark:text-white", s.mono && "font-mono text-[12.5px]")} title={s.title}>
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {packages.length === 0 ? (
        <Empty>No package has been sealed yet. Seal one to anchor the chain as it stands.</Empty>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="min-w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/30">
                {["Package", "Label", "Sealed through", "Decisions", "Merkle root", "Sealed by", "Sealed at"].map((h) => (
                  <th key={h} className={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {packages.map((p) => (
                <tr key={p.package_id} className={cn("hover:bg-slate-50/70 dark:hover:bg-slate-800/30", query.pkg === p.package_id && "bg-navy-50/60 dark:bg-navy-500/10")}>
                  <td className={TD}>
                    <Link href={href(query, { pkg: p.package_id })} scroll={false} className="font-mono text-[12px] font-semibold text-navy-600 hover:underline dark:text-navy-300">
                      #{p.package_seq}
                    </Link>
                  </td>
                  <td className={TD}>{p.label || "—"}</td>
                  <td className={cn(TD, "tabular-nums")}>#{p.to_seq}</td>
                  <td className={cn(TD, "tabular-nums")}>{p.leaf_count}</td>
                  <td className={cn(TD, "font-mono text-[11px]")} title={p.merkle_root}>{short(p.merkle_root)}</td>
                  <td className={TD} title={p.sealed_by}>{person(p.sealed_by).name}</td>
                  <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{formatDateTime(p.sealed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function PackageDrawer({ pkg, query }: { pkg: EvidencePackage; query: Query }) {
  const rows: [string, React.ReactNode][] = [
    ["Package id", <span key="id" className="font-mono text-[11px]">{pkg.package_id}</span>],
    ["Sealed through", `decision #${pkg.to_seq}`],
    ["Head decision", <span key="h" className="font-mono text-[11px]">{pkg.head_decision_id}</span>],
    ["Merkle root", <span key="r" className="break-all font-mono text-[10.5px]">{pkg.merkle_root}</span>],
    ["Head hash", <span key="hh" className="break-all font-mono text-[10.5px]">{pkg.head_hash}</span>],
    ["Package hash", <span key="ph" className="break-all font-mono text-[10.5px]">{pkg.package_hash}</span>],
    ["Previous package", <span key="pp" className="break-all font-mono text-[10.5px]">{pkg.prev_package_hash}</span>],
    ["Sealed by", person(pkg.sealed_by).name],
    ["Sealed at", formatDateTime(pkg.sealed_at)],
    ["Reason", pkg.reason || "—"],
  ];
  return (
    <DetailDrawer
      heading="Evidence Package"
      closeHref={href(query, { pkg: undefined })}
      icon={Layers}
      title={`Package #${pkg.package_seq}`}
      subtitle={pkg.label ?? undefined}
      status={{ label: "Sealed", tone: "success" }}
      actions={<VerifyPackageDialog packageId={pkg.package_id} seq={pkg.package_seq} />}
    >
      <dl className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 py-2.5">
            <dt className="shrink-0 text-[12px] text-slate-500">{k}</dt>
            <dd className="min-w-0 text-right text-[12px] font-semibold text-navy-950 dark:text-slate-100">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-[12px] text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
        {pkg.package_seq > 1 ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />}
        {pkg.package_seq > 1
          ? "Chained to the package before it: removing or re-sealing an earlier package breaks this one."
          : "The first package of this tenant; it chains to the genesis hash."}
      </p>
    </DetailDrawer>
  );
}
