import { cookies } from "next/headers";
import { CloudOff, ClipboardList, ShieldAlert } from "lucide-react";
import { PanelEmptyState } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { listObligations, summariseObligations } from "@/lib/api/obligations";
import { listJurisdictions, jurisdictionCodesById } from "@/lib/api/jurisdictions";
import { ObligationTable } from "./ObligationTable";
import { ObligationStats } from "./ObligationStats";

/**
 * The obligation register.
 *
 * Scoped to the session legal entity by default. That is a FILTER, not an
 * isolation boundary — obligations-svc reads no tenant header and has no RLS, so
 * an unfiltered read returns every entity's rows. `allEntities` exposes that
 * deliberately rather than hiding it: an operator who needs the cross-entity view
 * should get it knowingly, and the page labels which one they are looking at.
 *
 * Jurisdiction codes are resolved in parallel. An obligation stores only the
 * jurisdiction UUID, so without this the register would show a column of
 * indistinguishable UUIDs. If jurisdiction-rules-svc is down the register still
 * renders — the ids fall back to short form rather than the whole panel failing,
 * because the obligations themselves are what this panel is for.
 */
export async function ObligationRegisterPanel({
  allEntities = false,
  jurisdictionId,
  obligationType,
  status,
  dueBefore,
  dueAfter,
}: {
  allEntities?: boolean;
  jurisdictionId?: string;
  obligationType?: string;
  status?: string;
  dueBefore?: string;
  dueAfter?: string;
}) {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);

  if (!session) {
    return (
      <PanelEmptyState
        icon={ShieldAlert}
        tone="warning"
        label="No active session"
        hint="Sign in again to read the obligation register."
      />
    );
  }

  const [obligations, jurisdictions] = await Promise.all([
    listObligations({
      legalEntityId: allEntities ? undefined : session.legalEntityId,
      jurisdictionId,
      obligationType,
      status,
      dueBefore,
      dueAfter,
    }),
    listJurisdictions(),
  ]);

  if (!obligations.ok) {
    // A rejected filter is a fixable mistake, not an outage, and the service names
    // the offending field. Saying "unavailable" for a bad date would send the
    // reader to look at containers instead of at their own input.
    const rejected = obligations.error.kind === "http" && obligations.error.status === 400;
    return (
      <PanelEmptyState
        icon={CloudOff}
        tone="warning"
        label={rejected ? "Those filters were rejected" : "Obligation register unavailable"}
        hint={
          rejected
            ? `${obligations.error.message}. Date filters are sent as full RFC3339 timestamps.`
            : obligations.error.message
        }
      />
    );
  }

  const codes: Map<string, string> = jurisdictions.ok
    ? jurisdictionCodesById(jurisdictions.data)
    : new Map();

  if (obligations.data.length === 0) {
    const filtered = Boolean(jurisdictionId || obligationType || status || dueBefore || dueAfter);
    return (
      <PanelEmptyState
        icon={ClipboardList}
        tone="warning"
        label={filtered ? "No obligations match those filters" : "The register is empty"}
        hint={
          filtered
            ? "Nothing recorded matches. An unknown status value is accepted by this service and simply matches nothing, so check the filter before concluding there is no such obligation."
            : allEntities
              ? "No obligations are recorded for any legal entity. Nothing statutory is being tracked, which is a real gap rather than a clean state."
              : "No obligations are recorded for this legal entity. Try the cross-entity view — this service scopes only by legal_entity_id, so obligations may exist under another entity."
        }
      />
    );
  }

  const summary = summariseObligations(obligations.data);

  return (
    <div className="space-y-5">
      <ObligationStats summary={summary} />
      <ObligationTable
        obligations={obligations.data}
        jurisdictionCodes={codes}
        jurisdictionsResolved={jurisdictions.ok}
      />
    </div>
  );
}
