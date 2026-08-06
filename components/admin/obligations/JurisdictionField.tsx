import { listJurisdictions, describeJurisdiction } from "@/lib/api/jurisdictions";
import { FIELD, LABEL } from "@/components/admin/shared/form";

/**
 * Jurisdiction picker, shared by every form whose service validates a
 * jurisdiction_id against jurisdiction-rules-svc.
 *
 * A server component so the register is read at render rather than shipped to the
 * browser. It degrades to a free-text UUID field when jurisdiction-rules-svc is
 * unreachable, and says why: without the picker a caller genuinely does need to
 * paste an id, and offering an empty select would make the form unusable with no
 * explanation. The warning also tells the reader what will happen if they try —
 * the consuming services validate jurisdiction_id on the write path and fail
 * closed, so while that service is down the write will be refused with a 503
 * regardless of what is typed here.
 *
 * `name` is a prop because the field is not called the same thing everywhere:
 * obligations and jurisdiction assignments post `jurisdiction_id`, while entity
 * creation posts `primary_jurisdiction_id`. Duplicating the component per field
 * name would mean the degraded path and its explanation had to be maintained
 * twice.
 */
export async function JurisdictionField({
  id = "obligation_jurisdiction",
  name = "jurisdiction_id",
  label = "Jurisdiction",
  consumer = "obligations-svc",
}: {
  id?: string;
  name?: string;
  label?: string;
  /** The service that will validate this id, named in the degraded-path warning. */
  consumer?: string;
}) {
  const result = await listJurisdictions();

  if (!result.ok || result.data.length === 0) {
    return (
      <div>
        <label htmlFor={id} className={LABEL}>
          {label} ID
        </label>
        <input
          id={id}
          name={name}
          required
          placeholder="00000000-0000-0000-0000-000000000000"
          className={`${FIELD} font-mono text-xs`}
          autoComplete="off"
        />
        <p className="mt-1.5 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
          {result.ok
            ? "jurisdiction-rules-svc has no jurisdictions registered, so there is nothing to choose from."
            : "jurisdiction-rules-svc could not be reached, so the picker is unavailable and an ID must be pasted."}{" "}
          Note that {consumer} validates this ID against that same service and fails closed —
          while it is unreachable, the write will be refused with a 503 whatever is entered here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} name={name} required defaultValue="" className={FIELD}>
        <option value="" disabled>
          Select a jurisdiction
        </option>
        {result.data.map((jurisdiction) => (
          <option key={jurisdiction.jurisdiction_id} value={jurisdiction.jurisdiction_id}>
            {describeJurisdiction(jurisdiction)}
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
        Read live from jurisdiction-rules-svc — the same register {consumer} validates against, so
        anything listed here will be accepted.
      </p>
    </div>
  );
}
