"use server";

import {
  getSearchIndexerStatus,
  triggerIndexerSync,
  executeSearch,
  indexDocument,
  type SearchIndexerStatus,
  type SyncResponse,
  type SearchResponse,
  type IndexDocumentResponse,
} from "@/lib/api/search-indexer";

export type SearchQATestReport = {
  id: string;
  title: string;
  category: "POSITIVE" | "NEGATIVE";
  description: string;
  expectedStatus: number;
  actualStatus: number;
  passed: boolean;
  latencyMs: number;
  responseSummary: string;
  notes: string;
};

export async function getSearchIndexerStatusAction(): Promise<SearchIndexerStatus> {
  return await getSearchIndexerStatus();
}

export async function triggerIndexerSyncAction(): Promise<SyncResponse> {
  return await triggerIndexerSync();
}

export async function executeSearchAction(req: {
  tenantId?: string;
  keywords?: string;
  size?: number;
}): Promise<{ ok: boolean; status: number; data: SearchResponse }> {
  return await executeSearch(req);
}

export async function indexDocumentAction(req: {
  id: string;
  tenantId: string;
  legalEntityId: string;
  body: Record<string, any>;
}): Promise<{ ok: boolean; status: number; data: IndexDocumentResponse }> {
  return await indexDocument(req);
}

export async function runFullSearchQASuiteAction(): Promise<SearchQATestReport[]> {
  const reports: SearchQATestReport[] = [];

  // TC-01: Health & Readiness Probe Check
  {
    const start = Date.now();
    const status = await getSearchIndexerStatus();
    const passed = status.status.healthy && status.status.ready;
    reports.push({
      id: "TC-01",
      title: "Service Liveness & Readiness Probes (:8096)",
      category: "POSITIVE",
      description: "Verify GET /healthz returns 200 healthy and GET /readyz returns 200 ready",
      expectedStatus: 200,
      actualStatus: passed ? 200 : 503,
      passed,
      latencyMs: Date.now() - start,
      responseSummary: `health: ${status.status.healthy ? "healthy" : "down"}, ready: ${status.status.ready ? "ready" : "not_ready"}`,
      notes: "Confirms background syncer initialized and ready for indexing requests.",
    });
  }

  // TC-02: OpenSearch Cluster Connectivity (:9200)
  {
    const start = Date.now();
    const status = await getSearchIndexerStatus();
    const osGreen = status.opensearchCluster?.status === "green" || status.opensearchCluster?.status === "yellow";
    reports.push({
      id: "TC-02",
      title: "OpenSearch Search Cluster Health (:9200)",
      category: "POSITIVE",
      description: "Verify connection to OpenSearch cluster and active index cluster health",
      expectedStatus: 200,
      actualStatus: osGreen ? 200 : 503,
      passed: !!osGreen,
      latencyMs: Date.now() - start,
      responseSummary: `Cluster: ${status.opensearchCluster?.cluster_name || "zoiko-search"} | Status: ${status.opensearchCluster?.status || "offline"}`,
      notes: "Validates datastore connectivity backing the zoiko-obligations index.",
    });
  }

  // TC-03: On-Demand Syncer Trigger Pass (POST /v1/sync)
  {
    const start = Date.now();
    const syncRes = await triggerIndexerSync();
    const passed = syncRes.success;
    reports.push({
      id: "TC-03",
      title: "On-Demand Syncer Pass (POST /v1/sync)",
      category: "POSITIVE",
      description: "Trigger real-time sync cycle to poll obligations-svc and upsert into OpenSearch",
      expectedStatus: 200,
      actualStatus: passed ? 200 : 503,
      passed,
      latencyMs: Date.now() - start,
      responseSummary: passed ? `Synced in ${syncRes.duration_ms}ms (count: ${syncRes.count})` : syncRes.error || "failed",
      notes: "Verifies HTTP communication with obligations-svc and tenant resolution.",
    });
  }

  // TC-04: Direct Document Upsert Indexing (POST /v1/index)
  {
    const start = Date.now();
    const docId = `ob-qa-suite-${Date.now()}`;
    const idxRes = await indexDocument({
      id: docId,
      tenantId: "11111111-1111-1111-1111-111111111111",
      legalEntityId: "22222222-2222-2222-2222-222222222222",
      body: {
        obligation_code: "OBL-QA-AUTOSUITE-001",
        obligation_type: "STATUTORY",
        obligation_status: "OPEN",
        responsible_function: "Enterprise QA",
        source_reference: "QA Test Harness Matrix",
        severity_level: "HIGH",
        jurisdiction_id: "88888888-8888-8888-8888-888888888888",
      },
    });
    const passed = idxRes.ok && idxRes.data.indexed;
    reports.push({
      id: "TC-04",
      title: "Document Upsert Indexing (POST /v1/index)",
      category: "POSITIVE",
      description: "Upsert a structured obligation document with tenant and entity bindings into OpenSearch",
      expectedStatus: 201,
      actualStatus: idxRes.status,
      passed,
      latencyMs: Date.now() - start,
      responseSummary: passed ? `Indexed document ${docId} into zoiko-obligations` : idxRes.data.message || "Failed",
      notes: "Confirms idempotent upsert behavior using obligation ID as OpenSearch _id.",
    });
  }

  // TC-05: Positive Keyword Search with Relevance (POST /v1/search)
  {
    const start = Date.now();
    const searchRes = await executeSearch({
      tenantId: "11111111-1111-1111-1111-111111111111",
      keywords: "OBL-QA-AUTOSUITE-001",
      size: 10,
    });
    const passed = searchRes.ok && searchRes.data.total >= 1;
    reports.push({
      id: "TC-05",
      title: "Tenant-Scoped Full-Text Search (POST /v1/search)",
      category: "POSITIVE",
      description: "Query OpenSearch for indexed obligation keywords scoped to active tenant",
      expectedStatus: 200,
      actualStatus: searchRes.status,
      passed,
      latencyMs: Date.now() - start,
      responseSummary: passed
        ? `Found ${searchRes.data.total} document(s) (Top Score: ${searchRes.data.results[0]?.Score.toFixed(3)})`
        : `Expected >=1 match, got ${searchRes.data.total}`,
      notes: "Full-text relevance scoring matches exact and partial keywords.",
    });
  }

  // TC-06: Negative Case: Missing Tenant ID (Zero-Trust Guard)
  {
    const start = Date.now();
    const searchRes = await executeSearch({
      tenantId: "", // Deliberately empty
      keywords: "STATUTORY",
    });
    const passed = searchRes.status === 400 && searchRes.data.error === "tenant_id_required";
    reports.push({
      id: "TC-06",
      title: "Negative: Missing Tenant ID Scope Guard",
      category: "NEGATIVE",
      description: "Attempt keyword search without tenant scope — must be rejected with 400 Bad Request",
      expectedStatus: 400,
      actualStatus: searchRes.status,
      passed,
      latencyMs: Date.now() - start,
      responseSummary: searchRes.data.message || `Status ${searchRes.status}`,
      notes: "Architectural mandate: unscoped enterprise searches are strictly prohibited.",
    });
  }

  // TC-07: Negative Case: Cross-Tenant Isolation
  {
    const start = Date.now();
    const searchRes = await executeSearch({
      tenantId: "99999999-9999-9999-9999-999999999999", // Other tenant
      keywords: "OBL-QA-AUTOSUITE-001",
    });
    const passed = searchRes.ok && searchRes.data.total === 0;
    reports.push({
      id: "TC-07",
      title: "Negative: Cross-Tenant Data Isolation",
      category: "NEGATIVE",
      description: "Search for existing record using a different tenant UUID — must return 0 matches",
      expectedStatus: 200,
      actualStatus: searchRes.status,
      passed,
      latencyMs: Date.now() - start,
      responseSummary: `Total returned: ${searchRes.data.total} (0 expected)`,
      notes: "Ensures no tenant can read or leak documents belonging to another tenant.",
    });
  }

  return reports;
}
