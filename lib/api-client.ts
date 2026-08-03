/**
 * Centralized API Client for connecting Next.js Frontend to local Go Microservices
 */

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  isMock: boolean;
  status: number;
}

export interface BackendServiceConfig {
  baseUrl: string;
  serviceName: string;
}

const DEFAULT_TENANT_ID =
  process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || "tenant-zoiko-dev-01";
const ENABLE_MOCK_FALLBACK =
  process.env.NEXT_PUBLIC_ENABLE_BACKEND_MOCK_FALLBACK !== "false";

export const SERVICE_ENDPOINTS = {
  gateway: process.env.NEXT_PUBLIC_API_GATEWAY_URL || "http://localhost:8000",
  accountsReceivable:
    process.env.ACCOUNTS_RECEIVABLE_SVC_URL || "http://localhost:8101",
  auditEventStore:
    process.env.AUDIT_EVENT_STORE_SVC_URL || "http://localhost:8084",
  tenantRegistry:
    process.env.TENANT_ENTITY_REGISTRY_SVC_URL || "http://localhost:8081",
  financialClose:
    process.env.FINANCIAL_CLOSE_SVC_URL || "http://localhost:8104",
};

/**
 * Executes an HTTP request to a local Go microservice with proper context & error fallback.
 */
export async function fetchFromBackend<T>(
  serviceUrl: string,
  endpoint: string,
  options: RequestInit = {},
  mockFallbackData?: T,
  tenantID: string = DEFAULT_TENANT_ID
): Promise<ApiResponse<T>> {
  const url = `${serviceUrl.replace(/\/$/, "")}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  
  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tenant-ID": tenantID,
    "X-Client-Platform": "zoiko-suite-frontend",
  };

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    // Short timeout for local ping/fallback
    signal: options.signal || AbortSignal.timeout(3000),
  };

  try {
    const res = await fetch(url, config);

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      console.warn(`[Backend API] Service at ${url} returned ${res.status}: ${errorText}`);
      
      if (ENABLE_MOCK_FALLBACK && mockFallbackData !== undefined) {
        return {
          data: mockFallbackData,
          error: `Backend returned status ${res.status}. Falling back to local data.`,
          isMock: true,
          status: res.status,
        };
      }

      return {
        data: null,
        error: `HTTP ${res.status}: ${errorText}`,
        isMock: false,
        status: res.status,
      };
    }

    const data: T = await res.json();
    return {
      data,
      error: null,
      isMock: false,
      status: res.status,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network request failed";
    console.warn(`[Backend API] Failed to reach local service at ${url}: ${message}`);

    if (ENABLE_MOCK_FALLBACK && mockFallbackData !== undefined) {
      return {
        data: mockFallbackData,
        error: `Local service unavailable (${message}). Loaded offline mock dataset.`,
        isMock: true,
        status: 0,
      };
    }

    return {
      data: null,
      error: message,
      isMock: false,
      status: 0,
    };
  }
}

/**
 * Checks the liveness/readiness of a local backend service.
 */
export async function checkServiceHealth(serviceUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${serviceUrl}/healthz`, {
      method: "GET",
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}
