import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { GenerateManifestForm, ManifestLookupPanel, ManifestCatalogTable } from "@/components/admin/evidence-manifests";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Evidence Manifests | Zoiko Suite" };

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

async function GenerateForm() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId) return null;
  return <GenerateManifestForm legalEntityId={session.legalEntityId ?? ""} />;
}

async function CatalogSection() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId) return null;
  return <ManifestCatalogTable legalEntityId={session.legalEntityId ?? ""} />;
}

export default function EvidenceManifestsPage() {
  return (
    <div>
      <PageHeader
        title="Evidence Manifests"
        description="Assembles structured, checksummed evidence sets for audit, regulator, legal-discovery and compliance-review scenarios — pulling governance decisions, access decisions and workflow history from their owning services and fixing them in an immutable snapshot."
      />

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Manifest Catalog & Integrity Verification</CardTitle>
            <CardDescription>
              Browse all immutable evidence manifests generated for your organization, verify cryptographic SHA-256 integrity against stored record snapshots, and export complete audit zip bundles.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <CatalogSection />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Generate a manifest</CardTitle>
            <CardDescription>
              At least one source is required. Generation fails closed: if any source it needs cannot be
              reached, the whole manifest is marked FAILED rather than left partial — there is no way to
              resume it, only to generate again.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<PanelSkeleton />}>
            <GenerateForm />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Inspect Manifest Records</CardTitle>
            <CardDescription>
              Directly look up a manifest by ID to inspect each individual source snapshot (governance decisions, access decisions, workflow instances, and execution history) decoded in full.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ManifestLookupPanel />
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-500/30">
        <CardHeader>
          <div>
            <CardTitle>What this service guarantees, and what it does not</CardTitle>
            <CardDescription>
              Recorded here because the panels above cannot show it, and a reader who assumes otherwise
              would trust this service further than it can carry
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Every manifest attempt is tracked in the catalog.
                </strong>{" "}
                When generation fails closed because a source service was unreachable, the manifest row is
                real and persisted with FAILED status and failure reason visible in the catalog above.
                Generate again once the source is restored.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Nothing is rewritten, and nothing is deleted.
                </strong>{" "}
                A manifest and its records are fixed at generation time. There is no edit and no delete —
                the database itself refuses an UPDATE or DELETE on a manifest&rsquo;s records.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Access decisions and workflow instances have no date-range discovery.
                </strong>{" "}
                Only governance decisions can be auto-discovered by entity and date range. Access decisions
                and workflow instances must be named explicitly by ID — neither authorization-svc nor
                workflow-svc exposes a list query this service can use instead.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
