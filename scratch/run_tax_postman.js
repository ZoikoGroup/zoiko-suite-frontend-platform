const fs = require("fs");
const path = require("path");

async function runTaxPostmanTests() {
  console.log(`=======================================================`);
  console.log(`🧪 TAX SERVICE POSTMAN AUTOMATED TEST RUNNER`);
  console.log(`Target: http://localhost:3000/api/v1/`);
  console.log(`=======================================================\n`);

  const collectionPath = path.join(__dirname, "../docs/Tax_Services_Postman_Collection.json");
  const content = fs.readFileSync(collectionPath, "utf8");
  const collection = JSON.parse(content);

  function extractRequests(items, result = []) {
    for (const item of items) {
      if (item.request) {
        result.push(item);
      } else if (item.item) {
        extractRequests(item.item, result);
      }
    }
    return result;
  }

  const requests = extractRequests(collection.item);
  let passed = 0;
  let failed = 0;

  for (const reqItem of requests) {
    const req = reqItem.request;
    const method = req.method;
    let urlStr = typeof req.url === "string" ? req.url : req.url.raw;
    const gatewayUrl = urlStr.replace(/http:\/\/localhost:\d+\/v1\//, "http://localhost:3000/api/v1/");

    const headers = { "Content-Type": "application/json" };
    if (req.header) {
      req.header.forEach(h => {
        headers[h.key] = h.value;
      });
    }

    const options = { method, headers };
    if (req.body && req.body.raw && (method === "POST" || method === "PUT")) {
      options.body = req.body.raw;
    }

    console.log(`▶ [${method}] ${reqItem.name}`);
    console.log(`  Endpoint: ${gatewayUrl}`);

    try {
      const start = Date.now();
      const res = await fetch(gatewayUrl, { ...options, signal: AbortSignal.timeout(3000) });
      const duration = Date.now() - start;
      const json = await res.json().catch(() => null);

      if (res.status >= 200 && res.status < 300) {
        console.log(`  Status: ${res.status} ${res.statusText} (${duration}ms) — PASSED ✅`);
        if (json) {
          const preview = Array.isArray(json) 
            ? `Array[${json.length} items]` 
            : JSON.stringify(json).slice(0, 100) + "...";
          console.log(`  Response Preview: ${preview}`);
        }
        passed++;
      } else {
        console.log(`  Status: ${res.status} ${res.statusText} (${duration}ms) — FAILED ❌`);
        failed++;
      }
    } catch (err) {
      console.log(`  Result: ${err.message} — FAILED ❌`);
      failed++;
    }
    console.log(`-------------------------------------------------------`);
  }

  console.log(`\n=======================================================`);
  console.log(`📊 TAX SERVICE POSTMAN TEST SUMMARY`);
  console.log(`Total Endpoints Tested: ${requests.length}`);
  console.log(`Passed (200/201 OK): ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${Math.round((passed / requests.length) * 100)}%`);
  console.log(`=======================================================\n`);
}

runTaxPostmanTests();
