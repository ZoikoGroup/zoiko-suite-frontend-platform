"use server";

// Server Actions for tenant-entity-registry-svc (:8081).
//
// Server Actions are reachable by direct POST, so the session is verified inside
// every action rather than relying on the proxy's /admin matcher.
//
// Unlike obligations-svc, this service does enforce identity, and these actions
// are written against what it actually does:
//
//  - Every mutation is authorized against authorization-svc and fails closed.
//    A 403 means this principal holds no grant; a 503 means the decision could
//    not be obtained and nothing was written.
//  - A mutation with no verified principal is 401, not 403. The console
//    reports these apart because the fixes differ — wiring versus an RBAC
//    assignment.
//  - Reads are scoped by row-level security from X-Tenant-Id. Omitting the
//    header returns an empty list rather than an error, so every call sends the
//    session identity.
//
// Two ids are pre-validated before they reach the service, because a malformed
// UUID reaches the pg driver and comes back as a 500/503 — which reads as an
// outage rather than a typo.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, decodeSession, type SessionIdentity } from "@/lib/auth";
import {
  assignJurisdiction,
  createEntity,
  createHierarchy,
  createResidencyPolicy,
  createWorkspace,
  endDateHierarchy,
  endDateJurisdictionAssignment,
  isBillableClassification,
  isUuid,
  provisionTenant,
  transitionEntityStatus,
  transitionTenantLifecycle,
  updateEntity,
  BILLING_CLASSIFICATIONS,
  ENTITY_STATUS_TRANSITIONS,
  TENANT_LIFECYCLE_TRANSITIONS,
  type UpdateEntityInput,
} from "@/lib/api/tenants";
import type { ApiError } from "@/lib/api/client";
import {
  IDLE_CREATE_ENTITY,
  IDLE_HIERARCHY_WRITE,
  IDLE_JURISDICTION_WRITE,
  IDLE_PROVISION_TENANT,
  IDLE_RESIDENCY_POLICY,
  IDLE_TRANSITION,
  IDLE_UPDATE_ENTITY,
  IDLE_WORKSPACE,
  type CreateEntityState,
  type HierarchyWriteState,
  type JurisdictionWriteState,
  type ProvisionTenantState,
  type ResidencyPolicyState,
  type TransitionState,
  type UpdateEntityState,
  type WorkspaceState,
} from "./state";

const PATH = "/admin/tenants";

const EXPIRED_MESSAGE = "Your session has expired — sign in again.";

async function requireIdentity(): Promise<SessionIdentity> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email) throw new Error("Unauthorized");
  return {
    principalId: session.principalId,
    tenantId: session.tenantId,
    legalEntityId: session.legalEntityId,
  };
}

/**
 * Turn a "YYYY-MM-DD" from a date input into the RFC3339 the service needs.
 *
 * effective_from decodes into a Go time.Time, so a bare date fails the JSON
 * decode with a 400 that names the whole body rather than the field — which
 * looks like the field was omitted. Midnight UTC is used so the date a user
 * picked is the date that is stored.
 */
function toRFC3339(date: string): string {
  return `${date}T00:00:00Z`;
}

/**
 * Map a backend failure onto the state vocabulary.
 *
 * 401 and 403 are kept apart deliberately: the first means the gateway
 * forwarded no verified principal, the second that this principal has no
 * grant. 503 is neither — the decision could not be obtained and nothing was
 * written, so the reader should retry rather than change anything.
 */
type FailureKind =
  | "unauthenticated"
  | "unauthorized"
  | "unvalidated"
  | "conflict"
  | "illegal"
  | "tenant-context"
  | "error";

function failureKind(error: ApiError): { kind: FailureKind; message: string } {
  // Checked before status, because a GOV-01 refusal reuses 403 and 503 for
  // reasons that have nothing to do with this principal's grants or with the
  // registry's own health. gateway-auth-svc resolves the tenant before Traefik
  // forwards anything, so these never reached the service at all.
  if (error.tenantContext === "denied") {
    return {
      kind: "tenant-context",
      message:
        "The gateway refused this request before it reached the registry: the tenant on your session is not in a state that may transact, or the legal entity on it belongs to a different tenant. " +
        "This is not a permissions problem — a grant will not change it. Check the tenant's status and lifecycle_state.",
    };
  }
  if (error.tenantContext === "unresolved") {
    return {
      kind: "unvalidated",
      message:
        "The gateway could not reach the tenant registry to confirm your tenant may transact, so it refused the request rather than assuming. Nothing was written — retry when the registry is back.",
    };
  }
  if (error.status === 401) {
    return {
      kind: "unauthenticated",
      message:
        "The registry received no verified principal for this request. The console sends one, so this points at gateway or service wiring rather than your permissions.",
    };
  }
  if (error.status === 403) {
    return {
      kind: "unauthorized",
      message:
        "authorization-svc refused this action for your principal. It needs the matching grant against this tenant — or, for provisioning, against the platform scope.",
    };
  }
  if (error.status === 503) {
    return {
      kind: "unvalidated",
      message:
        "A service this write depends on could not be reached, so the registry refused it rather than guessing. Nothing was written — retry when it is back.",
    };
  }
  if (error.status === 409) {
    return { kind: "conflict", message: error.message };
  }
  if (error.status === 422) {
    return { kind: "illegal", message: error.message };
  }
  return { kind: "error", message: error.message };
}

/**
 * Narrow a failure to the states a particular form can actually render.
 *
 * Each form models a different subset — a lifecycle transition has no
 * `conflict`, provisioning has no `illegal` — and a status the form's tone map
 * does not know would render as an untoned banner. Anything outside the
 * supported set falls back to `error` while keeping the backend's message, so
 * the reason survives even when the category does not.
 */
function classify<S extends string>(
  error: ApiError,
  supported: readonly S[],
): { status: S | "error"; message: string } {
  const { kind, message } = failureKind(error);
  return {
    status: (supported as readonly string[]).includes(kind) ? (kind as S) : "error",
    message,
  };
}

// ── Provision a tenant ──────────────────────────────────────────────────────

export async function provisionTenantAction(
  _prev: ProvisionTenantState,
  formData: FormData,
): Promise<ProvisionTenantState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_PROVISION_TENANT, status: "error", message: EXPIRED_MESSAGE };
  }

  const tenantCode = String(formData.get("tenant_code") ?? "").trim();
  const legalName = String(formData.get("legal_name") ?? "").trim();
  if (!tenantCode || !legalName) {
    return { status: "error", message: "Tenant code and legal name are both required." };
  }

  const result = await provisionTenant(
    {
      tenant_code: tenantCode,
      legal_name: legalName,
      trading_name: String(formData.get("trading_name") ?? "").trim() || undefined,
      default_currency_code: String(formData.get("default_currency_code") ?? "GBP"),
      primary_timezone: String(formData.get("primary_timezone") ?? "Europe/London"),
      primary_locale: String(formData.get("primary_locale") ?? "en-GB"),
    },
    identity,
  );

  if (!result.ok) {
    return classify(result.error, ["unauthenticated", "unauthorized", "conflict"] as const);
  }

  revalidatePath(PATH);
  return {
    status: "provisioned",
    tenant: result.data,
    message:
      `Tenant provisioned as ${result.data.tenant_code} — ${result.data.tenant_id}. ` +
      `It starts in lifecycle ${result.data.lifecycle_state} and must be activated before it is fully in service. ` +
      `A default residency policy was created with no region assigned, so its hosting region is unresolved until you set one.`,
  };
}

// ── Tenant lifecycle ────────────────────────────────────────────────────────

export async function transitionTenantLifecycleAction(
  _prev: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_TRANSITION, status: "error", message: EXPIRED_MESSAGE };
  }

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const targetState = String(formData.get("target_state") ?? "").trim();
  const currentState = String(formData.get("current_state") ?? "").trim();

  if (!isUuid(tenantId)) {
    return {
      status: "error",
      message: "That is not a valid tenant ID. Checked here because a malformed id reaches the database driver and comes back looking like an outage.",
    };
  }

  // Refuse locally what the service would refuse anyway, so the reader gets the
  // reason rather than a bare 422.
  const legal = TENANT_LIFECYCLE_TRANSITIONS[currentState] ?? [];
  if (currentState && !legal.includes(targetState)) {
    return {
      status: "illegal",
      message:
        legal.length === 0
          ? `${currentState} is terminal — nothing transitions out of it.`
          : `${currentState} cannot move to ${targetState}. Legal from ${currentState}: ${legal.join(", ")}.`,
    };
  }

  const result = await transitionTenantLifecycle(tenantId, targetState, identity);
  if (!result.ok) {
    return classify(result.error, ["unauthenticated", "unauthorized", "illegal"] as const);
  }

  revalidatePath(PATH);
  return {
    status: "transitioned",
    message: `Tenant lifecycle moved ${currentState || "→"} → ${targetState}. The service answers 204 with no body, so this reflects the request it accepted.`,
  };
}

// ── Create a legal entity ───────────────────────────────────────────────────

export async function createEntityAction(
  _prev: CreateEntityState,
  formData: FormData,
): Promise<CreateEntityState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_CREATE_ENTITY, status: "error", message: EXPIRED_MESSAGE };
  }

  const tenantId = String(formData.get("tenant_id") ?? identity.tenantId).trim();
  const jurisdictionId = String(formData.get("primary_jurisdiction_id") ?? "").trim();
  const residencyPolicyId = String(formData.get("data_residency_policy_id") ?? "").trim();

  if (!isUuid(tenantId)) {
    return { status: "error", message: "That is not a valid tenant ID." };
  }
  if (!isUuid(jurisdictionId)) {
    return {
      status: "error",
      message: "Pick a jurisdiction. The registry validates this against jurisdiction-rules-svc and refuses anything it does not recognise.",
    };
  }
  if (!isUuid(residencyPolicyId)) {
    return {
      status: "error",
      message: "A residency policy is required — the data model does not allow an entity without one.",
    };
  }

  const result = await createEntity(
    {
      tenant_id: tenantId,
      entity_code: String(formData.get("entity_code") ?? "").trim(),
      legal_name: String(formData.get("legal_name") ?? "").trim(),
      trading_name: String(formData.get("trading_name") ?? "").trim() || undefined,
      entity_type: String(formData.get("entity_type") ?? "SUBSIDIARY"),
      default_currency_code: String(formData.get("default_currency_code") ?? "GBP"),
      fiscal_calendar_id: String(formData.get("fiscal_calendar_id") ?? "").trim(),
      primary_jurisdiction_id: jurisdictionId,
      data_residency_policy_id: residencyPolicyId,
    },
    identity,
  );

  if (!result.ok) {
    // A 400 naming the jurisdiction is a genuinely unknown id, which is a
    // different fix from an unreachable jurisdiction service (503).
    if (result.error.status === 400 && /jurisdiction/i.test(result.error.message)) {
      return {
        status: "invalid-jurisdiction",
        message: "jurisdiction-rules-svc does not recognise that jurisdiction ID, so the entity was not created.",
      };
    }
    return classify(result.error, ["unauthenticated", "unauthorized", "unvalidated", "conflict"] as const);
  }

  revalidatePath(PATH);
  return {
    status: "created",
    entity: result.data,
    message: `Entity ${result.data.entity_code} created — ${result.data.legal_entity_id}, status ${result.data.entity_status}.`,
  };
}

// ── Entity status ───────────────────────────────────────────────────────────

export async function transitionEntityStatusAction(
  _prev: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_TRANSITION, status: "error", message: EXPIRED_MESSAGE };
  }

  const entityId = String(formData.get("entity_id") ?? "").trim();
  const newStatus = String(formData.get("new_status") ?? "").trim();
  const currentStatus = String(formData.get("current_status") ?? "").trim();

  if (!isUuid(entityId)) {
    return { status: "error", message: "That is not a valid entity ID." };
  }

  const legal = ENTITY_STATUS_TRANSITIONS[currentStatus] ?? [];
  if (currentStatus && !legal.includes(newStatus)) {
    return {
      status: "illegal",
      message:
        legal.length === 0
          ? `${currentStatus} is terminal — an entity cannot leave it.`
          : `${currentStatus} cannot move to ${newStatus}. Legal from ${currentStatus}: ${legal.join(", ")}.`,
    };
  }

  const result = await transitionEntityStatus(entityId, newStatus, identity);
  if (!result.ok) {
    return classify(result.error, ["unauthenticated", "unauthorized", "illegal"] as const);
  }

  revalidatePath(PATH);
  return {
    status: "transitioned",
    message: `Entity status moved ${currentStatus || "→"} → ${newStatus}. This also published entity.status.changed on the event backbone.`,
  };
}

// ── Jurisdiction assignment ─────────────────────────────────────────────────

export async function assignJurisdictionAction(
  _prev: JurisdictionWriteState,
  formData: FormData,
): Promise<JurisdictionWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_JURISDICTION_WRITE, status: "error", message: EXPIRED_MESSAGE };
  }

  const entityId = String(formData.get("entity_id") ?? "").trim();
  const jurisdictionId = String(formData.get("jurisdiction_id") ?? "").trim();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();

  if (!isUuid(entityId)) {
    return { status: "error", message: "That is not a valid entity ID." };
  }
  if (!isUuid(jurisdictionId)) {
    return { status: "error", message: "Pick a jurisdiction from the register." };
  }
  if (!effectiveFrom) {
    return { status: "error", message: "An effective-from date is required." };
  }

  const result = await assignJurisdiction(
    entityId,
    {
      jurisdiction_id: jurisdictionId,
      assignment_type: String(formData.get("assignment_type") ?? "PRIMARY"),
      effective_from: toRFC3339(effectiveFrom),
      source_basis: String(formData.get("source_basis") ?? "").trim(),
    },
    identity,
  );

  if (!result.ok) {
    if (result.error.status === 400 && /jurisdiction/i.test(result.error.message)) {
      return {
        status: "invalid-jurisdiction",
        message: "jurisdiction-rules-svc does not recognise that jurisdiction ID, so nothing was assigned.",
      };
    }
    return classify(result.error, ["unauthenticated", "unauthorized", "unvalidated"] as const);
  }

  revalidatePath(PATH);
  return {
    status: "assigned",
    assignment: result.data,
    message: `Jurisdiction assigned as ${result.data.assignment_type} — assignment ${result.data.assignment_id}.`,
  };
}

export async function endDateJurisdictionAction(
  _prev: JurisdictionWriteState,
  formData: FormData,
): Promise<JurisdictionWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_JURISDICTION_WRITE, status: "error", message: EXPIRED_MESSAGE };
  }

  const assignmentId = String(formData.get("assignment_id") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();

  if (!isUuid(assignmentId)) {
    return { status: "error", message: "That is not a valid assignment ID." };
  }
  if (!endDate) {
    return { status: "error", message: "An end date is required." };
  }

  const result = await endDateJurisdictionAssignment(assignmentId, toRFC3339(endDate), identity);
  if (!result.ok) {
    return classify(result.error, ["unauthenticated", "unauthorized", "unvalidated"] as const);
  }

  revalidatePath(PATH);
  return {
    status: "end-dated",
    message:
      "Assignment end-dated. Despite the DELETE verb nothing was removed — the row keeps its history and now carries an effective_to.",
  };
}

// ── Residency policy ────────────────────────────────────────────────────────

export async function createResidencyPolicyAction(
  _prev: ResidencyPolicyState,
  formData: FormData,
): Promise<ResidencyPolicyState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_RESIDENCY_POLICY, status: "error", message: EXPIRED_MESSAGE };
  }

  const tenantId = String(formData.get("tenant_id") ?? identity.tenantId).trim();
  if (!isUuid(tenantId)) {
    return { status: "error", message: "That is not a valid tenant ID." };
  }

  const regionId = String(formData.get("residency_region_id") ?? "").trim();

  const result = await createResidencyPolicy(
    {
      tenant_id: tenantId,
      policy_name: String(formData.get("policy_name") ?? "").trim(),
      policy_code: String(formData.get("policy_code") ?? "").trim(),
      residency_mode: String(formData.get("residency_mode") ?? "PREFERRED_REGION"),
      conflict_resolution_mode: String(formData.get("conflict_resolution_mode") ?? "FAIL_CLOSED"),
      residency_region_id: regionId || undefined,
    },
    identity,
  );

  if (!result.ok) {
    return classify(result.error, ["unauthenticated", "unauthorized", "conflict"] as const);
  }

  revalidatePath(PATH);
  return {
    status: "created",
    policy: result.data,
    message: regionId
      ? `Policy ${result.data.policy_code} created with a region assigned — the tenant's hosting region now resolves.`
      : `Policy ${result.data.policy_code} created with no region. The tenant's hosting region stays unresolved until one is set.`,
  };
}

// ── Update a legal entity ───────────────────────────────────────────────────

/**
 * PATCH an entity's descriptive fields.
 *
 * Only the fields the reader actually changed are sent — the registry treats an
 * omitted key as "leave alone", so sending all three every time would overwrite
 * a value another operator changed between this form being rendered and
 * submitted.
 *
 * Clearing a trading name is distinguished from leaving it alone, because JSON
 * null and an absent key mean different things to the backend and a form that
 * could only send strings would make clearing one impossible.
 */
export async function updateEntityAction(
  _prev: UpdateEntityState,
  formData: FormData,
): Promise<UpdateEntityState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_UPDATE_ENTITY, status: "error", message: EXPIRED_MESSAGE };
  }

  const entityId = String(formData.get("entity_id") ?? "").trim();
  if (!isUuid(entityId)) {
    return { status: "error", message: "That is not a valid entity ID." };
  }

  const input: UpdateEntityInput = {};

  const legalName = String(formData.get("legal_name") ?? "").trim();
  if (legalName) input.legal_name = legalName;

  const currency = String(formData.get("default_currency_code") ?? "").trim();
  if (currency) input.default_currency_code = currency;

  const tradingIntent = String(formData.get("trading_name_intent") ?? "unchanged");
  if (tradingIntent === "clear") {
    input.trading_name = null;
  } else if (tradingIntent === "set") {
    const tradingName = String(formData.get("trading_name") ?? "").trim();
    if (!tradingName) {
      return {
        status: "error",
        message: "Choose Clear to remove the trading name, or type a new one.",
      };
    }
    input.trading_name = tradingName;
  }

  if (Object.keys(input).length === 0) {
    return {
      status: "unchanged",
      message: "Nothing was changed, so nothing was sent. Fill in at least one field.",
    };
  }

  const changed = Object.keys(input).join(", ");

  const result = await updateEntity(entityId, input, identity);
  if (!result.ok) {
    return classify(result.error, ["unauthenticated", "unauthorized", "tenant-context"] as const);
  }

  revalidatePath(PATH);
  return {
    status: "updated",
    entity: result.data,
    message:
      `Entity ${result.data.entity_code} updated: ${changed}. ` +
      `Type, jurisdiction, fiscal calendar and residency policy are fixed at creation and were not touched.`,
  };
}

// ── Workspaces ──────────────────────────────────────────────────────────────

/**
 * Create a workspace under this tenant.
 *
 * billing_classification is validated here against the same list the backend
 * holds. The backend fails closed on an unrecognised value rather than
 * defaulting one in, so catching it locally turns a service rejection into a
 * form error that names the offending value.
 */
export async function createWorkspaceAction(
  _prev: WorkspaceState,
  formData: FormData,
): Promise<WorkspaceState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_WORKSPACE, status: "error", message: EXPIRED_MESSAGE };
  }

  const tenantId = String(formData.get("tenant_id") ?? identity.tenantId ?? "").trim();
  if (!isUuid(tenantId)) {
    return { status: "error", message: "That is not a valid tenant ID." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { status: "error", message: "A workspace name is required." };
  }

  const classification = String(formData.get("billing_classification") ?? "").trim();
  if (!(BILLING_CLASSIFICATIONS as readonly string[]).includes(classification)) {
    return {
      status: "invalid-classification",
      message:
        `"${classification}" is not a billing classification the registry accepts. It fails closed on an ` +
        `unrecognised value rather than defaulting one in, because whether a workspace can ever produce a ` +
        `live charge is not something to guess.`,
    };
  }

  // A workspace may legitimately have no entity scope — it hangs from the
  // tenant — so an empty value is omitted rather than sent blank.
  const legalEntityId = String(formData.get("legal_entity_id") ?? "").trim();
  if (legalEntityId && !isUuid(legalEntityId)) {
    return { status: "error", message: "That is not a valid legal entity ID." };
  }

  const result = await createWorkspace(
    {
      tenant_id: tenantId,
      legal_entity_id: legalEntityId || undefined,
      name,
      business_unit: String(formData.get("business_unit") ?? "").trim() || undefined,
      billing_classification: classification,
      billing_source: String(formData.get("billing_source") ?? "NONE").trim() || undefined,
    },
    identity,
  );

  if (!result.ok) {
    return classify(
      result.error,
      ["unauthenticated", "unauthorized", "conflict", "tenant-context"] as const,
    );
  }

  revalidatePath(PATH);
  return {
    status: "created",
    workspace: result.data,
    message: isBillableClassification(result.data.billing_classification)
      ? `Workspace "${result.data.name}" created as ${result.data.billing_classification} — a commercial class, so it can produce live charges.`
      : `Workspace "${result.data.name}" created as ${result.data.billing_classification} — a non-billable class, so it must never produce a live charge regardless of what entitlement says.`,
  };
}

// ── Entity hierarchy ────────────────────────────────────────────────────────

/**
 * Create a parent/child relationship between two legal entities.
 *
 * The same pair can hold several relationships at once — an OWNERSHIP edge and
 * a REPORTING edge are different facts about the same two entities — so an
 * existing relationship is not treated as a duplicate.
 */
export async function createHierarchyAction(
  _prev: HierarchyWriteState,
  formData: FormData,
): Promise<HierarchyWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_HIERARCHY_WRITE, status: "error", message: EXPIRED_MESSAGE };
  }

  const tenantId = String(formData.get("tenant_id") ?? identity.tenantId ?? "").trim();
  const parentId = String(formData.get("parent_legal_entity_id") ?? "").trim();
  const childId = String(formData.get("child_legal_entity_id") ?? "").trim();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();

  if (!isUuid(tenantId)) {
    return { status: "error", message: "That is not a valid tenant ID." };
  }
  if (!isUuid(parentId) || !isUuid(childId)) {
    return { status: "error", message: "Pick both a parent and a child entity." };
  }
  if (parentId === childId) {
    return {
      status: "cycle",
      message: "An entity cannot be its own parent. Pick two different entities.",
    };
  }
  if (!effectiveFrom) {
    return { status: "error", message: "An effective-from date is required." };
  }

  const result = await createHierarchy(
    {
      tenant_id: tenantId,
      parent_legal_entity_id: parentId,
      child_legal_entity_id: childId,
      relationship_type: String(formData.get("relationship_type") ?? "OWNERSHIP"),
      effective_from: toRFC3339(effectiveFrom),
    },
    identity,
  );

  if (!result.ok) {
    // A cycle is kept apart from an ordinary conflict because no different date
    // will make it succeed — the shape of the graph is what was refused.
    if (result.error.status === 409 && /cycl|circular|ancestor/i.test(result.error.message)) {
      return {
        status: "cycle",
        message:
          "That relationship would create a cycle — the child is already an ancestor of the parent. Nothing was written.",
      };
    }
    return classify(
      result.error,
      ["unauthenticated", "unauthorized", "conflict", "tenant-context"] as const,
    );
  }

  revalidatePath(PATH);
  return {
    status: "created",
    hierarchy: result.data,
    message: `${result.data.relationship_type} relationship created — hierarchy ${result.data.hierarchy_id}, effective ${result.data.effective_from.slice(0, 10)}.`,
  };
}

export async function endDateHierarchyAction(
  _prev: HierarchyWriteState,
  formData: FormData,
): Promise<HierarchyWriteState> {
  let identity: SessionIdentity;
  try {
    identity = await requireIdentity();
  } catch {
    return { ...IDLE_HIERARCHY_WRITE, status: "error", message: EXPIRED_MESSAGE };
  }

  const hierarchyId = String(formData.get("hierarchy_id") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();

  if (!isUuid(hierarchyId)) {
    return { status: "error", message: "That is not a valid hierarchy ID." };
  }
  if (!endDate) {
    return { status: "error", message: "An end date is required." };
  }

  const result = await endDateHierarchy(hierarchyId, toRFC3339(endDate), identity);
  if (!result.ok) {
    return classify(
      result.error,
      ["unauthenticated", "unauthorized", "conflict", "tenant-context"] as const,
    );
  }

  revalidatePath(PATH);
  return {
    status: "end-dated",
    message:
      "Relationship end-dated. Despite the DELETE verb nothing was removed — the row keeps its history and now carries an effective_to.",
  };
}
