# Local Backend Microservices to Next.js Frontend Integration Guide

This guide outlines the step-by-step process for connecting local Go microservices (such as `accounts-receivable-svc`, `audit-event-store-svc`, `financial-close-svc`) to the Next.js Frontend Platform (`zoiko-suite-frontend-platform`).

---

## 1. Local Environment Configuration (`.env.local`)

The frontend configures backend service endpoints using environment variables defined in `.env.local`:

```env
# Local Backend Microservices Endpoints
NEXT_PUBLIC_API_GATEWAY_URL=http://localhost:8080
ACCOUNTS_RECEIVABLE_SVC_URL=http://localhost:8081
AUDIT_EVENT_STORE_SVC_URL=http://localhost:8082
TENANT_ENTITY_REGISTRY_SVC_URL=http://localhost:8083
FINANCIAL_CLOSE_SVC_URL=http://localhost:8084

# Default Tenant Scoping for Local Development
NEXT_PUBLIC_DEFAULT_TENANT_ID=tenant-zoiko-dev-01
NEXT_PUBLIC_ENABLE_BACKEND_MOCK_FALLBACK=true
```

---

## 2. API Communication Architecture

To support seamless local development without CORS issues or manual headers, requests are managed in two ways:

1. **Centralized Resilient Client (`lib/api-client.ts`)**:
   - Automatically attaches required tenant context headers (`X-Tenant-ID: <tenant>`).
   - Implements request timeout controls (3s default).
   - Gracefully falls back to mock datasets when a local backend microservice is offline, allowing UI development to proceed unimpeded.

2. **Next.js App Router Local Proxy (`app/api/backend/[...path]/route.ts`)**:
   - Acts as a local reverse proxy (`/api/backend/ar/v1/invoices` → `http://localhost:8081/v1/invoices`).
   - Prevents browser CORS restrictions and securely manages server-to-server microservice authentication headers.

---

## 3. How to Run Locally

### Step 1: Start the Local Go Microservice
In the backend directory (`zoiko-suite project/zoiko-suite`), start your target Go service:

```bash
# Example: Running accounts-receivable-svc locally
cd services/accounts-receivable-svc
TEST_DATABASE_URL="postgres://postgres:secretpassword@localhost:5432/testdb?sslmode=disable" go run ./cmd/server
```

### Step 2: Start the Next.js Frontend Platform
In `zoiko-suite-frontend-platform`:

```bash
npm run dev
```

The frontend will start on `http://localhost:3000`.

---

## 4. Verifying the Connection

1. Open `http://localhost:3000/admin/finance`.
2. Observe the **Accounts Receivable Service** status bar:
   - **Live Local Backend (Port 8081)** (Green): Service pinged `/healthz` successfully.
   - **Mock Fallback Mode** (Amber): Backend service is not running; offline mock data is loaded automatically.
3. Switch tenants in the dropdown (`tenant-zoiko-dev-01`, `tenant-zoiko-us-02`) to verify tenant isolation context passing via `X-Tenant-ID`.
4. Click **Create Invoice** to send a `POST` request to the backend microservice or update invoice statuses (`ISSUED` → `SENT` → `PAID`).
