// Tab 3 · Rule packs (F03, F14–F17): packs and versions, compile, sign and
// verify, the certification harness, release and deployment by ring and
// region, rollback, withdrawal, emergency block and hotfix.
//
// Commands follow the version's state, so a reader is never offered a step
// the state machine would refuse; reviewers never see review buttons on a
// version they authored.

import Link from "next/link";
import { FileCheck2, KeyRound, Package, Plus } from "lucide-react";
import { RegisterView, type RegisterSpec, type Row } from "@/components/admin/authorization/console/register";
import { DetailDrawer, DrawerFacts, DrawerNote, TwoLine } from "@/components/admin/console";
import { Field, FieldGrid, SelectField, TextArea } from "@/components/admin/authorization/ui";
import * as J from "@/lib/api/jurisdictions";
import { BASE, currentVersion, day, href, loadKeys, loadPacks, loadRegions, loadRings, settle, type Ctx, type PackWithVersions, type Query } from "./data";
import { Chip, Cmd, Commands, MiniList, Mono, PaneTitle, StatusChip, Unavailable, shortHash, who } from "./shared";

export async function PacksTab({ query, ctx }: { query: Query; ctx: Ctx }) {
  const packs = await loadPacks(ctx.identity);
  const rows: Row[] = (packs.data ?? []).map((p) => {
    const v = currentVersion(p);
    return {
      id: p.pack_ref,
      idLabel: p.pack_ref,
      search: `${p.pack_ref} ${p.pack_name} ${p.owner} ${(v?.manifest?.jurisdiction_ids ?? []).join(" ")}`,
      facets: { status: v?.status ?? "NONE" },
      cells: [
        <TwoLine key="n" primary={p.pack_name} secondary={p.owner} />,
        <span key="v" className="font-mono text-[12px]">
          {v?.version ?? "—"}
        </span>,
        v ? <StatusChip key="s" status={v.status} /> : <Chip key="s" text="No version" tone="neutral" />,
        <span key="j" className="whitespace-nowrap">
          {(v?.manifest?.jurisdiction_ids ?? []).slice(0, 3).join(", ") || "—"}
          {(v?.manifest?.jurisdiction_ids?.length ?? 0) > 3 ? "…" : ""}
        </span>,
        <span key="e" className="whitespace-nowrap">
          {day(v?.effective_from)}
        </span>,
        <span key="g">{v?.signature ? "Signed" : v?.artifact_digest ? "Compiled" : "—"}</span>,
        <span key="c" className="tabular-nums">
          {p.versions.length}
        </span>,
      ],
    };
  });

  const spec: RegisterSpec = {
    base: BASE,
    noun: "packs",
    what: "the pack registry",
    idColumn: "Rule pack",
    columns: [{ label: "Name / owner" }, { label: "Version" }, { label: "Status" }, { label: "Jurisdictions" }, { label: "Effective from" }, { label: "Artifact" }, { label: "Versions", align: "right" }],
    rows,
    filters: [{ name: "status", allLabel: "All states", options: J.PACK_STATUSES.map((s) => [s, s.replaceAll("_", " ").toLowerCase()] as const) }],
    searchPlaceholder: "Search pack, owner or jurisdiction code…",
    empty: "No pack is registered yet. Create one with New pack, then add a version with its manifest.",
    error: packs.error,
    problem: (e) => <Unavailable what="The pack registry" error={e} />,
    drawer: (id, links) => <PackDrawer refId={id} links={links} ctx={ctx} query={query} packs={packs.data ?? []} />,
  };
  return (
    <>
      <RegisterView spec={spec} query={query} />
      <ReleaseSettings ctx={ctx} />
    </>
  );
}

export function PacksActions() {
  return (
    <Cmd command="pack.create" label="New pack" icon={<Plus className="h-4 w-4" />} title="Register a pack" description="A pack groups versioned rule modules for one scope (e.g. jur.gb.tax.core).">
      <FieldGrid>
        <Field name="pack_ref" label="Pack ref" placeholder="jur.gb.tax.core" hint="Lower case, dot-separated." />
        <Field name="pack_name" label="Name" placeholder="UK tax core" />
        <Field name="owner" label="Owner" placeholder="Tax Engineering" />
        <Field name="support_owner" label="Support owner" optional />
      </FieldGrid>
    </Cmd>
  );
}

async function PackDrawer({
  refId,
  links,
  ctx,
  query,
  packs,
}: {
  refId: string;
  links: { close: string; pane: string; paneHref: (k: string) => string };
  ctx: Ctx;
  query: Query;
  packs: PackWithVersions[];
}) {
  const p = packs.find((x) => x.pack_ref === refId);
  if (!p) return null;
  const chosen = p.versions.find((v) => v.version === query.ver) ?? currentVersion(p);
  const pane = links.pane || "overview";
  const ver = chosen?.version;
  const [version, artifact, bundle, runs, reviews, cert, deployments, hotfix, rings, regions] = chosen
    ? await Promise.all([
        J.getPackVersion(refId, ver!, ctx.identity).then(settle),
        J.getArtifact(refId, ver!, ctx.identity).then(settle),
        J.getTestBundle(refId, ver!, ctx.identity).then(settle),
        J.listTestRuns(refId, ver!, ctx.identity).then(settle),
        J.listReviews(refId, ver!, ctx.identity).then(settle),
        J.getCertification(refId, ver!, ctx.identity).then(settle),
        J.listDeployments(refId, ver!, ctx.identity).then(settle),
        J.getHotfix(refId, ver!, ctx.identity).then(settle),
        loadRings(ctx.identity),
        loadRegions(ctx.identity),
      ])
    : [];
  const v = version?.data?.data ?? chosen;
  const etag = version?.data?.etag;
  const author = v?.created_by_principal_id === ctx.me;
  const step = (s: J.PackStep, label: string, opts: { tone?: "secondary" | "accent" | "danger"; reason?: boolean; evidence?: boolean; description?: string } = {}) => (
    <Cmd command="pack.step" label={label} tone={opts.tone} title={`${label}: ${refId}@${ver}`} hidden={{ ref: refId, version: ver, step: s, etag }} description={opts.description}>
      {(opts.reason || opts.evidence) && (
        <FieldGrid>
          {opts.reason && <TextArea name="reason" label="Reason" className="sm:col-span-2" />}
          {opts.evidence && <Field name="evidence_ref" label="Evidence" className="sm:col-span-2" />}
        </FieldGrid>
      )}
    </Cmd>
  );
  const verPane = (k: string) => `${links.paneHref(k)}${ver ? `&ver=${encodeURIComponent(ver)}` : ""}`;
  const ringOpts = (rings?.data ?? []).map((r) => [r.ring_code, `${r.ring_code} (order ${r.ordinal})`] as const);
  const regionOpts = (regions?.data ?? []).map((r) => [r.region_code, r.region_code] as const);

  return (
    <DetailDrawer
      heading="Pack details"
      closeHref={links.close}
      icon={Package}
      title={p.pack_name}
      subtitle={`${p.pack_ref}${ver ? ` · version ${ver}` : ""} · owner ${p.owner}`}
      status={v ? { label: v.status.replaceAll("_", " ").toLowerCase(), tone: v.status === "RELEASED" ? "success" : ["WITHDRAWN", "EMERGENCY_BLOCKED"].includes(v.status) ? "danger" : v.status === "CERTIFIED" ? "info" : "warning" } : undefined}
      panes={["overview", "versions", "certification", "release"].map((k) => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1), href: verPane(k) }))}
      activePane={pane}
      actions={
        <>
          <NewVersion refId={refId} />
          {v && v.artifact_digest && (
            <Cmd command="pack.verify" label="Verify" tone="accent" icon={<FileCheck2 className="h-4 w-4" />} title={`Verify ${refId}@${ver}`} hidden={{ ref: refId, version: ver }} description="Recomputes the artifact's digest and checks its signature against the trusted keys. Nothing is written." />
          )}
        </>
      }
    >
      {!v ? (
        <DrawerNote>This pack has no version yet. Add one with New version.</DrawerNote>
      ) : (
        <>
          {pane === "overview" && (
            <>
              <DrawerFacts
                items={[
                  { label: "Effective", value: `${v.effective_from} → ${v.effective_to ?? "open"}` },
                  { label: "Jurisdictions", value: (v.manifest?.jurisdiction_ids ?? []).join(", ") || "—" },
                  { label: "Regimes", value: (v.manifest?.regimes ?? []).join(", ") || "—" },
                  { label: "Rule modules", value: v.manifest?.rule_modules?.length ?? 0 },
                  { label: "Manifest digest", value: <Mono title={v.manifest_digest}>{shortHash(v.manifest_digest)}</Mono> },
                  { label: "Artifact digest", value: <Mono title={v.artifact_digest ?? ""}>{shortHash(v.artifact_digest)}</Mono> },
                  { label: "Signature", value: v.signature ? `key ${v.signature_key_ref}` : "Not signed" },
                  { label: "Compiler", value: artifact?.data ? `${artifact.data.compiler_name} ${artifact.data.compiler_version} · ${artifact.data.report.errors} error(s)` : "—" },
                  { label: "Author", value: who(v.created_by_principal_id) },
                ]}
              />
              <div className="mt-3">
                <Commands>
                  {v.status === "DRAFT" && step("submit-review", "Submit for review", { description: "Moves the version to REVIEW. Compile it and run its tests before reviewers decide." })}
                  {!v.artifact_digest && ["DRAFT", "REVIEW"].includes(v.status) && step("compile", "Compile", { description: "Builds the immutable artifact from the manifest's modules, named by its digest." })}
                  {v.artifact_digest && !v.signature && step("sign", "Sign", { description: "Signs the artifact digest with the service's signing key." })}
                  {v.status === "CERTIFIED" && step("publish", "Publish", { tone: "accent", description: "Releases the version: re-verified, its dependencies released. Then deploy it." })}
                  {v.status === "RELEASED" && step("withdraw", "Withdraw", { tone: "danger", reason: true, evidence: true, description: "Stops all new use. A remediation case lists decisions already made with it." })}
                  {v.status === "RELEASED" && step("block", "Emergency block", { tone: "danger", reason: true })}
                  {v.status === "EMERGENCY_BLOCKED" && step("unblock", "Unblock", { reason: true })}
                </Commands>
              </div>
            </>
          )}

          {pane === "versions" && (
            <MiniList
              empty="No version."
              items={[...p.versions]
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .map((x) => ({
                  key: x.pack_version_id,
                  primary: (
                    <Link href={href(query, { id: refId, ver: x.version, pane: "overview" })} scroll={false} className="hover:underline">
                      {x.version}
                    </Link>
                  ),
                  secondary: `from ${x.effective_from} · ${who(x.created_by_principal_id)}`,
                  right: <StatusChip status={x.status} />,
                }))}
            />
          )}

          {pane === "certification" && (
            <>
              <PaneTitle>Test bundle</PaneTitle>
              <p className="text-[12px] text-slate-600 dark:text-slate-300">
                {bundle?.data ? `Revision ${bundle.data.revision} · ${shortHash(bundle.data.bundle_digest)} · by ${who(bundle.data.submitted_by)}` : "No test bundle submitted."}
              </p>
              <PaneTitle>Test runs</PaneTitle>
              <MiniList
                empty="No run yet."
                items={(runs?.data ?? []).map((t) => ({ key: t.run_id, primary: `${t.passed ? "Passed" : "Failed"} · ${t.result.total - t.result.failed}/${t.result.total}`, secondary: `${day(t.executed_at)} · ${who(t.executed_by)}`, right: <StatusChip status={t.passed ? "APPROVED" : "REJECTED"} text={t.passed ? "Pass" : "Fail"} /> }))}
              />
              <PaneTitle>Independent reviews</PaneTitle>
              <MiniList
                empty="No review yet."
                items={(reviews?.data ?? []).map((x) => ({ key: x.review_id, primary: `${x.role} · ${x.decision}`, secondary: `${who(x.reviewer)} · ${x.findings || "no findings"}`, right: <StatusChip status={x.decision === "APPROVE" ? "APPROVED" : "REJECTED"} text={x.decision === "APPROVE" ? "Approve" : "Reject"} /> }))}
              />
              <PaneTitle>Certification</PaneTitle>
              <p className="text-[12px] text-slate-600 dark:text-slate-300">{cert?.data ? `Certified ${day(cert.data.certified_at)} by ${who(cert.data.certified_by)} (${cert.data.min_reviews} review(s) required)` : "Not certified."}</p>
              <div className="mt-3">
                <Commands>
                  {["DRAFT", "REVIEW"].includes(v.status) && (
                    <Cmd command="pack.test-bundle" label="Submit test bundle" title={`Test bundle for ${refId}@${ver}`} hidden={{ ref: refId, version: ver }}>
                      <TextArea name="bundle" label="Bundle (JSON)" rows={8} placeholder='{"bundle_version":"1","cases":[{"id":"c1","class":"GOLDEN","description":"…","input":{"jurisdiction":"GB","rule_domain":"TAX","rule_code":"STD","effective_at":"2026-09-01T00:00:00Z"},"expect":{"outcome":"RESOLVED"}}]}' />
                    </Cmd>
                  )}
                  {v.artifact_digest && bundle?.data && v.status === "REVIEW" && step("test-runs", "Run tests", { description: "Runs the bundle against the compiled artifact and records the result." })}
                  {v.status === "REVIEW" && v.artifact_digest && !author && (
                    <Cmd command="pack.review" label="Add review" title={`Review ${refId}@${ver}`} hidden={{ ref: refId, version: ver }} description="Your independent review of the compiled artifact. A rejection needs findings.">
                      <FieldGrid>
                        <Field name="role" label="Role" placeholder="TAX, LEGAL, TECHNICAL" />
                        <SelectField name="decision" label="Decision" options={[["APPROVE", "Approve"], ["REJECT", "Reject"]]} />
                        <TextArea name="findings" label="Findings" optional className="sm:col-span-2" />
                      </FieldGrid>
                    </Cmd>
                  )}
                  {v.status === "REVIEW" && !author && step("certify", "Certify", { tone: "accent", description: "Certifies when the latest test run passed and enough independent reviews approve this artifact." })}
                </Commands>
                {v.status === "REVIEW" && author && <DrawerNote>You authored this version, so its reviews and certification are someone else&apos;s.</DrawerNote>}
              </div>
            </>
          )}

          {pane === "release" && (
            <>
              <PaneTitle>Deployments</PaneTitle>
              <MiniList
                empty="Not deployed to any ring or region."
                items={(deployments?.data ?? []).map((d) => ({ key: d.deployment_id, primary: `${d.ring_code} / ${d.region_code}`, secondary: `${day(d.deployed_at)} · ${who(d.deployed_by)}${d.rollback_reason ? ` · rolled back: ${d.rollback_reason}` : ""}`, right: <StatusChip status={d.status === "ACTIVE" ? "ACTIVE" : "RETIRED"} text={d.status === "ACTIVE" ? "Active" : "Rolled back"} /> }))}
              />
              <PaneTitle>Hotfix</PaneTitle>
              <p className="text-[12px] text-slate-600 dark:text-slate-300">
                {hotfix?.data ? `${hotfix.data.severity} · ${hotfix.data.scope_summary} · retrospective ${hotfix.data.retro_completed_at ? "done" : `due ${day(hotfix.data.retro_due_at)}`}` : "No hotfix declared."}
              </p>
              <div className="mt-3">
                <Commands>
                  {v.status === "RELEASED" && (
                    <Cmd command="pack.deploy" label="Deploy" tone="accent" title={`Deploy ${refId}@${ver}`} hidden={{ ref: refId, version: ver }} description="Promotes the released version to a ring and region, in ring order.">
                      <FieldGrid>
                        <SelectField name="ring" label="Ring" options={ringOpts} />
                        <SelectField name="region" label="Region" options={regionOpts} />
                        <Field name="exception_reason" label="Ring-order exception" optional className="sm:col-span-2" hint="Only for a declared hotfix, by its incident commander." />
                      </FieldGrid>
                    </Cmd>
                  )}
                  {(deployments?.data ?? []).some((d) => d.status === "ACTIVE") && (
                    <Cmd command="pack.rollback" label="Roll back" tone="danger" title={`Roll back ${refId}@${ver}`} hidden={{ ref: refId, version: ver }} description="Restores an earlier version in one ring and region. Decisions made with this version are listed in a remediation case.">
                      <FieldGrid>
                        <SelectField name="ring" label="Ring" options={ringOpts} />
                        <SelectField name="region" label="Region" options={regionOpts} />
                        <SelectField name="restore_version" label="Restore version" options={p.versions.filter((x) => x.version !== ver).map((x) => [x.version, `${x.version} (${x.status.toLowerCase()})`] as const)} className="sm:col-span-2" />
                        <TextArea name="reason" label="Reason" className="sm:col-span-2" />
                      </FieldGrid>
                    </Cmd>
                  )}
                  {v.status === "RELEASED" && (
                    <Cmd command="pack.supersede" label="Supersede" title={`Supersede ${refId}@${ver}`} hidden={{ ref: refId, version: ver }}>
                      <FieldGrid>
                        <SelectField name="superseded_by" label="Replaced by" options={p.versions.filter((x) => x.version !== ver).map((x) => [x.version, `${x.version} (${x.status.toLowerCase()})`] as const)} className="sm:col-span-2" />
                        <TextArea name="reason" label="Reason" className="sm:col-span-2" />
                        <Field name="evidence_ref" label="Evidence" className="sm:col-span-2" />
                      </FieldGrid>
                    </Cmd>
                  )}
                  {["CERTIFIED", "RELEASED"].includes(v.status) && !hotfix?.data && (
                    <Cmd command="pack.hotfix" label="Declare hotfix" tone="danger" title={`Declare a hotfix for ${refId}@${ver}`} hidden={{ ref: refId, version: ver }} description="An emergency release with enhanced review; a retrospective is due afterwards.">
                      <FieldGrid>
                        <SelectField name="severity" label="Severity" options={[["P0", "P0"], ["P1", "P1"]]} />
                        <Field name="incident_ref" label="Incident" />
                        <Field name="incident_commander" label="Incident commander (principal id)" className="sm:col-span-2" />
                        <Field name="rollback_target_version" label="Rollback target version" />
                        <TextArea name="scope_summary" label="Scope" className="sm:col-span-2" />
                      </FieldGrid>
                    </Cmd>
                  )}
                  {hotfix?.data && !hotfix.data.retro_completed_at && (
                    <Cmd command="pack.retro" label="Record retrospective" title="Hotfix retrospective" hidden={{ ref: refId, version: ver }}>
                      <TextArea name="note" label="Retrospective" rows={4} />
                    </Cmd>
                  )}
                </Commands>
              </div>
            </>
          )}
        </>
      )}
    </DetailDrawer>
  );
}

function NewVersion({ refId }: { refId: string }) {
  return (
    <Cmd command="pack.version" label="New version" icon={<Plus className="h-4 w-4" />} title={`New version of ${refId}`} hidden={{ ref: refId }} description="A DRAFT version: the manifest names its jurisdictions, regimes and the rules it carries.">
      <FieldGrid>
        <Field name="pack_version" label="Version" placeholder="2026.11.1" />
        <Field name="effective_from" label="Effective from" type="date" />
        <Field name="jurisdiction_codes" label="Jurisdiction codes" placeholder="GB, GB-SCT" className="sm:col-span-2" />
        <Field name="regimes" label="Regimes" placeholder="VAT" className="sm:col-span-2" />
        <TextArea name="rule_modules" label="Rule ids" className="sm:col-span-2" hint="One per line: the rules (with provenance) this version carries." />
        <Field name="source_register_version" label="Source register version" type="number" optional />
        <TextArea name="dependencies" label="Dependencies (JSON)" optional placeholder='[{"ref":"ref.iso4217","version":"2026.06"}]' className="sm:col-span-2" />
      </FieldGrid>
    </Cmd>
  );
}

async function ReleaseSettings({ ctx }: { ctx: Ctx }) {
  const [keys, rings, regions] = await Promise.all([loadKeys(ctx.identity), loadRings(ctx.identity), loadRegions(ctx.identity)]);
  const box = "rounded-lg border border-slate-200 p-3 dark:border-slate-700";
  return (
    <div className="grid gap-3 border-t border-slate-100 px-5 py-4 md:grid-cols-3 dark:border-slate-800">
      <div className={box}>
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-navy-950 dark:text-slate-100">
            <KeyRound className="h-4 w-4" /> Trusted signing keys
          </p>
          <Cmd command="key.register" label="Register" title="Trust a signing public key" description="Only the public key: the private key never leaves key custody.">
            <FieldGrid>
              <Field name="key_ref" label="Key ref" placeholder="jur-prod-2026" />
              <Field name="algorithm" label="Algorithm" optional placeholder="ed25519" />
              <TextArea name="public_key" label="Public key (base64)" className="sm:col-span-2" />
            </FieldGrid>
          </Cmd>
        </div>
        <MiniList
          empty={keys.error ? "Unavailable." : "No key is trusted yet."}
          items={(keys.data ?? []).map((k) => ({
            key: k.key_ref,
            primary: k.key_ref,
            secondary: `${k.algorithm}${k.status_reason ? ` · ${k.status_reason}` : ""}`,
            right:
              k.status === "ACTIVE" ? (
                <Cmd command="key.status" label="Retire" title={`Retire or revoke ${k.key_ref}`} hidden={{ id: k.key_ref }}>
                  <FieldGrid>
                    <SelectField name="to" label="Change" options={[["retire", "Retire (signatures stay valid)"], ["revoke", "Revoke (compromised)"]]} className="sm:col-span-2" />
                    <TextArea name="reason" label="Reason" className="sm:col-span-2" />
                  </FieldGrid>
                </Cmd>
              ) : (
                <StatusChip status={k.status} />
              ),
          }))}
        />
      </div>
      <div className={box}>
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] font-semibold text-navy-950 dark:text-slate-100">Deployment rings</p>
          <Cmd command="ring.create" label="New ring" title="New deployment ring">
            <FieldGrid>
              <Field name="ring_code" label="Ring code" placeholder="CANARY" />
              <Field name="ordinal" label="Order" type="number" />
              <Field name="min_soak_seconds" label="Minimum soak (seconds)" type="number" />
              <Field name="description" label="Description" optional />
            </FieldGrid>
          </Cmd>
        </div>
        <MiniList empty={rings.error ? "Unavailable." : "No ring."} items={(rings.data ?? []).map((r) => ({ key: r.ring_code, primary: r.ring_code, secondary: `order ${r.ordinal} · soak ${r.min_soak_seconds}s` }))} />
      </div>
      <div className={box}>
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] font-semibold text-navy-950 dark:text-slate-100">Deployment regions</p>
          <Cmd command="region.create" label="New region" title="New deployment region">
            <FieldGrid>
              <Field name="region_code" label="Region code" placeholder="EU-WEST" />
              <Field name="description" label="Description" optional />
            </FieldGrid>
          </Cmd>
        </div>
        <MiniList empty={regions.error ? "Unavailable." : "No region."} items={(regions.data ?? []).map((r) => ({ key: r.region_code, primary: r.region_code, secondary: r.description ?? undefined }))} />
      </div>
    </div>
  );
}
