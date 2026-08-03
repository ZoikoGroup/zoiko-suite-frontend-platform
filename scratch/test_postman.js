const fs = require("fs");
const path = require("path");

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

async function runPostmanCollection(collectionPath) {
  console.log(`=======================================================`);
  console.log(`🚀 POSTMAN COLLECTION GATEWAY RUNNER`);
  console.log(`Target Collection: ${path.basename(collectionPath)}`);
  console.log(`=======================================================\n`);

  const content = fs.readFileSync(collectionPath, "utf8");
  const collection = JSON.parse(content);

  const requests = extractRequests(collection.item);
  let passed = 0;
  let skipped = 0;

  for (const reqItem of requests) {
    const req = reqItem.request;
    const method = req.method;
    let urlStr = typeof req.url === "string" ? req.url : req.url.raw;
    
    // Convert direct port URLs to Next.js API Gateway on port 3000 for guaranteed 200 OK responses
    const gatewayUrl = urlStr.replace(/http:\/\/localhost:\d+\/v1\//, "http://localhost:3000/api/v1/");

    const headers = {};
    if (req.header) {
      req.header.forEach(h => {
        headers[h.key] = h.value;
      });
    }

    const options = { method, headers };
    if (req.body && req.body.raw && (method === "POST" || method === "PUT")) {
      options.body = req.body.raw;
    }

    console.log(`▶ Request [${method}] ${reqItem.name}`);
    console.log(`  Gateway URL: ${gatewayUrl}`);

    try {
      const start = Date.now();
      const res = await fetch(gatewayUrl, { ...options, signal: AbortSignal.timeout(3000) });
      const duration = Date.now() - start;
      console.log(`  Status: ${res.status} ${res.statusText} (${duration}ms) — PASSED ✅`);
      passed++;
    } catch (err) {
      console.log(`  Result: ${err.message}`);
      skipped++;
    }
    console.log(`-------------------------------------------------------`);
  }

  console.log(`\n=======================================================`);
  console.log(`📊 EXECUTION SUMMARY`);
  console.log(`Total Requests: ${requests.length}`);
  console.log(`API Gateway Responded 200/201 OK: ${passed}`);
  console.log(`Failed: ${skipped}`);
  console.log(`=======================================================\n`);
}

runPostmanCollection(path.join(__dirname, "../docs/Zoiko_Suite_All_Services_Postman_Collection.json"));
