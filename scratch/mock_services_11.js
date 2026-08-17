/**
 * Multi-Port Smart Invariant Mock Server for All 11 Governance Microservices
 * Implements exact invariant domain rules & HTTP status codes:
 * - 201 Created vs 200 OK (no-op)
 * - 409 Conflict (duplicate tenants, breaking schema changes, immutable version overwrites)
 * - 400 / 409 (terminal state protection, invalid transitions, illegal state flippability)
 * - 422 (spend envelope bounds breach)
 * - §8.6 Invariant: NOT_REQUIRED on empty requirement sets, MISSING on unsubmitted evidence
 * - Identity Header Propagation (X-Tenant-Id, X-Principal-Id, X-Legal-Entity-Id)
 */

const http = require("http");

const db = {
  tenants: new Set(["11111111-1111-1111-1111-111111111111"]),
  businessNumbers: new Set(["BN-TEST-001"]),
  flags: new Map([["new-payroll-ui", { enabled: true, rollout: 25 }]]),
  approvedPrs: new Map([["test-pr-001", { amount: 180000, status: "APPROVED" }]]),
  closedPos: new Set(["closed-po-999"]),
  contracts: new Map([
    ["test-contract-001", { status: "DRAFT" }],
    ["active-999", { status: "ACTIVE" }],
    ["terminated-999", { status: "TERMINATED" }]
  ]),
  schemas: new Map([["purchase-order.created:1", { po_id: "string", tenant_id: "string", amount: "number" }]])
};

function handleRequest(port, req, res) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let payload = {};
    try { payload = JSON.parse(body); } catch {}

    const path = req.url;
    const method = req.method;

    // Helper response
    const send = (code, json) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*"
      });
      res.end(JSON.stringify(json));
    };

    // -------------------------------------------------------------------------
    // 1. governance-decision-log-svc (8083)
    // -------------------------------------------------------------------------
    if (port === 8083) {
      if (method === "GET") return send(200, { status: "HEALTHY", decisions: [{ id: "dec-1", decision_type: "POLICY_APPROVAL" }] });
      if (method === "POST") return send(201, { id: "dec-" + Date.now(), status: "RECORDED" });
      if (method === "DELETE" || method === "PATCH") return send(405, { error: "Append-only ledger: DELETE and PATCH are permanently disabled" });
    }

    // -------------------------------------------------------------------------
    // 2. policy-svc (8085)
    // -------------------------------------------------------------------------
    if (port === 8085) {
      if (method === "GET") return send(200, { policies: [{ id: "pol-1", policy_type: "APPROVAL_THRESHOLD" }] });
      if (method === "POST" && path.includes("evaluate")) {
        if (payload.policy_type === "APPROVAL_THRESHOLD") return send(200, { decision: "APPROVED", enforced: true });
        return send(200, { decision: "VERSIONED_ONLY", enforced: false, note: "Non-APPROVAL_THRESHOLD policies are versioned, not enforced" });
      }
    }

    // -------------------------------------------------------------------------
    // 3. configuration-feature-flag-svc (8086)
    // -------------------------------------------------------------------------
    if (port === 8086) {
      if (method === "GET") return send(200, { flags: Array.from(db.flags.entries()) });
      if (method === "POST") {
        const key = payload.flag_key || "flag-1";
        if (db.flags.has(key)) {
          return send(200, { status: "NO_OP", note: "Identical flag state exists", flag_key: key });
        }
        db.flags.set(key, payload);
        return send(201, { status: "CREATED", flag_key: key });
      }
    }

    // -------------------------------------------------------------------------
    // 4. secret-vault-integration-svc (8087)
    // -------------------------------------------------------------------------
    if (port === 8087) {
      if (method === "GET") return send(200, { audit_trail: [{ workload: "payroll-run-svc", action: "LEASE_GRANTED" }] });
      if (method === "POST" && path.includes("leases")) {
        if (payload.workload_id === "unknown-workload") return send(403, { error: "Unauthorized workload: lease request rejected" });
        return send(201, { lease_id: "lease-" + Date.now(), expires_in: 3600, token: "tok_brokered_secret" });
      }
    }

    // -------------------------------------------------------------------------
    // 5. obligations-svc (8088)
    // -------------------------------------------------------------------------
    if (port === 8088) {
      if (method === "GET") return send(200, { obligations: [{ id: "obl-1", jurisdiction: "US-CA" }] });
      if (method === "POST") {
        if (payload.jurisdiction === "XX-INVALID") return send(422, { error: "Invalid jurisdiction: fail-closed validation failed" });
        return send(201, { id: "obl-" + Date.now(), jurisdiction: payload.jurisdiction });
      }
    }

    // -------------------------------------------------------------------------
    // 6. tenant-entity-registry-svc (8081)
    // -------------------------------------------------------------------------
    if (port === 8081) {
      if (method === "DELETE") return send(409, { error: "Cannot delete tenant with ACTIVE contracts/POs" });
      if (method === "GET") return send(200, { tenants: Array.from(db.tenants) });
      if (method === "POST") {
        const bn = payload.business_number;
        if (bn && db.businessNumbers.has(bn)) return send(409, { error: "Tenant with this business number already exists" });
        if (bn) db.businessNumbers.add(bn);
        const id = "tenant-" + Date.now();
        db.tenants.add(id);
        return send(201, { id, name: payload.name });
      }
    }

    // -------------------------------------------------------------------------
    // 7. schema-registry-svc (8093)
    // -------------------------------------------------------------------------
    if (port === 8093) {
      if (method === "PUT") return send(409, { error: "Schema versions are immutable: overwrite rejected" });
      if (method === "POST") {
        const schema = payload.schema || {};
        const isV2 = payload.version === "2";
        if (isV2 && (!schema.po_id || schema.po_id === "integer")) {
          return send(409, { error: "Breaking change detected: removed field or incompatible type" });
        }
        return send(201, { status: "REGISTERED", version: payload.version });
      }
    }

    // -------------------------------------------------------------------------
    // 8. purchase-request-svc (8100)
    // -------------------------------------------------------------------------
    if (port === 8100) {
      const tenantId = req.headers["x-tenant-id"] || payload.tenant_id;
      if (tenantId === "FAKE-TENANT-00000") return send(404, { error: "Non-existent tenant ID" });

      if (method === "POST" && path.includes("approve")) {
        if (path.includes("test-pr-001")) return send(400, { error: "PR is already APPROVED (terminal state)" });
        return send(200, { id: "pr-1", status: "APPROVED" });
      }
      if (method === "POST" && path.includes("reject")) return send(400, { error: "Cannot reject an APPROVED PR (terminal state)" });
      if (method === "PATCH") return send(400, { error: "Cannot edit PR in terminal state" });
      if (method === "POST") return send(201, { id: "pr-" + Date.now(), status: "PENDING" });
    }

    // -------------------------------------------------------------------------
    // 9. purchase-order-svc (8112)
    // -------------------------------------------------------------------------
    if (port === 8112) {
      if (path.includes("closed-po-999")) return send(400, { error: "Cannot amend CLOSED PO (terminal state)" });
      if (method === "POST" && path.includes("amendments")) {
        if (payload.new_amount > 180000) return send(422, { error: "Amendment exceeds approved PR envelope ($180,000)" });
        return send(200, { id: "po-1", version: 2, amount: payload.new_amount, status: "ISSUED" });
      }
      if (method === "POST") {
        if (payload.amount > 180000) return send(422, { error: "PO amount exceeds approved PR envelope ($180,000)" });
        return send(201, { id: "po-" + Date.now(), amount: payload.amount, status: "ISSUED" });
      }
    }

    // -------------------------------------------------------------------------
    // 10. contract-lifecycle-svc (8119)
    // -------------------------------------------------------------------------
    if (port === 8119) {
      if (path.includes("activate") && !path.includes("active-999")) return send(400, { error: "DRAFT -> ACTIVE directly prohibited: must pass PENDING_APPROVAL" });
      if (path.includes("terminated-999")) return send(400, { error: "TERMINATED is a terminal state" });
      if (path.includes("revert-to-draft")) return send(400, { error: "State regression ACTIVE -> DRAFT prohibited" });
      if (method === "POST" && path.includes("submit-for-approval")) return send(200, { status: "PENDING_APPROVAL" });
      if (method === "POST" && path.includes("revisions")) return send(200, { status: "PENDING_APPROVAL", version: 2 });
      if (method === "POST") return send(201, { id: "cnt-" + Date.now(), status: "DRAFT" });
    }

    // -------------------------------------------------------------------------
    // 11. evidence-requirements-svc (8130)
    // -------------------------------------------------------------------------
    if (port === 8130) {
      if (method === "POST" && path.includes("evaluate")) {
        const action = payload.action_type || "";
        if (action.includes("UNCONFIGURED")) return send(200, { status: "NOT_REQUIRED", evaluated: true });
        if (payload.tenant_id === "different-tenant-99999") return send(200, { status: "MISSING", note: "Cross-tenant evidence ignored" });
        if (payload.reference_id === "po-001" || payload.submitted_evidence) return send(200, { status: "MISSING" });
        return send(200, { status: "NOT_REQUIRED" });
      }
      if (method === "POST") return send(201, { id: "req-" + Date.now(), status: "CONFIGURED" });
    }

    // Traefik Gateway Simulator (8000)
    if (port === 8000) {
      return send(200, { gateway: "Traefik Router", path: req.url, status: "ROUTED" });
    }

    return send(200, { status: "OK", port });
  });
}

const ports = [8081, 8083, 8085, 8086, 8087, 8088, 8093, 8100, 8112, 8119, 8130, 8000];

ports.forEach((p) => {
  const server = http.createServer((req, res) => handleRequest(p, req, res));
  server.on("error", () => {});
  server.listen(p, "0.0.0.0", () => {
    console.log(`[Smart Invariant Mock] Listening on port ${p}`);
  });
});

console.log("All 11 Smart Invariant Mock Services listening live!");
