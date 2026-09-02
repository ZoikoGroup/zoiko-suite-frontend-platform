/**
 * Deep End-to-End Tax Service Audit
 * Tests all 7 services: read + write + data shape consistency
 */
async function audit() {
  const BASE = "http://localhost:3000";
  const results = [];

  async function test(label, fn) {
    try {
      const data = await fn();
      results.push({ label, ok: true, data });
      console.log(`✅ ${label}`);
      if (data && typeof data === "object") {
        console.log(`   ↳`, JSON.stringify(data).slice(0, 200));
      }
    } catch (e) {
      results.push({ label, ok: false, error: e.message });
      console.log(`❌ ${label}: ${e.message}`);
    }
  }

  console.log("\n═══ 1. TAX-RULES-SVC (8125) ══════════════════════════════════════");

  await test("GET /api/v1/tax-rules", async () => {
    const r = await fetch(`${BASE}/api/v1/tax-rules`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (!json.tax_rules) throw new Error(`Missing tax_rules key. Got: ${JSON.stringify(Object.keys(json))}`);
    return { count: json.tax_rules.length, firstItem: json.tax_rules[0] };
  });

  await test("POST /api/v1/tax-rules (create rule)", async () => {
    const r = await fetch(`${BASE}/api/v1/tax-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jurisdiction_id: "uk-gov-01",
        rule_code: `AUDIT-VAT-${Date.now()}`,
        name: "Audit Test UK VAT Rule",
        category: "VAT",
        tax_rate_percentage: 20,
        effective_from: "2026-01-01",
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    // Accept either { rule_id } directly or { rule: { rule_id } }
    const ruleId = json.rule_id || json.rule?.rule_id;
    if (!ruleId) throw new Error(`No rule_id in response: ${JSON.stringify(json).slice(0, 200)}`);
    return { rule_id: ruleId, rule_code: json.rule_code || json.rule?.rule_code };
  });

  console.log("\n═══ 2. TAX-DETERMINATION-SVC (8126) ══════════════════════════════");

  await test("GET /api/v1/tax-determinations", async () => {
    const r = await fetch(`${BASE}/api/v1/tax-determinations`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (!json.determinations) throw new Error(`Missing determinations key. Got: ${JSON.stringify(Object.keys(json))}`);
    const first = json.determinations[0];
    if (first) {
      const missing = ["determination_id","taxable_amount","tax_rate_percentage","calculated_tax_amount","status"].filter(k => first[k] === undefined);
      if (missing.length) throw new Error(`First determination missing fields: ${missing.join(", ")}`);
    }
    return { count: json.determinations.length, firstItem: first };
  });

  await test("POST /api/v1/tax-determinations (evaluate)", async () => {
    const r = await fetch(`${BASE}/api/v1/tax-determinations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction_id: `audit-tx-${Date.now()}`,
        legal_entity_id: "22222222-2222-2222-2222-222222222222",
        jurisdiction_id: "us-fed-01",
        tax_category: "CORPORATE_INCOME",
        gross_amount: 500000,
        currency: "USD",
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    // Accept { determination: {...} } or flat object
    const det = json.determination ?? json.data ?? json;
    const detId = det.determination_id;
    const taxable = det.taxable_amount;
    const calcTax = det.calculated_tax_amount;
    if (!detId) throw new Error(`No determination_id. Got: ${JSON.stringify(json).slice(0, 300)}`);
    if (taxable === undefined) throw new Error(`No taxable_amount in determination response`);
    if (calcTax === undefined) throw new Error(`No calculated_tax_amount in determination response`);
    return { determination_id: detId, taxable_amount: taxable, calculated_tax_amount: calcTax };
  });

  console.log("\n═══ 3. VAT-GST-SVC (8127) ════════════════════════════════════════");

  await test("GET /api/v1/vat-returns", async () => {
    const r = await fetch(`${BASE}/api/v1/vat-returns`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (!json.vat_returns) throw new Error(`Missing vat_returns key. Got: ${JSON.stringify(Object.keys(json))}`);
    const first = json.vat_returns[0];
    if (first) {
      const missing = ["return_id","tax_period","net_tax_payable","status","currency"].filter(k => first[k] === undefined);
      if (missing.length) throw new Error(`VAT return missing fields: ${missing.join(", ")}`);
    }
    return { count: json.vat_returns.length, firstItem: first };
  });

  await test("POST /api/v1/vat-returns (create)", async () => {
    const r = await fetch(`${BASE}/api/v1/vat-returns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        legal_entity_id: "22222222-2222-2222-2222-222222222222",
        jurisdiction_id: "uk-gov-01",
        tax_registration_number: "GB-987654321",
        tax_period: "2026-Q3",
        total_sales_amount: 2000000,
        total_purchase_amount: 1000000,
        output_tax_amount: 400000,
        input_tax_amount: 200000,
        currency: "GBP",
        effective_from: "2026-07-01",
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const ret = json.vat_return ?? json.data ?? json;
    const retId = ret.return_id;
    if (!retId) throw new Error(`No return_id in VAT response: ${JSON.stringify(json).slice(0, 300)}`);
    return { return_id: retId, status: ret.status };
  });

  console.log("\n═══ 4. CORPORATE-TAX-SVC (8128) ══════════════════════════════════");

  await test("GET /api/v1/corporate-tax-returns", async () => {
    const r = await fetch(`${BASE}/api/v1/corporate-tax-returns`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (!json.corporate_tax_returns) throw new Error(`Missing corporate_tax_returns key. Got: ${JSON.stringify(Object.keys(json))}`);
    const first = json.corporate_tax_returns[0];
    if (first) {
      const missing = ["return_id","fiscal_year","balance_due","status","currency"].filter(k => first[k] === undefined);
      if (missing.length) throw new Error(`Corp return missing fields: ${missing.join(", ")}`);
    }
    return { count: json.corporate_tax_returns.length, firstItem: first };
  });

  console.log("\n═══ 5. WITHHOLDING-TAX-SVC (8129) ════════════════════════════════");

  await test("GET /api/v1/withholding-tax", async () => {
    const r = await fetch(`${BASE}/api/v1/withholding-tax`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (!json.withholding_obligations) throw new Error(`Missing withholding_obligations key. Got: ${JSON.stringify(Object.keys(json))}`);
    const first = json.withholding_obligations[0];
    if (first) {
      const missing = ["obligation_id","payment_reference","withheld_amount","status","currency"].filter(k => first[k] === undefined);
      if (missing.length) throw new Error(`WHT obligation missing fields: ${missing.join(", ")}`);
    }
    return { count: json.withholding_obligations.length, firstItem: first };
  });

  console.log("\n═══ 6. FILING-PREPARATION-SVC (8130) ═════════════════════════════");

  await test("GET /api/v1/filing-preparation/drafts", async () => {
    const r = await fetch(`${BASE}/api/v1/filing-preparation/drafts`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (!json.filing_drafts) throw new Error(`Missing filing_drafts key. Got: ${JSON.stringify(Object.keys(json))}`);
    const first = json.filing_drafts[0];
    if (first) {
      const missing = ["draft_id","filing_type","period_key","validation_status"].filter(k => first[k] === undefined);
      if (missing.length) throw new Error(`Filing draft missing fields: ${missing.join(", ")}`);
    }
    return { count: json.filing_drafts.length, firstItem: first };
  });

  await test("POST /api/v1/filing-preparation/drafts + finalize", async () => {
    const r1 = await fetch(`${BASE}/api/v1/filing-preparation/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        legal_entity_id: "22222222-2222-2222-2222-222222222222",
        jurisdiction_id: "uk-gov-01",
        filing_type: "VAT100_MTD",
        period_key: "2026-Q3",
        due_date: "2026-11-07",
        payload_data: JSON.stringify({ box1: 400000, box5: 200000 }),
      }),
    });
    if (!r1.ok) throw new Error(`Draft create HTTP ${r1.status}`);
    const json1 = await r1.json();
    const rawDraft = json1.draft ?? json1.data ?? json1;
    const draftId = rawDraft.draft_id;
    if (!draftId) throw new Error(`No draft_id in response: ${JSON.stringify(json1).slice(0, 200)}`);

    const r2 = await fetch(`${BASE}/api/v1/filing-preparation/drafts/${draftId}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Audit E2E test" }),
    });
    if (!r2.ok) throw new Error(`Finalize HTTP ${r2.status}`);
    const json2 = await r2.json();
    const rawFinal = json2.draft ?? json2.data ?? json2;
    return { draft_id: draftId, finalize_status: rawFinal.validation_status || rawFinal.status || "ok" };
  });

  console.log("\n═══ 7. TAX-AUTHORITY-INTERFACE-SVC (8147) ════════════════════════");

  await test("GET /api/v1/tax-authority/interfaces", async () => {
    const r = await fetch(`${BASE}/api/v1/tax-authority/interfaces`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (!json.tax_authority_interfaces) throw new Error(`Missing tax_authority_interfaces key. Got: ${JSON.stringify(Object.keys(json))}`);
    const first = json.tax_authority_interfaces[0];
    if (first) {
      const missing = ["interface_id","authority_code","status"].filter(k => first[k] === undefined);
      if (missing.length) throw new Error(`Interface missing fields: ${missing.join(", ")}`);
    }
    return { count: json.tax_authority_interfaces.length, firstItem: first };
  });

  await test("POST /api/v1/tax-authority/interfaces/:id/test", async () => {
    const r = await fetch(`${BASE}/api/v1/tax-authority/interfaces/if-hmrc-001/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (!json.status && !json.latency_ms) throw new Error(`No status/latency in test response: ${JSON.stringify(json).slice(0, 200)}`);
    return { status: json.status, latency_ms: json.latency_ms };
  });

  console.log("\n═══ 8. TAX SUMMARY KPI AGGREGATOR ════════════════════════════════");

  await test("GET /api/v1/tax/summary (all 7 sources)", async () => {
    const r = await fetch(`${BASE}/api/v1/tax/summary`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const s = json.summary;
    if (!s) throw new Error(`No summary key. Got: ${JSON.stringify(Object.keys(json))}`);
    if (s.sourcesUnavailable?.length > 0) throw new Error(`${s.sourcesUnavailable.length} sources unavailable: ${s.sourcesUnavailable.join(", ")}`);
    return s;
  });

  // Final summary
  const failed = results.filter(r => !r.ok);
  console.log(`\n${"═".repeat(60)}`);
  console.log(`AUDIT COMPLETE: ${results.length - failed.length}/${results.length} tests passed`);
  if (failed.length > 0) {
    console.log("\n⚠️  GAPS FOUND:");
    failed.forEach(f => console.log(`  ❌ ${f.label}: ${f.error}`));
  } else {
    console.log("✅ ALL CHECKS PASSED — Tax service is fully end-to-end operational.");
  }
}

audit().catch(console.error);
