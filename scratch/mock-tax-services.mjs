import http from "http";

const sampleRules = [
  {
    rule_id: "tr-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "GB",
    rule_code: "UK-VAT-STD-20",
    name: "UK Standard Rate VAT 20%",
    category: "VAT",
    tax_rate_percentage: 20.0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    rule_id: "tr-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "US-CA",
    rule_code: "US-CA-SALES-725",
    name: "California Statewide Base Sales Tax",
    category: "SALES_TAX",
    tax_rate_percentage: 7.25,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    rule_id: "tr-003",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "GB",
    rule_code: "UK-CORP-STD-25",
    name: "UK Corporation Tax Main Rate",
    category: "CORPORATE_INCOME",
    tax_rate_percentage: 25.0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
];

const sampleDeterminations = [
  {
    determination_id: "det-101",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    transaction_id: "tx-po-9842",
    source_module: "purchase-order-svc",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "GB",
    rule_id: "tr-001",
    tax_category: "VAT",
    gross_amount: 12000,
    taxable_amount: 10000,
    tax_rate_percentage: 20.0,
    calculated_tax_amount: 2000,
    status: "APPLIED",
    calculated_at: new Date().toISOString(),
    applied_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
];

const sampleReturns = [
  {
    return_id: "vat-ret-2026-q1",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "GB",
    tax_period: "2026-Q1",
    total_sales: 250000,
    total_output_tax: 50000,
    total_purchases: 110000,
    total_input_tax: 22000,
    net_tax_payable: 28000,
    status: "DRAFT",
    currency: "GBP",
    period_start: "2026-01-01T00:00:00Z",
    period_end: "2026-03-31T23:59:59Z",
    due_date: "2026-05-07T00:00:00Z",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
];

const sampleCorporateFilings = [
  {
    filing_id: "ct-filing-2025",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "GB",
    tax_year: 2025,
    taxable_profit: 850000,
    tax_rate_applied: 25.0,
    gross_tax_liability: 212500,
    reliefs_and_credits: 12500,
    net_tax_liability: 200000,
    status: "REVIEWED",
    currency: "GBP",
    filing_deadline: "2026-12-31T00:00:00Z",
    payment_due_date: "2026-10-01T00:00:00Z",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
];

const sampleCertificates = [
  {
    certificate_id: "wht-cert-2026-01",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    vendor_id: "v-8831-uk",
    jurisdiction_id: "GB",
    payment_reference: "PAY-2026-088",
    gross_payment_amount: 50000,
    withholding_rate: 15.0,
    withholding_tax_deducted: 7500,
    currency: "GBP",
    status: "ISSUED",
    issued_date: "2026-02-15T00:00:00Z",
    created_at: new Date().toISOString(),
  }
];

const sampleDrafts = [
  {
    draft_id: "draft-771",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    filing_type: "VAT_RETURN",
    jurisdiction_id: "GB",
    period: "2026-Q1",
    status: "READY",
    validation_status: "PASSED",
    generated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
];

const sampleTransmissions = [
  {
    transmission_id: "tx-hmrc-992",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    authority_name: "HMRC_MTD",
    filing_reference: "VAT-2026-Q1-GB",
    status: "ACCEPTED",
    acknowledgement_id: "ACK-HMRC-883921",
    transmitted_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
];

function createService(name, port, routeHandler) {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/readyz" || req.url === "/healthz") {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "ok", service: name, time: new Date().toISOString() }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let parsed = {};
      try {
        if (body) parsed = JSON.parse(body);
      } catch (e) {}

      routeHandler(req, res, parsed);
    });
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[${name}] listening on port ${port}`);
  });
}

// 8125 - tax-rules-svc
createService("tax-rules-svc", 8125, (req, res) => {
  if (req.url.startsWith("/v1/tax-rules")) {
    if (req.method === "POST") {
      res.writeHead(201);
      res.end(JSON.stringify({ rule_id: "tr-" + Date.now(), status: "ACTIVE" }));
    } else {
      res.writeHead(200);
      res.end(JSON.stringify({ rules: sampleRules, total: sampleRules.length }));
    }
  } else {
    res.writeHead(200);
    res.end(JSON.stringify({ rules: sampleRules, total: sampleRules.length }));
  }
});

// 8126 - tax-determination-svc
createService("tax-determination-svc", 8126, (req, res, body) => {
  if (req.method === "POST") {
    res.writeHead(201);
    res.end(JSON.stringify({
      determination_id: "det-" + Date.now(),
      taxable_amount: body.taxable_amount || 1000,
      calculated_tax_amount: (body.taxable_amount || 1000) * 0.2,
      status: "CALCULATED"
    }));
  } else {
    res.writeHead(200);
    res.end(JSON.stringify({ determinations: sampleDeterminations, total: sampleDeterminations.length }));
  }
});

// 8127 - vat-gst-svc
createService("vat-gst-svc", 8127, (req, res) => {
  if (req.method === "POST") {
    res.writeHead(201);
    res.end(JSON.stringify({ return_id: "ret-" + Date.now(), status: "DRAFT" }));
  } else {
    res.writeHead(200);
    res.end(JSON.stringify({ returns: sampleReturns, total: sampleReturns.length }));
  }
});

// 8128 - corporate-tax-svc
createService("corporate-tax-svc", 8128, (req, res) => {
  if (req.method === "POST") {
    res.writeHead(201);
    res.end(JSON.stringify({ filing_id: "filing-" + Date.now(), status: "DRAFT" }));
  } else {
    res.writeHead(200);
    res.end(JSON.stringify({ filings: sampleCorporateFilings, total: sampleCorporateFilings.length }));
  }
});

// 8129 - withholding-tax-svc
createService("withholding-tax-svc", 8129, (req, res) => {
  if (req.method === "POST") {
    res.writeHead(201);
    res.end(JSON.stringify({ certificate_id: "cert-" + Date.now(), status: "ISSUED" }));
  } else {
    res.writeHead(200);
    res.end(JSON.stringify({ certificates: sampleCertificates, total: sampleCertificates.length }));
  }
});

// 8130 - filing-preparation-svc
createService("filing-preparation-svc", 8130, (req, res) => {
  if (req.method === "POST") {
    res.writeHead(201);
    res.end(JSON.stringify({ draft_id: "draft-" + Date.now(), status: "READY" }));
  } else {
    res.writeHead(200);
    res.end(JSON.stringify({ drafts: sampleDrafts, total: sampleDrafts.length }));
  }
});

// 8147 - tax-authority-interface-svc
createService("tax-authority-interface-svc", 8147, (req, res) => {
  if (req.method === "POST") {
    res.writeHead(201);
    res.end(JSON.stringify({ transmission_id: "tx-" + Date.now(), status: "ACCEPTED" }));
  } else {
    res.writeHead(200);
    res.end(JSON.stringify({ transmissions: sampleTransmissions, total: sampleTransmissions.length }));
  }
});

console.log("All 7 Tax Domain Services started!");
