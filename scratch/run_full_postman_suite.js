const http = require("http");
const fs = require("fs");
const path = require("path");

const collectionsDir = path.join(__dirname, "../docs");
const files = fs.readdirSync(collectionsDir).filter(f => f.endsWith(".json"));

console.log(`=======================================================`);
console.log(`🚀 MASTER POSTMAN AUTOMATED TEST SUITE`);
console.log(`Found ${files.length} Postman Collections in docs/`);
console.log(`=======================================================\n`);

let totalPassed = 0;
let totalFailed = 0;

function sendRequest(item) {
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

    // Clean up URL path to point to Next.js API Gateway
    rawPath = rawPath.replace(/^https?:\/\/[^\/]+\//, "");
    rawPath = rawPath.replace(/^(api\/v1\/|v1\/)/, "");

    const method = reqObj.method || "GET";
    const reqOpts = {
      hostname: "localhost",
      port: 3000,
      path: `/api/v1/${rawPath}`,
      method: method,
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": "11111111-1111-1111-1111-111111111111",
        "X-Principal-Id": "33333333-3333-3333-3333-333333333333"
      }
    };

    const startTime = Date.now();
    const req = http.request(reqOpts, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        const duration = Date.now() - startTime;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`▶ [${res.statusCode} ${res.statusMessage}] ${item.name} (${method} /api/v1/${rawPath}) - ${duration}ms — PASSED ✅`);
          totalPassed++;
        } else {
          console.log(`❌ [${res.statusCode} ${res.statusMessage}] ${item.name} (${method} /api/v1/${rawPath}) - ${duration}ms — FAILED`);
          totalFailed++;
        }
        resolve();
      });
    });

    req.on("error", (err) => {
      console.log(`❌ [ERROR] ${item.name} (${method} /api/v1/${rawPath}): ${err.message}`);
      totalFailed++;
      resolve();
    });

    if (method === "POST" && reqObj.body && reqObj.body.raw) {
      req.write(reqObj.body.raw);
    }

    req.end();
  });
}

async function processFolder(items) {
  for (const item of items) {
    if (item.item && Array.isArray(item.item)) {
      console.log(`\n📁 Subfolder: ${item.name}`);
      console.log(`-------------------------------------------------------`);
      await processFolder(item.item);
    } else if (item.request) {
      await sendRequest(item);
    }
  }
}

async function run() {
  for (const file of files) {
    const filePath = path.join(collectionsDir, file);
    const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
    console.log(`\n=======================================================`);
    console.log(`📦 COLLECTION: ${content.info.name} (${file})`);
    console.log(`=======================================================`);
    await processFolder(content.item);
  }

  console.log(`\n=======================================================`);
  console.log(`📊 OVERALL POSTMAN TEST RESULTS: ${totalPassed} PASSED, ${totalFailed} FAILED (Total: ${totalPassed + totalFailed})`);
  console.log(`=======================================================`);
}

run();
