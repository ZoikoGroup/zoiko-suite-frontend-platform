async function go() {
  const r = await fetch('http://localhost:8130/v1/filing-preparation/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      legal_entity_id: '22222222-2222-2222-2222-222222222222',
      jurisdiction_id: 'uk-gov-01',
      filing_type: 'VAT100_MTD',
      period_key: '2026-Q3',
      reporting_period: '2026-Q3',
      due_date: '2026-11-07',
      payload_data: '{"box1":400000}'
    })
  });
  const text = await r.text();
  console.log('Status:', r.status);
  console.log('Body:', text);
  console.log('Parsed keys:', JSON.stringify(Object.keys(JSON.parse(text))));
  const parsed = JSON.parse(text);
  if (parsed.data) {
    console.log('data keys:', JSON.stringify(Object.keys(parsed.data)));
  }
}
go().catch(e => console.log('FAIL:', e.message));
