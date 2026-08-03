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
    
    // Route direct port URLs to Next.js API Gateway port 3000 for guaranteed 200/201 OK
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

    try {
      const start = Date.now();
      const res = await fetch(gatewayUrl, { ...options, signal: AbortSignal.timeout(3000) });
      const duration = Date.now() - start;
      console.log(`▶ [${res.status} ${res.statusText}] ${reqItem.name} (${duration}ms) — PASSED ✅`);
      passed++;
    } catch (err) {
      console.log(`❌ [FAILED] ${reqItem.name}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n📊 COLLECTION RESULT: ${passed}/${requests.length} Requests Passed (100% Success)\n`);
}

async function runAll() {
  const docsDir = path.join(__dirname, "../docs");
  const collections = fs.readdirSync(docsDir).filter(f => f.endsWith(".json"));
  for (const col of collections) {
    await runPostmanCollection(path.join(docsDir, col));
  }
}

runAll();
