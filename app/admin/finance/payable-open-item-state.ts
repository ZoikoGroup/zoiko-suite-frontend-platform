// Action-state types for the payable-open-item-svc (AP-08) panel. Kept
// separate from app/admin/finance/state.ts's PayableActionState, which
// belongs to the unrelated accounts-payable-svc vendor-invoice flow — the
// two are easy to confuse since both live under "Finance" and both use the
// word "payable", but they talk to different services with different domain
// models (invoices vs. open-item ledger).

export type PayableOpenItemActionState = {
  status: "idle" | "success" | "error";
  message: string;
  payableId?: string;
};

export const IDLE_PAYABLE_OPEN_ITEM_STATE: PayableOpenItemActionState = { status: "idle", message: "" };
