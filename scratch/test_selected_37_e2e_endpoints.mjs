import http from 'http';

const SERVICES = [
  // ── BLOCK 6 · LEGAL, CORPORATE & COMMERCIAL (11) ──
  {
    domainId: 6,
    domain: 'Legal, Corporate & Commercial',
    name: 'contract-lifecycle-svc',
    port: 8119,
    method: 'POST',
    path: '/api/v1/contracts',
    body: {
      title: 'Enterprise Master Services Agreement - GlobalCloud Inc',
      contract_type: 'MSA',
      counterparty_id: 'cp-globalcloud-01',
      counterparty_name: 'GlobalCloud Inc',
      currency: 'GBP',
      total_value: 320000,
      effective_from: '2026-10-01T00:00:00Z',
      status: 'DRAFT'
    }
  },
  {
    domainId: 6,
    domain: 'Legal, Corporate & Commercial',
    name: 'clause-template-svc',
    port: 8120,
    method: 'POST',
    path: '/api/v1/clauses',
    body: {
      title: 'UK GDPR Standard Model Clauses 2026',
      category: 'DATA_PROTECTION',
      body: 'The Data Processor shall process personal data solely in accordance with documented instructions of the Data Controller.',
      jurisdiction_id: 'GB',
      is_standard: true,
      status: 'APPROVED'
    }
  },
  {
    domainId: 6,
    domain: 'Legal, Corporate & Commercial',
    name: 'obligation-tracking-svc',
    port: 8121,
    method: 'POST',
    path: '/api/v1/obligations',
    body: {
      contract_id: 'c-001',
      title: 'Annual ISO 27001 SOC-2 Type II Audit Certification',
      description: 'Deliver renewed SOC-2 Type II certification report to counterparty',
      due_date: '2026-12-15T00:00:00Z',
      risk_level: 'HIGH',
      status: 'PENDING'
    }
  },
  {
    domainId: 6,
    domain: 'Legal, Corporate & Commercial',
    name: 'board-resolutions-svc',
    port: 8122,
    method: 'POST',
    path: '/api/v1/meetings',
    body: {
      meeting_type: 'BOARD_OF_DIRECTORS',
      title: 'Q3 2026 Strategic Expansion & Subsidiary Funding Meeting',
      scheduled_date: '2026-10-15T14:00:00Z',
      location: 'London HQ / Virtual Boardroom',
      quorum_required: 3,
      status: 'SCHEDULED'
    }
  },
  {
    domainId: 6,
    domain: 'Legal, Corporate & Commercial',
    name: 'corporate-actions-svc',
    port: 8123,
    method: 'POST',
    path: '/api/v1/corporate-actions',
    body: {
      action_type: 'EQUITY_INCENTIVE_GRANT',
      description: 'Approve 2026 Employee Stock Option Scheme Allotment',
      authorized_shares: 250000,
      share_class: 'ORDINARY_B',
      status: 'PROPOSED'
    }
  },
  {
    domainId: 6,
    domain: 'Legal, Corporate & Commercial',
    name: 'counterparty-management-svc',
    port: 8124,
    method: 'GET',
    path: '/api/v1/counterparties?status=VERIFIED&jurisdiction_id=GB&risk_classification=TIER_1&limit=50',
    body: null
  },
  {
    domainId: 6,
    domain: 'Legal, Corporate & Commercial',
    name: 'purchase-request-svc',
    port: 8100,
    method: 'POST',
    path: '/api/v1/purchase-requests',
    body: {
      title: 'Core Infrastructure High-Performance Compute Cluster',
      department: 'Engineering',
      requested_by: 'Lingaraj (Super Admin)',
      estimated_amount: 45000,
      currency: 'GBP',
      priority: 'HIGH',
      justification: 'Critical multi-tenant throughput scaling'
    }
  },
  {
    domainId: 6,
    domain: 'Legal, Corporate & Commercial',
    name: 'purchase-order-svc',
    port: 8150,
    method: 'POST',
    path: '/api/v1/purchase-orders',
    body: {
      po_number: 'PO-2026-189',
      vendor_name: 'CloudVault Infrastructure Ltd',
      description: 'Annual Enterprise Cloud Storage & Compute Reserved Instances',
      amount: 96000,
      currency: 'GBP',
      status: 'APPROVED'
    }
  },
  {
    domainId: 6,
    domain: 'Legal, Corporate & Commercial',
    name: 'spend-controls-svc',
    port: 8131,
    method: 'POST',
    path: '/api/v1/spend-controls/limits',
    body: {
      category: 'Software & Cloud Infrastructure',
      department: 'Engineering',
      annual_limit_amount: 400000,
      currency: 'GBP',
      approval_threshold: 25000,
      period: 'ANNUAL'
    }
  },
  {
    domainId: 6,
    domain: 'Legal, Corporate & Commercial',
    name: 'vendor-due-diligence-svc',
    port: 8132,
    method: 'GET',
    path: '/api/v1/vendors?vendor_id=v-cloudvault-01&risk_tier=LOW&sanctions_screened=true&compliance_status=APPROVED',
    body: null
  },
  {
    domainId: 6,
    domain: 'Legal, Corporate & Commercial',
    name: 'procurement-workflow-svc',
    port: 8134,
    method: 'POST',
    path: '/api/v1/procurement/workflows',
    body: {
      requisition_id: 'req-2026-902',
      workflow_type: 'TWO_TIER_EXECUTIVE',
      approval_chain: ['finance_director', 'procurement_lead'],
      status: 'ACTIVE'
    }
  },

  // ── BLOCK 7 · TAX & COMPLIANCE (9) ──
  {
    domainId: 7,
    domain: 'Tax & Compliance',
    name: 'tax-rules-svc',
    port: 8125,
    method: 'POST',
    path: '/api/v1/tax-rules',
    body: {
      jurisdiction_id: 'GB',
      rule_code: 'UK-VAT-STANDARD-20',
      name: 'UK Standard VAT 20%',
      category: 'VAT',
      tax_rate_percentage: 20.0,
      standard_deductions: 0,
      exemptions_json: '{"domestic_energy":false}',
      status: 'ACTIVE',
      version: 1,
      effective_from: '2026-09-01T00:00:00Z'
    }
  },
  {
    domainId: 7,
    domain: 'Tax & Compliance',
    name: 'tax-determination-svc',
    port: 8126,
    method: 'POST',
    path: '/api/v1/tax-determinations',
    body: {
      transaction_id: 'tx-inv-2026-8841',
      source_module: 'ACCOUNTS_PAYABLE',
      legal_entity_id: '22222222-2222-2222-2222-222222222222',
      jurisdiction_id: 'GB',
      tax_category: 'VAT',
      gross_amount: 150000,
      taxable_amount: 150000,
      currency: 'GBP',
      status: 'CALCULATED'
    }
  },
  {
    domainId: 7,
    domain: 'Tax & Compliance',
    name: 'vat-gst-svc',
    port: 8127,
    method: 'POST',
    path: '/api/v1/vat-returns',
    body: {
      legal_entity_id: '22222222-2222-2222-2222-222222222222',
      jurisdiction_id: 'GB',
      tax_registration_number: 'GB998877665',
      tax_period: '2026-Q3',
      total_sales_amount: 520000,
      total_purchase_amount: 210000,
      output_tax_amount: 104000,
      input_tax_amount: 42000,
      currency: 'GBP'
    }
  },
  {
    domainId: 7,
    domain: 'Tax & Compliance',
    name: 'corporate-tax-svc',
    port: 8128,
    method: 'POST',
    path: '/api/v1/corporate-tax-returns',
    body: {
      legal_entity_id: '22222222-2222-2222-2222-222222222222',
      jurisdiction_id: 'GB',
      tax_registration_number: 'GB-CT-443322',
      fiscal_year: 2026,
      accounting_period_start: '2026-01-01',
      accounting_period_end: '2026-12-31',
      gross_revenue: 3500000,
      allowable_deductions: 2100000,
      taxable_income: 1400000,
      tax_rate_percent: 25.0,
      currency: 'GBP'
    }
  },
  {
    domainId: 7,
    domain: 'Tax & Compliance',
    name: 'withholding-tax-svc',
    port: 8129,
    method: 'POST',
    path: '/api/v1/withholding-tax',
    body: {
      legal_entity_id: '22222222-2222-2222-2222-222222222222',
      jurisdiction_id: 'DE',
      counterparty_id: 'cp-acme-gmbh-01',
      payment_reference: 'PAY-DE-2026-09',
      payment_type: 'ROYALTIES',
      gross_payment_amount: 85000,
      taxable_base_amount: 85000,
      withholding_rate_percent: 15.0,
      withheld_amount: 12750,
      currency: 'EUR'
    }
  },
  {
    domainId: 7,
    domain: 'Tax & Compliance',
    name: 'filing-preparation-svc',
    port: 8130,
    method: 'POST',
    path: '/api/v1/filing-preparation/drafts',
    body: {
      legal_entity_id: '22222222-2222-2222-2222-222222222222',
      jurisdiction_id: 'GB',
      filing_type: 'VAT_RETURN',
      period_key: '2026-Q3',
      due_date: '2026-10-31T00:00:00Z',
      payload_data: '{"box1":104000,"box4":42000,"box5":62000}',
      notes: 'Q3 2026 VAT filing draft processed via Zoiko console'
    }
  },
  {
    domainId: 7,
    domain: 'Tax & Compliance',
    name: 'filing-tracker-svc',
    port: 8151,
    method: 'POST',
    path: '/api/v1/filing-tracker/requirements',
    body: {
      obligation: 'UK Companies House Annual Confirmation Statement',
      jurisdiction: 'GB',
      authority: 'Companies House',
      due_date: '2026-11-30',
      status: 'PENDING'
    }
  },
  {
    domainId: 7,
    domain: 'Tax & Compliance',
    name: 'compliance-status-svc',
    port: 8152,
    method: 'GET',
    path: '/api/v1/compliance-status?domain=GLOBAL_GOVERNANCE&jurisdiction=GB&status_filter=ALL&include_metrics=true',
    body: null
  },
  {
    domainId: 7,
    domain: 'Tax & Compliance',
    name: 'exception-escalation-svc',
    port: 8133,
    method: 'POST',
    path: '/api/v1/exception-escalation/exceptions',
    body: {
      domain: 'TAX_GOVERNANCE',
      type: 'VAT_EXEMPTION_THRESHOLD_BREACH',
      severity: 'HIGH',
      assigned_to: 'Chief Compliance Officer',
      sla_breach_at: '2026-10-01T17:00:00Z',
      status: 'ESCALATED'
    }
  },

  // ── BLOCK 8 · INTELLIGENCE & REPORTING (7) ──
  {
    domainId: 8,
    domain: 'Intelligence & Reporting',
    name: 'anomaly-detection-svc',
    port: 8153,
    method: 'GET',
    path: '/api/v1/anomalies?timeframe=LAST_30_DAYS&sensitivity=HIGH&threshold_score=0.85&limit=20',
    body: null
  },
  {
    domainId: 8,
    domain: 'Intelligence & Reporting',
    name: 'forecasting-svc',
    port: 8135,
    method: 'GET',
    path: '/api/v1/forecasts?forecast_horizon_months=12&scenario=BASE_GROWTH&currency=GBP&include_confidence_bands=true',
    body: null
  },
  {
    domainId: 8,
    domain: 'Intelligence & Reporting',
    name: 'compliance-risk-scoring-svc',
    port: 8136,
    method: 'GET',
    path: '/api/v1/compliance/risk-scores?jurisdiction_id=GB&legal_entity_id=22222222-2222-2222-2222-222222222222&risk_model=DYNAMIC_WEIGHTED_V2&include_historical=true',
    body: null
  },
  {
    domainId: 8,
    domain: 'Intelligence & Reporting',
    name: 'reconciliation-intelligence-svc',
    port: 8137,
    method: 'GET',
    path: '/api/v1/reconciliation/intelligence?tolerance_pct=0.05&match_rule=EXACT_AND_FUZZY&unmatched_only=true&period=2026-09',
    body: null
  },
  {
    domainId: 8,
    domain: 'Intelligence & Reporting',
    name: 'reporting-orchestration-svc',
    port: 8138,
    method: 'POST',
    path: '/api/v1/reports/orchestrate',
    body: {
      report_type: 'QUARTERLY_EXECUTIVE_SUMMARY',
      period: '2026-Q3',
      format: 'JSON_AND_PDF',
      include_audit_trail: true
    }
  },
  {
    domainId: 8,
    domain: 'Intelligence & Reporting',
    name: 'decision-support-svc',
    port: 8154,
    method: 'GET',
    path: '/api/v1/decision-support?policy_domain=STATUTORY_TAX&confidence_floor=0.9&jurisdiction=GB&mode=RECOMMENDATION',
    body: null
  },
  {
    domainId: 8,
    domain: 'Intelligence & Reporting',
    name: 'migration-integrity-svc',
    port: 8139,
    method: 'GET',
    path: '/api/v1/migrations/integrity?migration_batch=BATCH-2026-09&verify_checksums=true&audit_ledger=ACTIVE',
    body: null
  },

  // ── BLOCK 9 · SECURITY & TRUST (4) ──
  {
    domainId: 9,
    domain: 'Security & Trust',
    name: 'mtls-management-svc',
    port: 8140,
    method: 'GET',
    path: '/api/v1/mtls/certificates?ca_bundle_version=v3.2&include_expired=false&min_days_remaining=60',
    body: null
  },
  {
    domainId: 9,
    domain: 'Security & Trust',
    name: 'siem-integration-svc',
    port: 8141,
    method: 'POST',
    path: '/api/v1/siem/events',
    body: {
      event_type: 'ADMIN_SECURITY_AUDIT',
      source: 'ZOIKO_CONSOLE',
      severity: 'INFO',
      details: 'Privileged administrator active session verified'
    }
  },
  {
    domainId: 9,
    domain: 'Security & Trust',
    name: 'carta-svc',
    port: 8142,
    method: 'GET',
    path: '/api/v1/carta/captable?legal_entity_id=22222222-2222-2222-2222-222222222222&share_class=COMMON_AND_PREFERRED&as_of_date=2026-09-25',
    body: null
  },
  {
    domainId: 9,
    domain: 'Security & Trust',
    name: 'key-management-svc',
    port: 8143,
    method: 'GET',
    path: '/api/v1/keys?key_ring=zoiko-vault-master&status=ENABLED&algorithm=AES-256-GCM',
    body: null
  },

  // ── BLOCK 10 · INTEGRATION & EXTENSIBILITY (6) ──
  {
    domainId: 10,
    domain: 'Integration & Extensibility',
    name: 'connectivity-api-bridge-svc',
    port: 8144,
    method: 'GET',
    path: '/api/v1/bridge/connections?bridge_type=WEBHOOK_INGRESS&protocol=REST_HTTPS&health_only=false',
    body: null
  },
  {
    domainId: 10,
    domain: 'Integration & Extensibility',
    name: 'banking-connector-svc',
    port: 8145,
    method: 'GET',
    path: '/api/v1/banking/connectors?connector_type=OPEN_BANKING_UK&settlement_network=BACS_AND_CHAPS&active=true',
    body: null
  },
  {
    domainId: 10,
    domain: 'Integration & Extensibility',
    name: 'hris-connector-svc',
    port: 8146,
    method: 'GET',
    path: '/api/v1/hris/connections?provider=WORKDAY_GLOBAL&sync_direction=BI_DIRECTIONAL&include_contractors=true',
    body: null
  },
  {
    domainId: 10,
    domain: 'Integration & Extensibility',
    name: 'tax-authority-interface-svc',
    port: 8147,
    method: 'POST',
    path: '/api/v1/tax-authority/interfaces',
    body: {
      jurisdiction_id: 'GB',
      authority_code: 'HMRC-MTD-VAT',
      authority_name: 'HMRC Making Tax Digital (MTD)',
      api_endpoint: 'https://api.service.hmrc.gov.uk/organisations/vat',
      auth_type: 'OAUTH2',
      protocol: 'REST'
    }
  },
  {
    domainId: 10,
    domain: 'Integration & Extensibility',
    name: 'esignature-integration-svc',
    port: 8148,
    method: 'POST',
    path: '/api/v1/esignature/envelopes',
    body: {
      document_id: 'doc-msa-2026-001',
      signers: [
        { name: 'Lingaraj Admin', email: 'admin@zoikosuite.com', role: 'SIGNATORY' }
      ],
      expiration_days: 7
    }
  },
  {
    domainId: 10,
    domain: 'Integration & Extensibility',
    name: 'external-data-feed-svc',
    port: 8149,
    method: 'GET',
    path: '/api/v1/feeds?feed_type=FX_AND_STATUTORY_BENCHMARK&base_currency=GBP&frequency=HOURLY',
    body: null
  }
];

function testEndpoint(svc) {
  return new Promise((resolve) => {
    const start = Date.now();
    const isPost = svc.method === 'POST';
    const postData = isPost && svc.body ? JSON.stringify(svc.body) : '';

    const options = {
      hostname: '127.0.0.1',
      port: svc.port,
      path: svc.path,
      method: svc.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Tenant-Id': '11111111-1111-1111-1111-111111111111',
        'X-Principal-Id': '33333333-3333-3333-3333-333333333333',
        'X-Legal-Entity-Id': '22222222-2222-2222-2222-222222222222',
        ...(isPost ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      },
      timeout: 3000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const ms = Date.now() - start;
        let parsed = null;
        try { parsed = JSON.parse(data); } catch {}
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        resolve({
          ok,
          status: res.statusCode,
          ms,
          serviceHeader: res.headers['x-service'] || null,
          data: parsed
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, ms: Date.now() - start, error: 'TIMEOUT' });
    });

    req.on('error', (err) => {
      resolve({ ok: false, status: 0, ms: Date.now() - start, error: err.message });
    });

    if (isPost && postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function main() {
  console.log('='.repeat(95));
  console.log('    ZOIKO SUITE — END-TO-END ENDPOINT EXECUTION AUDIT (DOMAINS 6–10 | 37 SERVICES)');
  console.log('='.repeat(95));
  console.log('#'.padEnd(4) + 'Service Name'.padEnd(32) + 'Port'.padEnd(7) + 'Method'.padEnd(8) + 'Path'.padEnd(32) + 'HTTP'.padEnd(8) + 'Status');
  console.log('-'.repeat(95));

  let index = 1;
  const results = [];

  for (const svc of SERVICES) {
    const res = await testEndpoint(svc);
    results.push({ ...svc, res });
    const shortPath = svc.path.split('?')[0];
    const statusText = res.ok ? `200/201 OK (${res.ms}ms)` : `FAIL (${res.status || res.error})`;
    console.log(
      String(index++).padEnd(4) +
      svc.name.padEnd(32) +
      String(svc.port).padEnd(7) +
      svc.method.padEnd(8) +
      shortPath.padEnd(32) +
      String(res.status).padEnd(8) +
      statusText
    );
  }

  console.log('='.repeat(95));
  console.log('\nDOMAIN-WISE COMPLETION BREAKDOWN:');
  console.log('-'.repeat(70));

  const domainGroups = [
    { id: 6, name: '6 · Legal, Corporate & Commercial', total: 11 },
    { id: 7, name: '7 · Tax & Compliance', total: 9 },
    { id: 8, name: '8 · Intelligence & Reporting', total: 7 },
    { id: 9, name: '9 · Security & Trust', total: 4 },
    { id: 10, name: '10 · Integration & Extensibility', total: 6 },
  ];

  for (const dg of domainGroups) {
    const domSvcs = results.filter(r => r.domainId === dg.id);
    const passed = domSvcs.filter(r => r.res.ok).length;
    const pct = Math.round((passed / dg.total) * 100);
    console.log(`${dg.name.padEnd(42)}: ${passed} / ${dg.total} endpoints passed (${pct}%)`);
  }

  const totalPassed = results.filter(r => r.res.ok).length;
  const totalPct = Math.round((totalPassed / SERVICES.length) * 100);
  console.log('-'.repeat(70));
  console.log(`TOTAL COMPLETION: ${totalPassed} / ${SERVICES.length} services end-to-end verified (${totalPct}%)\n`);
}

main().catch(console.error);

