import http from 'http';
import fs from 'fs';
import path from 'path';

const LOCAL_SERVICES = [
  // Block 6 · Legal, Corporate & Commercial
  { block: 'Block 6', domain: 'Legal, Corporate & Commercial', name: 'contract-lifecycle-svc', port: 8119, client: 'contracts.ts', ui: '/admin/legal' },
  { block: 'Block 6', domain: 'Legal, Corporate & Commercial', name: 'clause-template-svc', port: 8120, client: 'legal.ts', ui: '/admin/legal' },
  { block: 'Block 6', domain: 'Legal, Corporate & Commercial', name: 'obligation-tracking-svc', port: 8121, client: 'legal.ts', ui: '/admin/legal' },
  { block: 'Block 6', domain: 'Legal, Corporate & Commercial', name: 'board-resolutions-svc', port: 8122, client: 'legal.ts', ui: '/admin/legal' },
  { block: 'Block 6', domain: 'Legal, Corporate & Commercial', name: 'corporate-actions-svc', port: 8123, client: 'legal.ts', ui: '/admin/legal' },
  { block: 'Block 6', domain: 'Legal, Corporate & Commercial', name: 'counterparty-management-svc', port: 8124, client: 'legal.ts', ui: '/admin/legal' },
  { block: 'Block 6', domain: 'Legal, Corporate & Commercial', name: 'purchase-request-svc', port: 8100, client: 'purchase-requests.ts', ui: '/admin/purchase-requests' },
  { block: 'Block 6', domain: 'Legal, Corporate & Commercial', name: 'purchase-order-svc', port: 8150, client: 'purchase-orders.ts', ui: '/admin/purchase-requests' },
  { block: 'Block 6', domain: 'Legal, Corporate & Commercial', name: 'spend-controls-svc', port: 8131, client: 'spend-controls.ts', ui: '/admin/commercial-ops' },
  { block: 'Block 6', domain: 'Legal, Corporate & Commercial', name: 'vendor-due-diligence-svc', port: 8132, client: 'vendor-due-diligence.ts', ui: '/admin/compliance' },
  { block: 'Block 6', domain: 'Legal, Corporate & Commercial', name: 'procurement-workflow-svc', port: 8134, client: 'legal.ts', ui: '/admin/commercial-ops' },

  // Block 7 · Tax & Compliance
  { block: 'Block 7', domain: 'Tax & Compliance', name: 'tax-rules-svc', port: 8125, client: 'tax.ts', ui: '/admin/tax' },
  { block: 'Block 7', domain: 'Tax & Compliance', name: 'tax-determination-svc', port: 8126, client: 'tax.ts', ui: '/admin/tax' },
  { block: 'Block 7', domain: 'Tax & Compliance', name: 'vat-gst-svc', port: 8127, client: 'tax.ts', ui: '/admin/tax' },
  { block: 'Block 7', domain: 'Tax & Compliance', name: 'corporate-tax-svc', port: 8128, client: 'tax.ts', ui: '/admin/tax' },
  { block: 'Block 7', domain: 'Tax & Compliance', name: 'withholding-tax-svc', port: 8129, client: 'tax.ts', ui: '/admin/tax' },
  { block: 'Block 7', domain: 'Tax & Compliance', name: 'filing-preparation-svc', port: 8130, client: 'tax.ts', ui: '/admin/tax' },
  { block: 'Block 7', domain: 'Tax & Compliance', name: 'filing-tracker-svc', port: 8151, client: 'tax.ts', ui: '/admin/tax' },
  { block: 'Block 7', domain: 'Tax & Compliance', name: 'compliance-status-svc', port: 8152, client: 'tax.ts', ui: '/admin/tax' },
  { block: 'Block 7', domain: 'Tax & Compliance', name: 'exception-escalation-svc', port: 8133, client: 'tax.ts', ui: '/admin/tax' },

  // Block 8 · Intelligence & Reporting
  { block: 'Block 8', domain: 'Intelligence & Reporting', name: 'anomaly-detection-svc', port: 8153, client: 'intelligence.ts', ui: '/admin/intelligence' },
  { block: 'Block 8', domain: 'Intelligence & Reporting', name: 'forecasting-svc', port: 8135, client: 'intelligence.ts', ui: '/admin/intelligence' },
  { block: 'Block 8', domain: 'Intelligence & Reporting', name: 'compliance-risk-scoring-svc', port: 8136, client: 'intelligence.ts', ui: '/admin/intelligence' },
  { block: 'Block 8', domain: 'Intelligence & Reporting', name: 'reconciliation-intelligence-svc', port: 8137, client: 'intelligence.ts', ui: '/admin/intelligence' },
  { block: 'Block 8', domain: 'Intelligence & Reporting', name: 'reporting-orchestration-svc', port: 8138, client: 'intelligence.ts', ui: '/admin/intelligence' },
  { block: 'Block 8', domain: 'Intelligence & Reporting', name: 'decision-support-svc', port: 8154, client: 'intelligence.ts', ui: '/admin/intelligence' },
  { block: 'Block 8', domain: 'Intelligence & Reporting', name: 'migration-integrity-svc', port: 8139, client: 'migration-integrity.ts', ui: '/admin/migrations' },

  // Block 9 · Security & Trust
  { block: 'Block 9', domain: 'Security & Trust', name: 'mtls-management-svc', port: 8140, client: 'security-trust.ts', ui: '/admin/security' },
  { block: 'Block 9', domain: 'Security & Trust', name: 'siem-integration-svc', port: 8141, client: 'security-trust.ts', ui: '/admin/security' },
  { block: 'Block 9', domain: 'Security & Trust', name: 'carta-svc', port: 8142, client: 'security-trust.ts', ui: '/admin/security' },
  { block: 'Block 9', domain: 'Security & Trust', name: 'key-management-svc', port: 8143, client: 'security-trust.ts', ui: '/admin/security' },
  { block: 'Block 9', domain: 'Security & Trust', name: 'ai-governance-svc', port: 8183, client: 'ai-governance.ts', ui: '/admin/ai-governance' },

  // Block 10 · Integration & Extensibility
  { block: 'Block 10', domain: 'Integration & Extensibility', name: 'connectivity-api-bridge-svc', port: 8144, client: 'integration.ts', ui: '/admin/integration' },
  { block: 'Block 10', domain: 'Integration & Extensibility', name: 'banking-connector-svc', port: 8145, client: 'integration.ts', ui: '/admin/integration' },
  { block: 'Block 10', domain: 'Integration & Extensibility', name: 'hris-connector-svc', port: 8146, client: 'integration.ts', ui: '/admin/integration' },
  { block: 'Block 10', domain: 'Integration & Extensibility', name: 'tax-authority-interface-svc', port: 8147, client: 'integration.ts', ui: '/admin/integration' },
  { block: 'Block 10', domain: 'Integration & Extensibility', name: 'esignature-integration-svc', port: 8148, client: 'integration.ts', ui: '/admin/integration' },
  { block: 'Block 10', domain: 'Integration & Extensibility', name: 'external-data-feed-svc', port: 8149, client: 'integration.ts', ui: '/admin/integration' },
];

function probePort(port) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = http.get(`http://127.0.0.1:${port}/healthz`, { timeout: 1500 }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        const ms = Date.now() - t0;
        let json = null;
        try { json = JSON.parse(raw); } catch { }
        resolve({
          up: res.statusCode === 200,
          statusCode: res.statusCode,
          ms,
          serviceName: json?.service || json?.name || null
        });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ up: false, statusCode: 0, ms: 1500, error: 'TIMEOUT' }); });
    req.on('error', (err) => resolve({ up: false, statusCode: 0, ms: Date.now() - t0, error: err.message }));
  });
}

function probeNextDispatch(port) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ port, path: '/healthz', method: 'GET' });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/backend/dispatch',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 2500
    }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch { }
        resolve({
          dispatchOk: res.statusCode === 200 && json?.ok === true,
          status: res.statusCode,
          ms: json?.ms || 0
        });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ dispatchOk: false, error: 'TIMEOUT' }); });
    req.on('error', (err) => resolve({ dispatchOk: false, error: err.message }));
    req.write(payload);
    req.end();
  });
}

function checkClient(clientFileName) {
  const p = path.join(process.cwd(), 'lib', 'api', clientFileName);
  if (!fs.existsSync(p)) return { exists: false, count: 0 };
  const content = fs.readFileSync(p, 'utf8');
  const matches = content.match(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g) || [];
  return { exists: true, count: matches.length };
}

function checkUi(uiPath) {
  const pagePath = path.join(process.cwd(), 'app', uiPath, 'page.tsx');
  return fs.existsSync(pagePath);
}

async function run() {
  console.log('='.repeat(90));
  console.log('        ZOIKO SUITE — COMPLETE LOCAL MICROSERVICES E2E VERIFICATION');
  console.log('='.repeat(90));
  console.log(`Checking ${LOCAL_SERVICES.length} active microservices configured locally in Docker...\n`);

  const results = [];

  for (const svc of LOCAL_SERVICES) {
    const [portRes, dispatchRes] = await Promise.all([
      probePort(svc.port),
      probeNextDispatch(svc.port)
    ]);
    const clientRes = checkClient(svc.client);
    const uiRes = checkUi(svc.ui);

    // Scoring weights:
    // Container live & healthy (port 200): 30%
    // Client SDK implemented: 25%
    // Dispatch gateway proxy roundtrip: 20%
    // Admin UI page available: 25%
    let score = 0;
    if (portRes.up) score += 30;
    if (clientRes.exists && clientRes.count > 0) score += 25;
    if (dispatchRes.dispatchOk) score += 20;
    if (uiRes) score += 25;

    results.push({
      ...svc,
      portRes,
      dispatchRes,
      clientRes,
      uiRes,
      score
    });
  }

  // Print by block
  const blocks = [...new Set(LOCAL_SERVICES.map(s => s.block))];

  for (const block of blocks) {
    const list = results.filter(r => r.block === block);
    const blockScore = Math.round(list.reduce((acc, r) => acc + r.score, 0) / list.length);
    console.log(`\n── ${block} (${list[0].domain}) — ${blockScore}% Completed ──`);
    console.log(
      '#'.padEnd(4) +
      'Service'.padEnd(32) +
      'Port'.padEnd(7) +
      'Container'.padEnd(12) +
      'Client SDK'.padEnd(14) +
      'Dispatch E2E'.padEnd(15) +
      'Admin UI'.padEnd(10) +
      'Score'
    );
    console.log('-'.repeat(96));

    let idx = 1;
    for (const r of list) {
      const containerTag = r.portRes.up ? `UP (${r.portRes.ms}ms)` : 'OFFLINE';
      const clientTag = r.clientRes.exists ? `YES (${r.clientRes.count} fns)` : 'NO';
      const dispatchTag = r.dispatchRes.dispatchOk ? `OK (${r.dispatchRes.ms}ms)` : 'FAILED';
      const uiTag = r.uiRes ? 'YES' : 'NO';

      console.log(
        String(idx++).padEnd(4) +
        r.name.padEnd(32) +
        String(r.port).padEnd(7) +
        containerTag.padEnd(12) +
        clientTag.padEnd(14) +
        dispatchTag.padEnd(15) +
        uiTag.padEnd(10) +
        `${r.score}%`
      );
    }
  }

  const total = results.length;
  const liveCount = results.filter(r => r.portRes.up).length;
  const clientCount = results.filter(r => r.clientRes.exists).length;
  const dispatchCount = results.filter(r => r.dispatchRes.dispatchOk).length;
  const uiCount = results.filter(r => r.uiRes).length;
  const avgScore = Math.round(results.reduce((acc, r) => acc + r.score, 0) / total);

  console.log('\n' + '='.repeat(90));
  console.log('                            OVERALL LOCAL SUMMARY');
  console.log('='.repeat(90));
  console.log(`Total Local Microservices   : ${total}`);
  console.log(`Live Containers (Port /healthz): ${liveCount} / ${total} (${Math.round(liveCount / total * 100)}%)`);
  console.log(`Typed Client SDKs (lib/api)    : ${clientCount} / ${total} (${Math.round(clientCount / total * 100)}%)`);
  console.log(`Next.js Dispatch Gateway E2E   : ${dispatchCount} / ${total} (${Math.round(dispatchCount / total * 100)}%)`);
  console.log(`Admin UI Pages & Panels        : ${uiCount} / ${total} (${Math.round(uiCount / total * 100)}%)`);
  console.log(`Platform Local E2E Completion  : ${avgScore}%`);
  console.log('='.repeat(90));

  fs.writeFileSync('scratch/local_services_e2e_results.json', JSON.stringify({
    total,
    liveCount,
    clientCount,
    dispatchCount,
    uiCount,
    avgScore,
    services: results
  }, null, 2));
}

run().catch(console.error);
