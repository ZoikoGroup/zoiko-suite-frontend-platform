const fs = require("fs");
const path = require("path");

async function runTaxPostmanFullResponse() {
  console.log(`=======================================================`);
  console.log(`🧪 TAX SERVICE POSTMAN FULL RESPONSE RUNNER`);
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
  let index = 1;

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

    console.log(`### Request ${index}: [${method}] ${reqItem.name}`);
    console.log(`URL: ${gatewayUrl}`);

    try {
      const start = Date.now();
      const res = await fetch(gatewayUrl, { ...options, signal: AbortSignal.timeout(3000) });
      const duration = Date.now() - start;
      const json = await res.json().catch(() => null);

      console.log(`Status: ${res.status} ${res.statusText} (${duration}ms)`);
      console.log(`Response Body:`);
      console.log(JSON.stringify(json, null, 2));
    } catch (err) {
      console.log(`Status Error: ${err.message}`);
    }
    console.log(`-------------------------------------------------------\n`);
    index++;
  }
}

runTaxPostmanFullResponse();
