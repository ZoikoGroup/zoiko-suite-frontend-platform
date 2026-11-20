// Links and small helpers shared by the Evidence Requirements console. The
// table + drawer itself is the Authorization console's RegisterView, served
// here through `base`.

import { hrefAt, type Query } from "@/components/admin/authorization/console/register";

export const BASE = "/admin/evidence";

export function href(q: Query): string {
  return hrefAt(BASE, q);
}

export type EvidenceCtx = {
  me: string;
  /** Read once per request. */
  now: number;
  canManageRequests: boolean | null;
};
