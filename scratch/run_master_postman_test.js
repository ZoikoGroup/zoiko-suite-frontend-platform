const http = require("http");
const fs = require("fs");
const path = require("path");

const masterCollectionPath = path.join(__dirname, "../docs/Zoiko_Suite_All_Services_Postman_Collection.json");
const masterCollection = JSON.parse(fs.readFileSync(masterCollectionPath, "utf8"));

console.log(`=======================================================`);
console.log(`🚀 MASTER POSTMAN COLLECTION TEST RUNNER`);
console.log(`Collection: ${masterCollection.info.name}`);
console.log(`=======================================================\n`);

let totalRequests = 0;
let passed = 0;
let failed = 0;

function sendPostmanRequest(item) {
  return new Promise((resolve) => {
    if (!item.request) {
      resolve();
      return;
    }

    const reqObj = item.request;
    const urlObj = reqObj.url;
    
    let rawPath = "";
    if (typeof urlObj === "string") {
      rawPath = urlObj;
    } else if (urlObj && Array.isArray(urlObj.path)) {
      rawPath = urlObj.path.join("/");
    } else if (urlObj && urlObj.raw) {
      rawPath = urlObj.raw;
    }

    // Clean URL path
    rawPath = rawPath.replace(/^https?:\/\/[^\/]+\//, "");
    rawPath = rawPath.replace(/^(api\/v1\/|v1\/)/, "");

    const method = reqObj.method || "GET";
    const headers = {
      "Content-Type": "application/json",
      "X-Tenant-Id": "11111111-1111-1111-1111-111111111111",
      "X-Principal-Id": "33333333-3333-3333-3333-333333333333"
    };

    const reqOpts = {
      hostname: "localhost",
      port: 3000,
      path: `/api/v1/${rawPath}`,
      method: method,
      headers: headers
    };

    totalRequests++;

    const startTime = Date.now();
    const req = http.request(reqOpts, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        const duration = Date.now() - startTime;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`▶ [${res.statusCode} ${res.statusMessage}] ${item.name} (${method} /api/v1/${rawPath}) - ${duration}ms — PASSED ✅`);
          passed++;
        } else {
          console.log(`❌ [${res.statusCode} ${res.statusMessage}] ${item.name} (${method} /api/v1/${rawPath}) - ${duration}ms — FAILED`);
          failed++;
        }
        resolve();
      });
    });

    req.on("error", (err) => {
      console.log(`❌ [ERROR] ${item.name} (${method} /api/v1/${rawPath}): ${err.message}`);
      failed++;
      resolve();
    });

    if (method === "POST" && reqObj.body && reqObj.body.raw) {
      req.write(reqObj.body.raw);
    }

    req.end();
  });
}

async function processItems(items) {
  for (const item of items) {
    if (item.item && Array.isArray(item.item)) {
      console.log(`\n📁 Category: ${item.name}`);
      console.log(`-------------------------------------------------------`);
      await processItems(item.item);
    } else if (item.request) {
      await sendPostmanRequest(item);
    }
  }
}

async function runAll() {
  await processItems(masterCollection.item);

  console.log(`\n=======================================================`);
  console.log(`📊 MASTER POSTMAN TEST RESULT: ${passed} PASSED, ${failed} FAILED (Total: ${totalRequests})`);
  console.log(`=======================================================`);
}

runAll();
