/**
 * Postman Collection Test Runner for Tax Domain Microservices
 * Parses docs/Tax_Services_Postman_Collection.json and executes all requests against live services.
 */
const fs = require("fs");
const http = require("http");
const path = require("path");

const collectionPath = path.resolve(__dirname, "../docs/Tax_Services_Postman_Collection.json");
const collection = JSON.parse(fs.readFileSync(collectionPath, "utf8"));

function makeRequest(itemReq) {
  return new Promise((resolve) => {
    const method = itemReq.method || "GET";
    const rawUrl = itemReq.url.raw;
    const urlObj = new URL(rawUrl);

    const headers = {};
    if (itemReq.header && Array.isArray(itemReq.header)) {
      itemReq.header.forEach(h => {
        headers[h.key] = h.value;
      });
    }

    let postBody = null;
    if (itemReq.body && itemReq.body.mode === "raw" && itemReq.body.raw) {
      postBody = itemReq.body.raw;
      headers["Content-Length"] = Buffer.byteLength(postBody);
    }

    const start = Date.now();
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: headers,
      timeout: 5000
    }, (res) => {
      let rawData = "";
      res.on("data", chunk => rawData += chunk);
      res.on("end", () => {
        const duration = Date.now() - start;
        let parsed = null;
        try {
          parsed = JSON.parse(rawData);
        } catch {
          parsed = rawData;
        }
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          durationMs: duration,
          body: parsed
        });
      });
    });

    req.on("error", (err) => {
      resolve({
        statusCode: 0,
        statusMessage: "CONNECTION_FAILED",
        error: err.message,
        durationMs: Date.now() - start,
        body: null
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        statusCode: 408,
        statusMessage: "REQUEST_TIMEOUT",
        durationMs: Date.now() - start,
        body: null
      });
    });

    if (postBody) {
      req.write(postBody);
    }
    req.end();
  });
}

async function runCollection() {
  console.log("================================================================================");
  console.log(" 🚀 POSTMAN COLLECTION RUNNER: " + collection.info.name);
  console.log(" 📄 Description: " + collection.info.description);
  console.log("================================================================================\n");

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  for (const group of collection.item) {
    console.log(`\n📁 FOLDER: ${group.name}`);
    console.log("─".repeat(80));

    for (const reqItem of group.item) {
      totalTests++;
      const reqInfo = reqItem.request;
      const method = reqInfo.method;
      const url = reqInfo.url.raw;

      console.log(`\n▶ [TEST #${totalTests}] ${reqItem.name}`);
      console.log(`  HTTP Method : ${method}`);
      console.log(`  Request URL : ${url}`);
      
      if (reqInfo.body && reqInfo.body.raw) {
        console.log(`  Request Body:\n${JSON.stringify(JSON.parse(reqInfo.body.raw), null, 4).split("\n").map(l => "    " + l).join("\n")}`);
      }

      const response = await makeRequest(reqInfo);

      const isPass = response.statusCode === 200 || response.statusCode === 201;
      if (isPass) {
        passedTests++;
        console.log(`  Status Code : \x1b[32m${response.statusCode} ${response.statusMessage}\x1b[0m (${response.durationMs}ms)`);
      } else {
        failedTests++;
        console.log(`  Status Code : \x1b[31m${response.statusCode} ${response.statusMessage}\x1b[0m (${response.durationMs}ms)`);
      }

      console.log("  Response Body:");
      const bodyStr = typeof response.body === "object" ? JSON.stringify(response.body, null, 4) : String(response.body);
      const indented = bodyStr.split("\n").map(l => "    " + l).join("\n");
      console.log(indented);
      console.log("─".repeat(80));
    }
  }

  console.log("\n================================================================================");
  console.log("                         📊 POSTMAN EXECUTION SUMMARY                           ");
  console.log("================================================================================");
  console.log(`  Total Requests Executed : ${totalTests}`);
  console.log(`  Passed (200 / 201 OK)   : \x1b[32m${passedTests}\x1b[0m`);
  console.log(`  Failed / Errors         : ${failedTests > 0 ? `\x1b[31m${failedTests}\x1b[0m` : "\x1b[32m0\x1b[0m"}`);
  console.log(`  Success Rate            : ${(passedTests / totalTests * 100).toFixed(1)}%`);
  console.log("================================================================================\n");
}

runCollection();
