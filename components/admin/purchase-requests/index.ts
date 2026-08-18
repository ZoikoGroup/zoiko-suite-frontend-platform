// Dedicated Purchase Requests page surface for purchase-request-svc (:8100).
//
// The panel, table and forms live under commercial-ops because the requisition
// is step one of the procurement flow there — an order can only be issued
// against an APPROVED request. This page re-exports them so the domain gets its
// own console without a second copy of the wiring.
export { PurchaseRequestPanel } from "../commercial-ops/PurchaseRequestPanel";
export { PurchaseRequestTable } from "../commercial-ops/PurchaseRequestTable";
export { RaiseRequestForm, DecideRequestForm } from "../commercial-ops/PurchaseRequestForms";
