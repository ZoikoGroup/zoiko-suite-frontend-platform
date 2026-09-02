// Dedicated Purchase Requests page surface for purchase-request-svc (:8100).
//
// The panel and table live under commercial-ops because the requisition is step
// one of the procurement flow there. These are re-exported so the domain gets
// its own console route without a second copy of the data-fetching logic.
//
// The forms are NOT re-exported from commercial-ops — they call Server Actions,
// and using the commercial-ops actions from this domain would couple the two
// pages' write surfaces. Own forms are provided here instead, wired to this
// domain's own actions.ts.
export { PurchaseRequestPanel } from "../commercial-ops/PurchaseRequestPanel";
export { PurchaseRequestTable } from "../commercial-ops/PurchaseRequestTable";
export { RaiseRequestForm, DecideRequestForm } from "./PurchaseRequestForms";

