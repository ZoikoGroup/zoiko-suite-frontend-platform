import http from 'http';

const SERVICES = [
  // Block 6 · Legal, Corporate & Commercial — 11
  { block: 'Block 6 · Legal & Commercial', name: 'contract-lifecycle-svc', port: 8119 },
  { block: 'Block 6 · Legal & Commercial', name: 'clause-template-svc', port: 8120 },
  { block: 'Block 6 · Legal & Commercial', name: 'obligation-tracking-svc', port: 8121 },
  { block: 'Block 6 · Legal & Commercial', name: 'board-resolutions-svc', port: 8122 },
  { block: 'Block 6 · Legal & Commercial', name: 'corporate-actions-svc', port: 8123 },
  { block: 'Block 6 · Legal & Commercial', name: 'counterparty-management-svc', port: 8124 },
  { block: 'Block 6 · Legal & Commercial', name: 'purchase-request-svc', port: 8100 },
  { block: 'Block 6 · Legal & Commercial', name: 'purchase-order-svc', port: 8150 },
  { block: 'Block 6 · Legal & Commercial', name: 'spend-controls-svc', port: 8131 },
  { block: 'Block 6 · Legal & Commercial', name: 'vendor-due-diligence-svc', port: 8132 },
  { block: 'Block 6 · Legal & Commercial', name: 'procurement-workflow-svc', port: 8134 },
  // Block 7 · Tax & Compliance — 9
  { block: 'Block 7 · Tax & Compliance', name: 'tax-rules-svc', port: 8125 },
  { block: 'Block 7 · Tax & Compliance', name: 'tax-determination-svc', port: 8126 },
  { block: 'Block 7 · Tax & Compliance', name: 'vat-gst-svc', port: 8127 },
  { block: 'Block 7 · Tax & Compliance', name: 'corporate-tax-svc', port: 8128 },
  { block: 'Block 7 · Tax & Compliance', name: 'withholding-tax-svc', port: 8129 },
  { block: 'Block 7 · Tax & Compliance', name: 'filing-preparation-svc', port: 8130 },
  { block: 'Block 7 · Tax & Compliance', name: 'filing-tracker-svc', port: 8151 },
  { block: 'Block 7 · Tax & Compliance', name: 'compliance-status-svc', port: 8152 },
  { block: 'Block 7 · Tax & Compliance', name: 'exception-escalation-svc', port: 8133 },

  // Block 8 · Intelligence & Reporting — 7
  { block: 'Block 8 · Intelligence & Reporting', name: 'anomaly-detection-svc', port: 8153 },
  { block: 'Block 8 · Intelligence & Reporting', name: 'forecasting-svc', port: 8135 },
  { block: 'Block 8 · Intelligence & Reporting', name: 'compliance-risk-scoring-svc', port: 8136 },
  { block: 'Block 8 · Intelligence & Reporting', name: 'reconciliation-intelligence-svc', port: 8137 },
  { block: 'Block 8 · Intelligence & Reporting', name: 'reporting-orchestration-svc', port: 8138 },
  { block: 'Block 8 · Intelligence & Reporting', name: 'decision-support-svc', port: 8154 },
  { block: 'Block 8 · Intelligence & Reporting', name: 'migration-integrity-svc', port: 8139 },

  // Block 9 · Security & Trust — 4
  { block: 'Block 9 · Security & Trust', name: 'mtls-management-svc', port: 8140 },
  { block: 'Block 9 · Security & Trust', name: 'siem-integration-svc', port: 8141 },
  { block: 'Block 9 · Security & Trust', name: 'carta-svc', port: 8142 },
  { block: 'Block 9 · Security & Trust', name: 'key-management-svc', port: 8143 },

  // Block 10 · Integration & Extensibility — 6
  { block: 'Block 10 · Integration & Extensibility', name: 'connectivity-api-bridge-svc', port: 8144 },
  { block: 'Block 10 · Integration & Extensibility', name: 'banking-connector-svc', port: 8145 },
  { block: 'Block 10 · Integration & Extensibility', name: 'hris-connector-svc', port: 8146 },
  { block: 'Block 10 · Integration & Extensibility', name: 'tax-authority-interface-svc', port: 8147 },
  { block: 'Block 10 · Integration & Extensibility', name: 'esignature-integration-svc', port: 8148 },
  { block: 'Block 10 · Integration & Extensibility', name: 'external-data-feed-svc', port: 8149 },
];

function probe(port) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.get(`http://localhost:${port}/healthz`, { timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          up: res.statusCode === 200,
          code: res.statusCode,
          latency: Date.now() - start
        });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ up: false, code: 'TIMEOUT', latency: Date.now() - start }); });
    req.on('error', (err) => resolve({ up: false, code: err.code || err.message, latency: Date.now() - start }));
  });
}

async function main() {
  console.log('='.repeat(85));
  console.log('       ZOIKO SUITE — AUDIT OF SELECTED 37 SERVICES (BLOCKS 6–10)');
  console.log('='.repeat(85));
  console.log('#'.padEnd(4) + 'Block'.padEnd(38) + 'Service Name'.padEnd(32) + 'Port'.padEnd(8) + 'Status'.padEnd(12) + 'Latency');
  console.log('-'.repeat(85));

  let index = 1;
  let healthy = 0;

  for (const s of SERVICES) {
    const res = await probe(s.port);
    if (res.up) healthy++;
    console.log(
      String(index++).padEnd(4) +
      s.block.padEnd(38) +
      s.name.padEnd(32) +
      String(s.port).padEnd(8) +
      (res.up ? 'HTTP 200' : `FAIL (${res.code})`).padEnd(12) +
      `${res.latency}ms`
    );
  }

  console.log('-'.repeat(85));
  console.log(`SUMMARY: ${healthy} / ${SERVICES.length} services UP and responding HTTP 200 OK.`);
  console.log('='.repeat(85));
}

main().catch(console.error);
