import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { ContractLookup, RegisterSchemaForm, SchemaRegisterPanel } from "@/components/admin/schemas";
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
        description="What every event on the platform is required to carry. Each contract is registered here before anything publishes it, each version records whether it was checked against the one before it, and nothing is ever edited or deleted — a change always adds the next version and leaves the old one readable."
      />

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Contract register</CardTitle>
            <CardDescription>
              The current version of every registered event, what an event of that kind must contain, and
              whether the change that produced it was checked against the version before it. A version
              registered without that check is marked as such, so an exemption is something you can read
              here rather than something to infer from a payload that changed shape.
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
            <CardTitle>Look up one contract</CardTitle>
            <CardDescription>
              What an event of a given kind has to carry today, field by field, and every change the
              contract has been through to get there. Nothing is ever edited or deleted here, so the
              history is complete — and the schema as the registry stores it is one click away on each
              version, for anyone who needs the document itself.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ContractLookup />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Register a version</CardTitle>
            <CardDescription>
              Publishing is governed, not self-served: your account needs permission to publish event
              contracts, and if that permission cannot be confirmed the registration is refused rather
              than allowed. The version number is assigned by the registry, so two people registering at
              once cannot collide — the later one is told to read the new current version and submit
              again.
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
                  Outermost fields only.
                </strong>{" "}
                The check compares the outermost fields of a payload — their names, the kind of value each
                carries, and which of them have to be present. It does not look inside a field that holds
                a group or a list, so a breaking change made in there is accepted.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong className="font-medium text-slate-800 dark:text-slate-100">
                  Compared with the current version only.
                </strong>{" "}
                Anything still reading an older version is not considered. &ldquo;Checked&rdquo; here means
                compatible with the contract in use now, not with every version ever published.
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
                  Anyone signed in can read all of it.
                </strong>{" "}
                Reading the register asks only that you are signed in, not that you hold any particular
                permission. An event contract belongs to the platform rather than to one legal entity, so
                there is no per-entity permission to narrow a read by.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
