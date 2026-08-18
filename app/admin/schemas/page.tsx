import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { RegisterSchemaForm, SchemaRegisterPanel } from "@/components/admin/schemas";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listEventNames } from "@/lib/api/schemas";

export const metadata: Metadata = { title: "Event Schemas | Zoiko Suite" };

function RegisterSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** The form needs existing names to offer as suggestions for the next version. */
async function RegisterForm() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const identity = {
    principalId: session?.principalId,
    tenantId: session?.tenantId,
    legalEntityId: session?.legalEntityId,
  };
  const names = await listEventNames(identity);
  return <RegisterSchemaForm eventNames={names.ok ? names.data : []} />;
}

export default function SchemasPage() {
  return (
    <div>
      <PageHeader
        title="Event Schemas"
        description="The canonical registry of event payload contracts. Every event on the platform is meant to be registered here, each version declares the compatibility discipline it was accepted under, and nothing is ever edited or deleted — evolution only ever appends."
      />

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Contract register</CardTitle>
            <CardDescription>
              Current version of every registered event. A version marked NONE was accepted without a
              compatibility check — permitted for a controlled rollout, and shown here so the exemption is
              visible rather than inferred from a schema that changed shape.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<RegisterSkeleton />}>
            <SchemaRegisterPanel />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Register a version</CardTitle>
            <CardDescription>
              Publishing is governed, not self-served: authorization-svc must grant SCHEMA_PUBLISH, and an
              unreachable decision refuses the write rather than allowing it. The version number is assigned
              by the registry, so two people registering at once cannot collide — the later one is told to
              re-read and resubmit.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<RegisterSkeleton />}>
            <RegisterForm />
          </Suspense>
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-500/30">
        <CardHeader>
          <div>
            <CardTitle>Limits of the compatibility check</CardTitle>
            <CardDescription>
              Recorded here because the register above cannot show them, and a reader who assumes otherwise
              would trust it further than it can carry
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Top-level fields only.
                </strong>{" "}
                The checker reads a schema&apos;s <code className="font-mono text-xs">properties</code> and{" "}
                <code className="font-mono text-xs">required</code>. It does not descend into nested objects
                or arrays, so a breaking change inside one is accepted.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Checked against the latest version only.
                </strong>{" "}
                A consumer still pinned to an older version is not considered. Backward compatibility here
                means compatible with the current contract, not with every version ever published.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Registration is not enforcement.
                </strong>{" "}
                Nothing validates a published event against its registered schema at runtime. This registry
                records what a contract is meant to be; it does not stop a producer emitting something else.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Reads are identity-gated, not entity-gated.
                </strong>{" "}
                Any signed-in principal can read the whole catalogue. An event contract is platform-wide
                reference data with no legal entity of its own, so there is no per-entity grant to scope a
                read by — the bar is that the caller is identified at all.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
