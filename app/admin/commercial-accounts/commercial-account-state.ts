import type {
  CommercialAccount,
  Membership,
  PriceCatalog,
  Plan,
  CommercialSubscription,
  ResolvedEntitlement,
  SubscriptionStatusEvent,
  SubscriptionChangeRequest,
  EvaluationProgram,
  UsageMeterEvent,
  ContractEntitlementOverlay,
  BillingSourceTransfer,
  EvaluateEntitlementResult,
  CommercialBillingAccount,
  CommercialInvoice,
} from "@/lib/api/commercial-account";

export type CommercialAccountActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  action?:
    | "create_account"
    | "get_account"
    | "create_membership"
    | "deactivate_membership"
    | "list_memberships"
    | "create_catalog"
    | "create_plan"
    | "approve_publish_price_version"
    | "set_limit"
    | "create_subscription"
    | "get_subscription"
    | "set_status"
    | "resolve_entitlement"
    | "preview_change"
    | "confirm_change"
    | "create_evaluation_program"
    | "record_usage_event"
    | "create_overlay"
    | "transfer_billing"
    | "evaluate_commercial_entitlement"
    | "open_billing_account"
    | "get_invoice";
  account?: CommercialAccount;
  memberships?: Membership[];
  catalog?: PriceCatalog;
  plan?: Plan;
  subscription?: CommercialSubscription;
  entitlement?: ResolvedEntitlement;
  statusEvents?: SubscriptionStatusEvent[];
  changeRequest?: SubscriptionChangeRequest;
  evaluationProgram?: EvaluationProgram;
  usageEvent?: UsageMeterEvent;
  overlay?: ContractEntitlementOverlay;
  transfer?: BillingSourceTransfer;
  commercialEntitlement?: EvaluateEntitlementResult;
  billingAccount?: CommercialBillingAccount;
  invoice?: CommercialInvoice;
  error?: string;
};

export const IDLE_COMMERCIAL_STATE: CommercialAccountActionState = {
  status: "idle",
};
