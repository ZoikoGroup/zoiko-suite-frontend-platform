import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { DocumentRegisterPanel, FileDocumentForm } from "@/components/admin/documents";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Document Vault | Zoiko Suite" };

function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

async function FileForm() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.principalId) return null;
  return <FileDocumentForm legalEntityId={session.legalEntityId ?? ""} />;
}

export default function DocumentsPage() {
  return (
    <div>
      <PageHeader
        title="Document Vault"
        description="The store of record for governed documents. Versions are append-only, content is checksum-verified on every read, and every read is logged — the vault does not merely store documents, it preserves them as evidence."
      />

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Document register</CardTitle>
            <CardDescription>
              Documents filed against your legal entity. Being listed here needs DOCUMENT_READ;
              opening the bytes needs DOCUMENT_DOWNLOAD, which is a separate grant — so a document
              can legitimately appear in this table and refuse to open.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<PanelSkeleton />}>
            <DocumentRegisterPanel />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>File a document</CardTitle>
            <CardDescription>
              The file is read in your browser and submitted inline. The vault computes its SHA-256
              on write and re-verifies it on every read, so content that has changed underneath is
              refused rather than served.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<PanelSkeleton rows={3} />}>
            <FileForm />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-500/30">
        <CardHeader>
          <div>
            <CardTitle>What this vault guarantees, and what it does not</CardTitle>
            <CardDescription>
              Recorded here because the panels above cannot show it, and a reader who assumes
              otherwise would trust this service further than it can carry
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  There is no quiet read.
                </strong>{" "}
                Opening a document&rsquo;s metadata appends a METADATA row to its access log;
                fetching the content appends a DOWNLOAD row. You cannot look without leaving a
                trace, and reading that log is a third, separate grant — it is the record an
                investigator consults.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Nothing is rewritten, and nothing is deleted.
                </strong>{" "}
                A new version is a new row and a bump of the current pointer. The superseded version
                stays exactly as filed, with its own checksum and its own author.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Integrity is checked, not assumed.
                </strong>{" "}
                The checksum recorded at write is recomputed on every read. A mismatch is a 409 and
                the content is withheld — that is the alarm this service exists to raise, and it
                should be investigated rather than retried.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Retention here is a label, not an engine.
                </strong>{" "}
                The retention policy is a named string this service records. Nothing in it schedules
                a purge or blocks one — a document marked for a seven-year hold is not held by
                anything in this vault today.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
