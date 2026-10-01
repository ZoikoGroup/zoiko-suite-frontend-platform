import { apiGet, apiPost, type ApiResult, type ApiWriteResult, type Identity } from "./client";

export type KillSwitchAction = "ENGAGE" | "DISENGAGE";

export type KillSwitchEvent = {
  kill_switch_event_id: string;
  plane?: string;
  domain?: string;
  provider_code?: string;
  tenant_id?: string;
  action: KillSwitchAction;
  reason: string;
  reconciliation_procedure_ref?: string;
  approved_by_principal_id: string;
  created_at: string;
  created_by_principal_id: string;
};

export type KillSwitchState = {
  plane?: string;
  domain?: string;
  provider_code?: string;
  tenant_id?: string;
  action: KillSwitchAction;
  reason: string;
  latest_event_at: string;
};

export type KillSwitchResolution = {
  blocked: boolean;
  matched_event?: KillSwitchEvent;
  matching_event?: KillSwitchEvent;
  checked_at?: string;
};

export type EngageKillSwitchInput = {
  plane?: string;
  domain?: string;
  provider_code?: string;
  tenant_id?: string;
  reason: string;
  reconciliation_procedure_ref: string;
  approved_by_principal_id: string;
};

export type DisengageKillSwitchInput = {
  plane?: string;
  domain?: string;
  provider_code?: string;
  tenant_id?: string;
  reason: string;
  approved_by_principal_id: string;
};

/** List all current derived kill-switch states across all active scopes. */
export async function listKillSwitchStates(
  identity?: Identity
): Promise<ApiResult<KillSwitchState[]>> {
  return apiGet<KillSwitchState[]>(
    "killSwitchRegistry",
    "/v1/kill-switches",
    { identity }
  );
}

/** Resolve whether an operation is blocked by an active kill switch. */
export async function resolveKillSwitch(
  query: { plane?: string; domain?: string; provider_code?: string; tenant_id?: string },
  identity?: Identity
): Promise<ApiResult<KillSwitchResolution>> {
  return apiGet<KillSwitchResolution>(
    "killSwitchRegistry",
    "/v1/kill-switches/resolve",
    {
      query: {
        plane: query.plane,
        domain: query.domain,
        provider_code: query.provider_code,
        tenant_id: query.tenant_id,
      },
      identity,
    }
  );
}

/** Retrieve the append-only transition history for a given scope tuple. */
export async function listKillSwitchHistory(
  query: { plane?: string; domain?: string; provider_code?: string; tenant_id?: string },
  identity?: Identity
): Promise<ApiResult<KillSwitchEvent[]>> {
  return apiGet<KillSwitchEvent[]>(
    "killSwitchRegistry",
    "/v1/kill-switches/history",
    {
      query: {
        plane: query.plane,
        domain: query.domain,
        provider_code: query.provider_code,
        tenant_id: query.tenant_id,
      },
      identity,
    }
  );
}

/** Engage a kill switch for a specified scope tuple. */
export async function engageKillSwitch(
  input: EngageKillSwitchInput,
  identity: Identity
): Promise<ApiWriteResult<KillSwitchEvent>> {
  return apiPost<KillSwitchEvent>(
    "killSwitchRegistry",
    "/v1/kill-switches/engage",
    input,
    { identity }
  );
}

/** Disengage a kill switch for an exact scope tuple. */
export async function disengageKillSwitch(
  input: DisengageKillSwitchInput,
  identity: Identity
): Promise<ApiWriteResult<KillSwitchEvent>> {
  return apiPost<KillSwitchEvent>(
    "killSwitchRegistry",
    "/v1/kill-switches/disengage",
    input,
    { identity }
  );
}
