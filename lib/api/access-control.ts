// Server-side API client for access-control-svc (:8137) and authorization-svc (:8089)

import { apiGet, apiPost, type ApiResult, type Identity } from "./client";

export type RoleDefinition = {
  role_definition_id: string;
  role_name: string;
  display_name?: string;
  description?: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  created_at?: string;
  updated_at?: string;
};

export type PermissionBundle = {
  bundle_id: string;
  role_definition_id: string;
  action_type: string;
  resource_scope: string;
  created_at?: string;
};

export async function listRoles(
  identity?: Identity,
  options?: { status?: string }
): Promise<ApiResult<RoleDefinition[]>> {
  const query: Record<string, string | undefined> = {};
  if (options?.status) query.status = options.status;

  const res = await apiGet<{ roles?: RoleDefinition[] } | RoleDefinition[]>(
    "accessControl",
    "/v1/roles",
    { identity, query }
  );
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.roles ?? [];
  return { ok: true, data: list };
}

export async function createRole(
  body: {
    role_name: string;
    description?: string;
    status?: "ACTIVE" | "INACTIVE";
  },
  identity?: Identity
): Promise<ApiResult<RoleDefinition>> {
  const res = await apiPost<{ role?: RoleDefinition } | RoleDefinition>(
    "accessControl",
    "/v1/roles",
    body,
    { identity }
  );
  if (!res.ok) return res;
  const r = (res.data as { role?: RoleDefinition }).role ?? (res.data as RoleDefinition);
  return { ok: true, data: r };
}

export async function listBundles(
  roleDefinitionId: string,
  identity?: Identity
): Promise<ApiResult<PermissionBundle[]>> {
  const res = await apiGet<{ bundles?: PermissionBundle[] } | PermissionBundle[]>(
    "accessControl",
    `/v1/roles/${roleDefinitionId}/bundles`,
    { identity }
  );
  if (!res.ok) return res;
  const list = Array.isArray(res.data) ? res.data : res.data.bundles ?? [];
  return { ok: true, data: list };
}

export async function createBundle(
  roleDefinitionId: string,
  body: { action_type: string; resource_scope: string },
  identity?: Identity
): Promise<ApiResult<PermissionBundle>> {
  const res = await apiPost<{ bundle?: PermissionBundle } | PermissionBundle>(
    "accessControl",
    `/v1/roles/${roleDefinitionId}/bundles`,
    body,
    { identity }
  );
  if (!res.ok) return res;
  const b = (res.data as { bundle?: PermissionBundle }).bundle ?? (res.data as PermissionBundle);
  return { ok: true, data: b };
}

export async function checkPermission(
  body: { principal_id: string; legal_entity_id: string; action_type: string },
  identity?: Identity
): Promise<ApiResult<{ allowed: boolean; decision_id?: string }>> {
  return apiPost<{ allowed: boolean; decision_id?: string }>(
    "authorization",
    "/v1/check",
    body,
    { identity }
  );
}
