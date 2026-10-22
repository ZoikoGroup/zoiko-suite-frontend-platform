import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import {
  CheckpointsPanel,
  ContractsPanel,
  EvidencePanel,
  GenerationsPanel,
  RestrictionsPanel,
  ScopesPanel,
  SourcesPanel,
} from "@/components/admin/search/SearchPanels";
import {
  BuildGenerationForm,
  ContractTransitionForm,
  DraftContractForm,
  ExportForm,
  GenerationTransitionForm,
  RegisterSourceForm,
  RestrictionForm,
  SearchForm,
} from "@/components/admin/search/SearchForms";
import { SESSION_COOKIE, decodeSession, toIdentity, type SessionIdentity } from "@/lib/auth";
import { listContracts, listGenerations, listScopes, listSources } from "@/lib/api/search";

export const metadata: Metadata = { title: "Search" };

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : undefined;
}

function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

/**
 * The Search control plane.
 *
 * THE PAGE IS ORDERED THE WAY THE SERVICE IS GOVERNED, not the way a reader
 * would guess. Search comes first because it is what people come here to do;
 * but Registry and Lifecycle come before Restrictions and Evidence because
 * nothing is searchable until a source is registered, a contract published and
 * a generation activated — and a reader whose search box is empty needs to see
 * why in the order the fix happens.
 *
 * Every panel is its own Suspense boundary. This page reads seven endpoints
 * across two authorization planes, and a control-plane outage must still leave
 * the search box usable.
 */
export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scopeFilter = one(params.scope);

  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const identity: SessionIdentity & { principalId: string; tenantId: string } = session
    ? (toIdentity(session) as SessionIdentity & { principalId: string; tenantId: string })
    : { principalId: "", tenantId: "", legalEntityId: "" };

  // Form option lists are read here rather than inside each form, because the
  // forms are Client Components and the service is server-only. Failures
  // degrade to an empty select rather than an error: a reader can still see
  // the panels below, which say what is missing.
  const [scopesResult, sourcesResult, contractsResult, generationsResult] = await Promise.all([
    listScopes(identity),
    listSources(identity),
    listContracts({ ...identity, scope: scopeFilter }),
    listGenerations({ ...identity, scope: scopeFilter }),
  ]);

  const scopes = scopesResult.ok ? scopesResult.data.scopes : [];
  const sources = sourcesResult.ok ? sourcesResult.data.sources : [];
  const contracts = contractsResult.ok ? contractsResult.data.contracts : [];
  const generations = generationsResult.ok ? generationsResult.data.generations : [];

  const publishedScopes = contracts
    .filter((c) => c.publication_state === "PUBLISHED")
    .map((c) => c.scope_name);

  // Narrowed before crossing into the Client Components below, and the reason
  // is not tidiness.
  //
  // A contract carries its full field list, including any field declared
  // SECRET_PROHIBITED. Returning that from /v1/index-contracts is correct —
  // an administrator drafting a contract has to see that a field is declared
  // prohibited, which is precisely how the projector learns to refuse a
  // payload carrying one. But the transition forms need four values each, and
  // passing the whole object ships every field name into the browser's RSC
  // payload for no reason at all.
  //
  // Structural typing will not catch this: passing a wider object where a
  // narrower prop type is declared is legal, and it serialises in full. So the
  // narrowing has to be written out.
  //
  // The tenant-facing catalogue (/v1/scopes) strips prohibited fields
  // server-side for a stronger reason — NP-53, a searcher must not learn the
  // field exists at all. This is the weaker, adjacent rule: do not carry what
  // the surface does not use.
  const contractOptions = contracts.map((c) => ({
    contract_id: c.contract_id,
    scope_name: c.scope_name,
    version: c.version,
    publication_state: c.publication_state,
  }));

  const generationOptions = generations.map((g) => ({
    generation_id: g.generation_id,
    scope_name: g.scope_name,
    validation_state: g.validation_state,
    engine_ref: g.engine_ref,
  }));

  return (
    <div>
      <PageHeader
        title="Search"
        description={
          "The secure retrieval plane. Search is a rebuildable projection over authoritative sources — " +
          "an index entry is never business truth and never grants access, so every result is " +
          "re-authorized against current policy before its content is returned."
        }
      />

      {/* ── Search ─────────────────────────────────────────────────────── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Governed search</CardTitle>
          <CardDescription>
            Your tenant, identity and purpose come from your session and are not yours to assert —
            a tenant sent in the request body is refused rather than ignored, so an empty result can
            never be mistaken for a cross-tenant search that found nothing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SearchForm scopes={scopes} />
        </CardContent>
      </Card>

      <div className="mt-6">
        <Suspense fallback={<TableSkeleton rows={4} />}>
          <ScopesPanel identity={identity} />
        </Suspense>
      </div>

      {/* ── Registry (ESR-01) ──────────────────────────────────────────── */}
      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Registry — what may be indexed
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Platform-scoped. A contract describes a shape shared by every tenant, so these writes
        authorize against the platform rather than your legal entity.
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Register a source</CardTitle>
            <CardDescription>
              Declares which events feed a search surface. The service consumes domain events rather
              than polling any service&apos;s API — the tenant on each event is the one that
              produced it, which is why no cross-tenant read privilege is needed anywhere here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterSourceForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Draft a contract</CardTitle>
            <CardDescription>
              Decides which fields may be searched, filtered, sorted, returned or snippeted.
              Anything not registered here is absent from the index entirely — the projection is an
              allowlist, so a source that starts emitting a new field indexes nothing extra.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DraftContractForm sourceTypes={sources.map((s) => s.source_type)} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Publish a contract</CardTitle>
          <CardDescription>
            A contract is created DRAFT and stays there until it is certified and published, because
            the approval gates are a human workflow this console cannot perform on anyone&apos;s
            behalf.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContractTransitionForm contracts={contractOptions} />
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6">
        <Suspense fallback={<TableSkeleton />}>
          <SourcesPanel identity={identity} />
        </Suspense>
        <Suspense fallback={<TableSkeleton />}>
          <ContractsPanel identity={identity} scope={scopeFilter} />
        </Suspense>
      </div>

      {/* ── Lifecycle (ESR-05) ─────────────────────────────────────────── */}
      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Lifecycle — what is serving
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        A generation is built while the previous one still serves, validated, and then cut over in
        one atomic alias swap. A generation that fails validation is never activated.
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Build a generation</CardTitle>
            <CardDescription>
              Creates the engine index with a strict mapping derived from the published contract —
              a field the contract does not declare is rejected at write time rather than silently
              indexed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BuildGenerationForm scopes={publishedScopes} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Validate and activate</CardTitle>
            <CardDescription>
              READY runs the real checks: any document without a tenant fails the generation
              outright, and the population is compared against the control-plane ledger, which
              counted independently of the index.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GenerationTransitionForm generations={generationOptions} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6">
        <Suspense fallback={<TableSkeleton />}>
          <GenerationsPanel identity={identity} scope={scopeFilter} />
        </Suspense>
        <Suspense fallback={<TableSkeleton />}>
          <CheckpointsPanel identity={identity} scope={scopeFilter} />
        </Suspense>
      </div>

      {/* ── Restrictions (§8.2) ────────────────────────────────────────── */}
      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Restrictions — removing visibility
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Removing a record from search is not record deletion and cannot discharge a retention or
        erasure obligation on its own — it removes discoverability, and the propagation table below
        says when that was actually proven.
      </p>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Remove a record from search</CardTitle>
          <CardDescription>
            Applied immediately rather than queued behind ordinary indexing, and verified separately
            afterwards by a retrieval test. Until that test passes, the removal is APPLIED and not
            VERIFIED.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RestrictionForm scopes={scopes} />
        </CardContent>
      </Card>

      <div className="mt-6">
        <Suspense fallback={<TableSkeleton />}>
          <RestrictionsPanel identity={identity} scope={scopeFilter} />
        </Suspense>
      </div>

      {/* ── Export and evidence ────────────────────────────────────────── */}
      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Export and evidence
      </h2>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Request an export</CardTitle>
          <CardDescription>
            A separately authorized act with its own purpose and its own evidence. Permission to
            search is not permission to extract in bulk, so this needs a grant you may not hold even
            when every search above succeeds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExportForm scopes={scopes} />
        </CardContent>
      </Card>

      <div className="mt-6">
        <Suspense fallback={<TableSkeleton rows={5} />}>
          <EvidencePanel identity={identity} scope={scopeFilter} />
        </Suspense>
      </div>
    </div>
  );
}
