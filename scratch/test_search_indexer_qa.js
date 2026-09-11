const http = require('http');

function post(url, body) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const data = JSON.stringify(body || {});
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + (u.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(buf);
        } catch {
          parsed = buf;
        }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', (err) => resolve({ status: 500, error: err.message }));
    req.write(data);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + (u.search || ''),
      method: 'GET',
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(buf);
        } catch {
          parsed = buf;
        }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', (err) => resolve({ status: 500, error: err.message }));
    req.end();
  });
}

async function runQAMatrix() {
  console.log('================================================================');
  console.log('       SEARCH-INDEXER-SVC (:8096) SENIOR QA TEST SUITE          ');
  console.log('================================================================\n');

  let passedCount = 0;
  const total = 7;

  // TC-01: Health & Ready Probes
  {
    const h = await get('http://localhost:8096/healthz');
    const r = await get('http://localhost:8096/readyz');
    const pass = h.status === 200 && r.status === 200;
    if (pass) passedCount++;
    console.log(`[${pass ? 'PASS ✅' : 'FAIL ❌'}] TC-01: Service Liveness & Readiness Probes (:8096)`);
    console.log(`        Expected: 200/200 | Actual: ${h.status}/${r.status}`);
  }

  // TC-02: OpenSearch Cluster Connectivity (:9200)
  {
    const os = await get('http://localhost:9200/_cluster/health');
    const pass = os.status === 200 && (os.data.status === 'green' || os.data.status === 'yellow');
    if (pass) passedCount++;
    console.log(`[${pass ? 'PASS ✅' : 'FAIL ❌'}] TC-02: OpenSearch Cluster Health (:9200)`);
    console.log(`        Expected: 200 (green/yellow) | Actual: ${os.status} (${os.data.status})`);
  }

  // TC-03: On-Demand Syncer Pass (POST /v1/sync)
  {
    const sync = await post('http://localhost:8096/v1/sync', {});
    const pass = sync.status === 200 && sync.data.success === true;
    if (pass) passedCount++;
    console.log(`[${pass ? 'PASS ✅' : 'FAIL ❌'}] TC-03: On-Demand Syncer Pass (POST /v1/sync)`);
    console.log(`        Expected: 200 (success: true) | Actual: ${sync.status} (${sync.data.duration_ms}ms)`);
  }

  // TC-04: Document Upsert Indexing (POST /v1/index)
  const testDocId = `ob-manual-qa-${Date.now()}`;
  {
    const doc = await post('http://localhost:8096/v1/index', {
      id: testDocId,
      tenant_id: '11111111-1111-1111-1111-111111111111',
      legal_entity_id: '22222222-2222-2222-2222-222222222222',
      body: {
        obligation_code: 'OBL-QA-TESTSUITE-999',
        obligation_type: 'STATUTORY',
        obligation_status: 'OPEN',
        responsible_function: 'Corporate Tax QA',
        source_reference: 'Statutory Notice Ref 2026',
        severity_level: 'HIGH',
      },
    });
    const pass = doc.status === 201 && doc.data.indexed === true;
    if (pass) passedCount++;
    console.log(`[${pass ? 'PASS ✅' : 'FAIL ❌'}] TC-04: Document Upsert Indexing (POST /v1/index)`);
    console.log(`        Expected: 201 Created | Actual: ${doc.status} (Index: ${doc.data.index})`);
  }

  // TC-05: Positive Keyword Search with BM25 Relevance (POST /v1/search)
  {
    const search = await post('http://localhost:8096/v1/search', {
      tenant_id: '11111111-1111-1111-1111-111111111111',
      keywords: 'OBL-QA-TESTSUITE-999',
      size: 10,
    });
    const pass = search.status === 200 && search.data.total >= 1;
    if (pass) passedCount++;
    console.log(`[${pass ? 'PASS ✅' : 'FAIL ❌'}] TC-05: Positive Keyword Search (POST /v1/search)`);
    console.log(`        Expected: 200 (total >= 1) | Actual: ${search.status} (total: ${search.data.total}, top score: ${search.data.results?.[0]?.Score?.toFixed(3)})`);
  }

  // TC-06: Negative: Missing Tenant ID Scope Guard
  {
    const neg1 = await post('http://localhost:8096/v1/search', {
      keywords: 'STATUTORY',
    });
    const pass = neg1.status === 400 && neg1.data.error === 'tenant_id_required';
    if (pass) passedCount++;
    console.log(`[${pass ? 'PASS ✅' : 'FAIL ❌'}] TC-06: Negative: Missing Tenant ID Scope Guard`);
    console.log(`        Expected: 400 (tenant_id_required) | Actual: ${neg1.status} (${neg1.data.error})`);
  }

  // TC-07: Negative: Cross-Tenant Isolation Boundary
  {
    const neg2 = await post('http://localhost:8096/v1/search', {
      tenant_id: '99999999-9999-9999-9999-999999999999',
      keywords: 'OBL-QA-TESTSUITE-999',
    });
    const pass = neg2.status === 200 && neg2.data.total === 0;
    if (pass) passedCount++;
    console.log(`[${pass ? 'PASS ✅' : 'FAIL ❌'}] TC-07: Negative: Cross-Tenant Data Isolation`);
    console.log(`        Expected: 200 (total: 0) | Actual: ${neg2.status} (total: ${neg2.data.total})`);
  }

  console.log('\n================================================================');
  console.log(`QA Test Matrix Result: ${passedCount}/${total} PASSED (${Math.round((passedCount / total) * 100)}%)`);
  console.log('================================================================\n');
}

runQAMatrix();
