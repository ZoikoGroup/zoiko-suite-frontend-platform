INSERT INTO purposes (purpose_id, tenant_id, created_at, created_by_principal_id)
VALUES (
  '11111111-2222-3333-4444-555555555555',
  NULL,
  NOW(),
  '33333333-3333-3333-3333-333333333333'
)
ON CONFLICT (purpose_id) DO NOTHING;

INSERT INTO purpose_versions (
  purpose_version_id,
  purpose_id,
  statement,
  compatibility_class,
  lawful_basis_refs,
  version_status,
  effective_from,
  created_at,
  created_by_principal_id
)
VALUES (
  '22222222-3333-4444-5555-666666666666',
  '11111111-2222-3333-4444-555555555555',
  'Direct marketing and promotional communications across verified digital channels.',
  'DIRECT_MARKETING',
  '["CONSENT"]'::jsonb,
  'PUBLISHED',
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '1 day',
  '33333333-3333-3333-3333-333333333333'
)
ON CONFLICT (purpose_version_id) DO NOTHING;
