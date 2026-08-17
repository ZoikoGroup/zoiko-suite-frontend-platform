/**
 * Real-time Tax Microservice Server Suite
 * Runs all 7 Tax Microservices locally:
 *  - 8125: tax-rules-svc
 *  - 8126: tax-determination-svc
 *  - 8127: vat-gst-svc
 *  - 8128: corporate-tax-svc
 *  - 8129: withholding-tax-svc
 *  - 8130: filing-preparation-svc
 *  - 8147: tax-authority-interface-svc
 */

const http = require("http");

const TAX_RULES = [
  {
    rule_id: "rule-uk-vat-standard",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-uk-gb",
    rule_code: "UK-VAT-STD-2026",
    name: "UK Standard Value Added Tax",
    category: "VAT",
    tax_rate_percentage: 20.0,
    standard_deductions: 0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  },
  {
    rule_id: "rule-uk-vat-reduced",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-uk-gb",
    rule_code: "UK-VAT-RED-2026",
    name: "UK Reduced Rate VAT (Energy/Safety)",
    category: "VAT",
    tax_rate_percentage: 5.0,
    standard_deductions: 0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  },
  {
    rule_id: "rule-us-cit-fed",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-us-fed",
    rule_code: "US-CIT-FED-2026",
    name: "US Federal Corporate Income Tax",
    category: "CORPORATE_INCOME",
    tax_rate_percentage: 21.0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  },
  {
    rule_id: "rule-sg-gst-standard",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    jurisdiction_id: "jur-sg-01",
    rule_code: "SG-GST-STD-2026",
    name: "Singapore Goods & Services Tax",
    category: "GST",
    tax_rate_percentage: 9.0,
    status: "ACTIVE",
    version: 1,
    effective_from: "2026-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  }
];

const TAX_DETERMINATIONS = [
  {
    determination_id: "det-2026-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    transaction_id: "tx-inv-8910",
    source_module: "ACCOUNTS_RECEIVABLE",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    rule_id: "rule-uk-vat-standard",
    tax_category: "VAT",
    gross_amount: 120000.0,
    taxable_amount: 100000.0,
    tax_rate_percentage: 20.0,
    calculated_tax_amount: 20000.0,
    exempt_amount: 0,
    currency: "GBP",
    status: "CALCULATED",
    effective_from: "2026-07-01T00:00:00Z",
    evaluated_at: "2026-07-31T14:30:00Z",
    evaluated_by: "tax-engine-daemon",
    created_at: "2026-07-31T14:30:00Z",
    updated_at: "2026-07-31T14:30:00Z"
  },
  {
    determination_id: "det-2026-002",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    transaction_id: "tx-po-4421",
    source_module: "COMMERCIAL_OPS",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-us-fed",
    rule_id: "rule-us-cit-fed",
    tax_category: "CORPORATE_INCOME",
    gross_amount: 450000.0,
    taxable_amount: 450000.0,
    tax_rate_percentage: 21.0,
    calculated_tax_amount: 94500.0,
    exempt_amount: 0,
    currency: "USD",
    status: "CALCULATED",
    effective_from: "2026-06-01T00:00:00Z",
    evaluated_at: "2026-06-30T10:00:00Z",
    evaluated_by: "tax-engine-daemon",
    created_at: "2026-06-30T10:00:00Z",
    updated_at: "2026-06-30T10:00:00Z"
  }
];

const VAT_RETURNS = [
  {
    return_id: "vat-ret-2026-q2",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    tax_registration_number: "GB998877665",
    tax_period: "2026-Q2",
    total_sales_amount: 1450000.0,
    total_purchase_amount: 620000.0,
    output_tax_amount: 290000.0,
    input_tax_amount: 124000.0,
    net_tax_payable: 166000.0,
    currency: "GBP",
    status: "FILED",
    filed_at: "2026-07-07T12:00:00Z",
    filed_by: "system-auto-filing",
    effective_from: "2026-04-01T00:00:00Z",
    effective_to: "2026-06-30T23:59:59Z",
    created_by: "tax-daemon",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-07T12:00:00Z"
  },
  {
    return_id: "vat-ret-2026-q3",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    tax_registration_number: "GB998877665",
    tax_period: "2026-Q3",
    total_sales_amount: 980000.0,
    total_purchase_amount: 410000.0,
    output_tax_amount: 196000.0,
    input_tax_amount: 82000.0,
    net_tax_payable: 114000.0,
    currency: "GBP",
    status: "DRAFT",
    effective_from: "2026-07-01T00:00:00Z",
    effective_to: "2026-09-30T23:59:59Z",
    created_by: "tax-daemon",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-14T00:00:00Z"
  }
];

const CORPORATE_RETURNS = [
  {
    return_id: "corp-ret-2025",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-us-fed",
    tax_registration_number: "US-EIN-12345678",
    fiscal_year: 2025,
    accounting_period_start: "2025-01-01",
    accounting_period_end: "2025-12-31",
    gross_revenue: 12500000.0,
    allowable_deductions: 8200000.0,
    taxable_income: 4300000.0,
    tax_rate_percent: 21.0,
    gross_tax_liability: 903000.0,
    tax_credits: 50000.0,
    net_tax_payable: 853000.0,
    tax_already_paid: 800000.0,
    balance_due: 53000.0,
    currency: "USD",
    status: "SUBMITTED",
    submitted_at: "2026-03-15T16:00:00Z",
    submitted_by: "cfo-controller",
    assessed_tax_amount: 853000.0,
    assessment_reference: "IRS-ASSESS-2025-99",
    effective_from: "2025-01-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-03-15T16:00:00Z"
  }
];

const WITHHOLDING_OBLIGATIONS = [
  {
    obligation_id: "wht-obl-001",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    counterparty_id: "cp-global-software",
    payment_reference: "PAY-2026-0812",
    payment_type: "ROYALTIES",
    gross_payment_amount: 50000.0,
    statutory_rate_percent: 20.0,
    treaty_reduced_rate_percent: 5.0,
    applied_rate_percent: 5.0,
    tax_withheld_amount: 2500.0,
    net_amount_payable: 47500.0,
    currency: "GBP",
    status: "REMITTED",
    statutory_due_date: "2026-08-20",
    remittance_reference: "HMRC-WHT-2026-781",
    remitted_at: "2026-08-10T11:00:00Z",
    remitted_by: "treasury-auto-remit",
    effective_from: "2026-08-01T00:00:00Z",
    created_by: "system",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-10T11:00:00Z"
  }
];

const FILING_DRAFTS = [
  {
    draft_id: "draft-filing-2026-q3-vat",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    legal_entity_id: "22222222-2222-2222-2222-222222222222",
    jurisdiction_id: "jur-uk-gb",
    filing_type: "VAT_RETURN",
    reporting_period: "2026-Q3",
    currency: "GBP",
    tax_due_amount: 114000.0,
    status: "PREPARED",
    payload_data: '{"box1":196000,"box2":0,"box3":196000,"box4":82000,"box5":114000}',
    validation_status: "PREPARED",
    created_by: "filing-daemon",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-14T00:00:00Z"
  }
];

const TAX_INTERFACES = [
  {
    interface_id: "if-hmrc-mtd",
    jurisdiction_id: "jur-uk-gb",
    authority_name: "HM Revenue & Customs (HMRC)",
    protocol_type: "REST_OAUTH2",
    endpoint_url: "https://api.service.hmrc.gov.uk/organisations/vat",
    environment: "PRODUCTION",
    auth_credential_id: "sec-hmrc-client-credentials",
    is_active: true,
    last_health_check: new Date().toISOString(),
    health_status: "HEALTHY",
    error_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: new Date().toISOString()
  },
  {
    interface_id: "if-irs-mef",
    jurisdiction_id: "jur-us-fed",
    authority_name: "Internal Revenue Service (IRS MeF)",
    protocol_type: "SOAP_A2A",
    endpoint_url: "https://la.www4.irs.gov/a2a/mef",
    environment: "PRODUCTION",
    auth_credential_id: "sec-irs-a2a-cert",
    is_active: true,
    last_health_check: new Date().toISOString(),
    health_status: "HEALTHY",
    error_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: new Date().toISOString()
  }
];

function createService(port, name, getHandler, postHandler) {
  const server = http.createServer((req, res) => {
    const send = (code, data) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*"
      });
      res.end(JSON.stringify(data));
    };

    const url = new URL(req.url, `http://localhost:${port}`);
    const pathname = url.pathname;

    // Health probes
    if (pathname === "/readyz" || pathname === "/healthz" || pathname === "/health") {
      return send(200, { status: "READY", service: name, port, timestamp: new Date().toISOString() });
    }

    if (req.method === "GET") {
      return getHandler(pathname, url.searchParams, send);
    }

    if (req.method === "POST" || req.method === "PUT") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        let json = {};
        try { json = JSON.parse(body); } catch {}
        if (postHandler) return postHandler(pathname, json, send);
        return send(201, { message: "Resource processed successfully", status: "CREATED", data: json });
      });
      return;
    }

    return send(405, { error: "Method not allowed" });
  });

  server.listen(port, () => {
    console.log(`✅ [${name}] listening on port ${port}`);
  });

  return server;
}

// 1. tax-rules-svc (8125)
createService(8125, "tax-rules-svc", (path, params, send) => {
  return send(200, { rules: TAX_RULES, total: TAX_RULES.length });
}, (path, body, send) => {
  const newRule = { rule_id: "rule-" + Date.now(), ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  TAX_RULES.push(newRule);
  return send(201, newRule);
});

// 2. tax-determination-svc (8126)
createService(8126, "tax-determination-svc", (path, params, send) => {
  return send(200, { determinations: TAX_DETERMINATIONS, total: TAX_DETERMINATIONS.length });
}, (path, body, send) => {
  const rate = body.tax_rate_percentage || 20;
  const taxable = body.taxable_amount || body.gross_amount || 0;
  const calc = (taxable * rate) / 100;
  const newDet = {
    determination_id: "det-" + Date.now(),
    status: "CALCULATED",
    calculated_tax_amount: calc,
    ...body,
    evaluated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  TAX_DETERMINATIONS.unshift(newDet);
  return send(201, newDet);
});

// 3. vat-gst-svc (8127)
createService(8127, "vat-gst-svc", (path, params, send) => {
  return send(200, { vat_returns: VAT_RETURNS, returns: VAT_RETURNS, total: VAT_RETURNS.length });
}, (path, body, send) => {
  const newRet = { return_id: "vat-" + Date.now(), status: "DRAFT", ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  VAT_RETURNS.unshift(newRet);
  return send(201, newRet);
});

// 4. corporate-tax-svc (8128)
createService(8128, "corporate-tax-svc", (path, params, send) => {
  return send(200, { returns: CORPORATE_RETURNS, corporate_tax_returns: CORPORATE_RETURNS, total: CORPORATE_RETURNS.length });
}, (path, body, send) => {
  const newRet = { return_id: "corp-" + Date.now(), status: "DRAFT", ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  CORPORATE_RETURNS.unshift(newRet);
  return send(201, newRet);
});

// 5. withholding-tax-svc (8129)
createService(8129, "withholding-tax-svc", (path, params, send) => {
  return send(200, { obligations: WITHHOLDING_OBLIGATIONS, total: WITHHOLDING_OBLIGATIONS.length });
});

// 6. filing-preparation-svc (8130)
createService(8130, "filing-preparation-svc", (path, params, send) => {
  return send(200, { drafts: FILING_DRAFTS, total: FILING_DRAFTS.length });
});

// 7. tax-authority-interface-svc (8147)
createService(8147, "tax-authority-interface-svc", (path, params, send) => {
  return send(200, { interfaces: TAX_INTERFACES, total: TAX_INTERFACES.length });
});

console.log("\n🚀 All 7 Tax Governance Microservices are now ONLINE and answering /readyz!");
