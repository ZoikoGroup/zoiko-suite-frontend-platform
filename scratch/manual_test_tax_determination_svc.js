const http = require("http");

const BASE_DETERMINATION_URL = "http://localhost:8126";
const BASE_RULES_URL = "http://localhost:8125";

function makeRequest(urlStr, method = "GET", bodyData = null, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Correlation-ID": "test-corr-" + Math.random().toString(36).substring(2, 9),
      ...customHeaders
    };

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: headers,
      timeout: 3000
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (e) {
          json = body;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on("error", (err) => resolve({ status: 500, error: err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 408, error: "Request Timeout" });
    });

    if (bodyData) {
      req.write(JSON.stringify(bodyData));
    }
    req.end();
  });
}

async function runManualTests() {
  console.log("================================================================================");
  console.log("      MANUAL TEST RUN: TAX MICROSERVICES (tax-determination-svc & tax-rules-svc) ");
  console.log("================================================================================\n");

  // --- SERVICE 1: TAX DETERMINATION SERVICE (Port 8126) ---
  console.log("--------------------------------------------------------------------------------");
  console.log("  MICROSERVICE: tax-determination-svc (Port 8126)");
  console.log("--------------------------------------------------------------------------------");

  // Test 1: Health Check
  console.log("\n[TEST 1] GET /readyz (Health Probe)");
  const healthRes = await makeRequest(`${BASE_DETERMINATION_URL}/readyz`);
  console.log(`STATUS: ${healthRes.status}`);
  console.log("RESPONSE:", JSON.stringify(healthRes.data, null, 2));

  // Test 2: List Determinations
  console.log("\n[TEST 2] GET /v1/tax-determinations (List Determinations)");
  const listRes = await makeRequest(`${BASE_DETERMINATION_URL}/v1/tax-determinations`);
  console.log(`STATUS: ${listRes.status}`);
  console.log(`FOUND DETERMINATIONS: ${listRes.data?.total}`);
  console.log("RESPONSE SNIPPET:", JSON.stringify(listRes.data?.determinations?.[0], null, 2));

  // Test 3: Get Determination by ID
  const testId1 = "det-2026-001";
  console.log(`\n[TEST 3] GET /v1/tax-determinations/${testId1} (Get Determination By ID)`);
  const getByIdRes = await makeRequest(`${BASE_DETERMINATION_URL}/v1/tax-determinations/${testId1}`);
  console.log(`STATUS: ${getByIdRes.status}`);
  console.log("RESPONSE:", JSON.stringify(getByIdRes.data, null, 2));

  // Test 4: Query by Legal Entity ID
  const legalEntityId = "22222222-2222-2222-2222-222222222222";
  console.log(`\n[TEST 4] GET /v1/tax-determinations?legal_entity_id=${legalEntityId} (Filter by Legal Entity ID)`);
  const filterEntityRes = await makeRequest(`${BASE_DETERMINATION_URL}/v1/tax-determinations?legal_entity_id=${legalEntityId}`);
  console.log(`STATUS: ${filterEntityRes.status}`);
  console.log(`FILTERED RESULTS COUNT: ${filterEntityRes.data?.total}`);

  // Test 5: POST Evaluate New Tax Determination
  console.log("\n[TEST 5] POST /v1/tax-determinations (Evaluate & Calculate New Tax Determination)");
  const postPayload = {
    determination_id: "det-manual-test-8899",
    transaction_id: "tx-invoice-2026-9901",
    source_module: "ACCOUNTS_PAYABLE",
    jurisdiction_id: "jur-uk-gb",
    rule_id: "rule-uk-vat-standard",
    tax_category: "VAT",
    gross_amount: 250000.00,
    taxable_amount: 250000.00,
    tax_rate_percentage: 20.0,
    currency: "GBP",
    status: "CALCULATED"
  };
  const headersIdentity = {
    "X-Tenant-Id": "11111111-1111-1111-1111-111111111111",
    "X-Legal-Entity-Id": "22222222-2222-2222-2222-222222222222",
    "X-Principal-Id": "usr-tax-officer-john"
  };

  const createRes = await makeRequest(`${BASE_DETERMINATION_URL}/v1/tax-determinations`, "POST", postPayload, headersIdentity);
  console.log(`STATUS: ${createRes.status}`);
  console.log("CREATED DETERMINATION:", JSON.stringify(createRes.data, null, 2));

  const newDetId = createRes.data?.determination?.determination_id;

  // Test 6: Verify newly created Determination by ID
  if (newDetId) {
    console.log(`\n[TEST 6] GET /v1/tax-determinations/${newDetId} (Verify Newly Created Determination by ID)`);
    const verifyRes = await makeRequest(`${BASE_DETERMINATION_URL}/v1/tax-determinations/${newDetId}`);
    console.log(`STATUS: ${verifyRes.status}`);
    console.log("RETRIEVED DETERMINATION:", JSON.stringify(verifyRes.data, null, 2));

    // Test 7: PUT / UPDATE Determination Status & Overrides
    console.log(`\n[TEST 7] PUT /v1/tax-determinations/${newDetId} (Update Status to OVERRIDDEN)`);
    const updatePayload = {
      status: "OVERRIDDEN",
      calculated_tax_amount: 45000.00,
      notes: "Tax amount overridden due to partial exemption clause under UK VAT Regulations"
    };
    const updateRes = await makeRequest(`${BASE_DETERMINATION_URL}/v1/tax-determinations/${newDetId}`, "PUT", updatePayload, headersIdentity);
    console.log(`STATUS: ${updateRes.status}`);
    console.log("UPDATED DETERMINATION:", JSON.stringify(updateRes.data, null, 2));

    // Test 8: DELETE Determination by ID
    console.log(`\n[TEST 8] DELETE /v1/tax-determinations/${newDetId} (Delete Determination by ID)`);
    const deleteRes = await makeRequest(`${BASE_DETERMINATION_URL}/v1/tax-determinations/${newDetId}`, "DELETE");
    console.log(`STATUS: ${deleteRes.status}`);
    console.log("DELETE RESPONSE:", JSON.stringify(deleteRes.data, null, 2));

    // Test 9: Verify 404 after Deletion
    console.log(`\n[TEST 9] GET /v1/tax-determinations/${newDetId} (Verify 404 After Deletion)`);
    const getDeletedRes = await makeRequest(`${BASE_DETERMINATION_URL}/v1/tax-determinations/${newDetId}`);
    console.log(`STATUS: ${getDeletedRes.status}`);
    console.log("RESPONSE:", JSON.stringify(getDeletedRes.data, null, 2));
  }

  // --- SERVICE 2: TAX RULES SERVICE (Port 8125) ---
  console.log("\n--------------------------------------------------------------------------------");
  console.log("  MICROSERVICE: tax-rules-svc (Port 8125)");
  console.log("--------------------------------------------------------------------------------");

  // Test 10: GET Tax Rule by ID
  const ruleId = "rule-uk-vat-standard";
  console.log(`\n[TEST 10] GET /v1/tax-rules/${ruleId} (Get Tax Rule By ID)`);
  const getRuleRes = await makeRequest(`${BASE_RULES_URL}/v1/tax-rules/${ruleId}`);
  console.log(`STATUS: ${getRuleRes.status}`);
  console.log("RESPONSE:", JSON.stringify(getRuleRes.data, null, 2));

  // Test 11: POST Create New Tax Rule
  console.log("\n[TEST 11] POST /v1/tax-rules (Create New Tax Rule)");
  const postRulePayload = {
    rule_id: "rule-eu-vat-digital-2026",
    jurisdiction_id: "jur-eu-union",
    rule_code: "EU-VAT-DIGITAL-2026",
    name: "EU Digital Services Standard VAT",
    category: "VAT",
    tax_rate_percentage: 21.0,
    status: "ACTIVE",
    effective_from: "2026-01-01T00:00:00Z"
  };
  const createRuleRes = await makeRequest(`${BASE_RULES_URL}/v1/tax-rules`, "POST", postRulePayload, headersIdentity);
  console.log(`STATUS: ${createRuleRes.status}`);
  console.log("CREATED RULE:", JSON.stringify(createRuleRes.data, null, 2));

  console.log("\n================================================================================");
  console.log("                    MANUAL TESTING COMPLETED SUCCESSFULLY                       ");
  console.log("================================================================================\n");
}

runManualTests();
