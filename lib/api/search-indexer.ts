import { serviceUrl } from "./config";

export type IndexerSyncerStats = {
  total_indexed: number;
  last_sync_at: string;
  last_sync_count: number;
  last_sync_error?: string;
  is_ready: boolean;
  index_name: string;
};

export type SearchIndexerStatus = {
  service: string;
  port: string;
  status: {
    healthy: boolean;
    ready: boolean;
  };
  syncer: IndexerSyncerStats;
  opensearch_addresses: string;
  obligations_svc_url: string;
  tenant_svc_url: string;
  sync_interval: string;
  opensearchCluster?: {
    status: string;
    cluster_name: string;
    number_of_nodes: number;
    active_primary_shards: number;
  };
};

export type SearchRequest = {
  tenantId?: string;
  keywords?: string;
  size?: number;
};

export type SearchHit = {
  ID: string;
  Score: number;
  Body: Record<string, any>;
};

export type SearchResponse = {
  total: number;
  results: SearchHit[];
  tenant_id: string;
  keywords: string;
  error?: string;
  message?: string;
};

export type SyncResponse = {
  success: boolean;
  count: number;
  duration_ms: number;
  synced_at: string;
  stats: IndexerSyncerStats;
  error?: string;
};

export type IndexDocumentRequest = {
  id: string;
  tenantId: string;
  legalEntityId: string;
  body: Record<string, any>;
};

export type IndexDocumentResponse = {
  indexed: boolean;
  id: string;
  tenant_id: string;
  index: string;
  error?: string;
  message?: string;
};

/**
 * Fetch search-indexer-svc status and OpenSearch cluster health.
 */
export async function getSearchIndexerStatus(): Promise<SearchIndexerStatus> {
  const indexerUrl = serviceUrl("searchIndexer");
  const osUrl = serviceUrl("opensearch");

  let baseStatus: SearchIndexerStatus = {
    service: "search-indexer-svc",
    port: "8096",
    status: { healthy: false, ready: false },
    syncer: {
      total_indexed: 0,
      last_sync_at: "",
      last_sync_count: 0,
      is_ready: false,
      index_name: "zoiko-obligations",
    },
    opensearch_addresses: "http://opensearch:9200",
    obligations_svc_url: "http://obligations-svc:8088",
    tenant_svc_url: "http://tenant-svc:8081",
    sync_interval: "60s",
  };

  try {
    const res = await fetch(`${indexerUrl}/v1/status`, { cache: "no-store" });
    if (res.ok) {
      baseStatus = await res.json();
    }
  } catch (err) {
    // try fallback probe
    try {
      const hRes = await fetch(`${indexerUrl}/healthz`, { cache: "no-store" });
      const rRes = await fetch(`${indexerUrl}/readyz`, { cache: "no-store" });
      baseStatus.status.healthy = hRes.ok;
      baseStatus.status.ready = rRes.ok;
    } catch {
      // offline
    }
  }

  try {
    const osRes = await fetch(`${osUrl}/_cluster/health`, { cache: "no-store" });
    if (osRes.ok) {
      const osData = await osRes.json();
      baseStatus.opensearchCluster = {
        status: osData.status,
        cluster_name: osData.cluster_name,
        number_of_nodes: osData.number_of_nodes,
        active_primary_shards: osData.active_primary_shards,
      };
    }
  } catch {
    // OpenSearch not reached
  }

  return baseStatus;
}

/**
 * Trigger an immediate on-demand indexing sync pass.
 */
export async function triggerIndexerSync(): Promise<SyncResponse> {
  const indexerUrl = serviceUrl("searchIndexer");
  try {
    const res = await fetch(`${indexerUrl}/v1/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      count: 0,
      duration_ms: 0,
      synced_at: new Date().toISOString(),
      stats: {
        total_indexed: 0,
        last_sync_at: "",
        last_sync_count: 0,
        last_sync_error: err?.message || "Failed to trigger sync",
        is_ready: false,
        index_name: "zoiko-obligations",
      },
      error: err?.message || "Network error contacting search-indexer-svc",
    };
  }
}

/**
 * Execute tenant-scoped keyword search against OpenSearch index zoiko-obligations.
 */
export async function executeSearch(req: SearchRequest): Promise<{
  ok: boolean;
  status: number;
  data: SearchResponse;
}> {
  const indexerUrl = serviceUrl("searchIndexer");
  try {
    const res = await fetch(`${indexerUrl}/v1/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: req.tenantId,
        keywords: req.keywords || "",
        size: req.size || 20,
      }),
      cache: "no-store",
    });

    const body = await res.json();
    return {
      ok: res.ok,
      status: res.status,
      data: body,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 503,
      data: {
        total: 0,
        results: [],
        tenant_id: req.tenantId || "",
        keywords: req.keywords || "",
        error: "service_unavailable",
        message: err?.message || "Failed to reach search-indexer-svc",
      },
    };
  }
}

/**
 * Directly index an obligation document into OpenSearch.
 */
export async function indexDocument(req: IndexDocumentRequest): Promise<{
  ok: boolean;
  status: number;
  data: IndexDocumentResponse;
}> {
  const indexerUrl = serviceUrl("searchIndexer");
  try {
    const res = await fetch(`${indexerUrl}/v1/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: req.id,
        tenant_id: req.tenantId,
        legal_entity_id: req.legalEntityId,
        body: req.body,
      }),
      cache: "no-store",
    });

    const body = await res.json();
    return {
      ok: res.ok,
      status: res.status,
      data: body,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 503,
      data: {
        indexed: false,
        id: req.id,
        tenant_id: req.tenantId,
        index: "zoiko-obligations",
        error: "service_unavailable",
        message: err?.message || "Failed to reach search-indexer-svc",
      },
    };
  }
}
