// Shared state shape for "paste an ID, read one record" forms.
//
// Five services in this console expose a GET-by-id route whose only sensible
// consumer is an operator holding an id from a log, an event, or another
// service's response. A route per record would be a lot of files for a lookup,
// so these run through a Server Action instead.
//
// `missing` is a state of its own rather than an error. A 404 from these routes
// is a fact about the store, not a failure of the request, and the two call for
// different messages — several of these services return 404 both for "no such
// record" and for "not in your tenant", and only the page knows which.

export type LookupState<T = unknown> = {
  status: "idle" | "found" | "missing" | "error";
  message: string;
  record?: T;
};

export const IDLE_LOOKUP: LookupState = { status: "idle", message: "" };
