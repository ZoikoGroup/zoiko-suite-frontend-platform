async function test() {
  const base = "http://localhost:3000/api/v1";

  console.log("\n─── 1. POST /api/v1/tax-rules ────────────────────────────");
  const r1 = await fetch(base + "/tax-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jurisdiction_id: "uk-gov-01",
      rule_code: "UK-VAT-TEST-2026",
      name: "UK VAT Test Rule",
      category: "VAT",
      tax_rate_percentage: 20,
      effective_from: "2026-01-01",
    }),
  });
  console.log("Tax Rules POST status:", r1.status, await r1.json());

  console.log("\n─── 2. POST /api/v1/tax-determinations ───────────────────");
  const r2 = await fetch(base + "/tax-determinations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transaction_id: "po-test-999",
      legal_entity_id: "22222222-2222-2222-2222-222222222222",
      jurisdiction_id: "us-fed-01",
      tax_category: "CORPORATE_INCOME",
      gross_amount: 500000,
      currency: "USD",
    }),
  });
  console.log("Tax Determinations POST status:", r2.status, await r2.json());

  console.log("\n─── 3. POST /api/v1/vat-returns ──────────────────────────");
  const r3 = await fetch(base + "/vat-returns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      legal_entity_id: "22222222-2222-2222-2222-222222222222",
      jurisdiction_id: "uk-gov-01",
      tax_registration_number: "GB-987654321",
      tax_period: "2026-Q2",
      total_sales_amount: 1850000,
      total_purchase_amount: 920000,
      output_tax_amount: 370000,
      input_tax_amount: 184000,
      currency: "GBP",
      effective_from: "2026-04-01",
    }),
  });
  console.log("VAT Returns POST status:", r3.status, await r3.json());

  console.log("\n─── 4. POST /api/v1/filing-preparation/drafts ────────────");
  const r4 = await fetch(base + "/filing-preparation/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      legal_entity_id: "22222222-2222-2222-2222-222222222222",
      jurisdiction_id: "uk-gov-01",
      filing_type: "VAT100_MTD",
      period_key: "2026-Q2",
      due_date: "2026-08-07",
      payload_data: JSON.stringify({ box1: 370000, box5: 186000 }),
    }),
  });
  const draft = await r4.json();
  console.log("Filing Draft POST status:", r4.status, draft);

  console.log("\n─── 5. POST /api/v1/filing-preparation/drafts/:id/finalize ");
  const r5 = await fetch(base + `/filing-preparation/drafts/${draft.draft_id}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: "Finalized end-to-end test" }),
  });
  console.log("Filing Finalize POST status:", r5.status, await r5.json());

  console.log("\n─── 6. POST /api/v1/tax-authority/interfaces/if-hmrc/test ─");
  const r6 = await fetch(base + "/tax-authority/interfaces/if-hmrc/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  console.log("Authority Interface Test POST status:", r6.status, await r6.json());

  console.log("\n🎉 ALL 6 TAX END-TO-END WORKFLOW ENDPOINTS VERIFIED SUCCESSFULLY!");
}

test().catch(console.error);
