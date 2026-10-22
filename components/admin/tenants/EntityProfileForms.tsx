"use client";

// ORG-03 §4.3 profile amendments, version history, as-of reconstruction and the
// §8 NP5 registry-conflict quarantine.
//
// The idea this panel has to get across, because everything else follows from
// it: amending a legal profile does not change the entity, it adds a version.
// The previous version stays, closed at the instant the new one starts, and a
// lookup as of an earlier date still returns it. That is why a legal-name
// change after an invoice has been issued does not silently rewrite the name
// that invoice was booked under.
//
// Operators who have used in-place edit forms elsewhere in this console will
// assume otherwise, so the forms say it rather than relying on the reader to
// infer it from the word "version".

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { ResultBanner } from "@/components/admin/shared";
import { LabelledId } from "./LabelledId";
import { CELL, FIELD, HEAD, HINT, LABEL, OPTIONAL, PANEL } from "@/components/admin/shared/form";
import {
  CONFLICT_RESOLUTIONS,
  CONFLICT_RESOLUTION_HELP,
  CONFLICT_RESOLUTION_LABELS,
  PROFILE_CHANGE_REASONS,
  PROFILE_CHANGE_REASON_HELP,
  type EntityRegistryConflict,
  type LegalEntityProfileVersion,
} from "@/lib/api/tenants-org";
import {
  amendLegalProfileAction,
  findByRegistryNumberAction,
  lookupEntityAsOfAction,
  resolveRegistryConflictAction,
} from "@/app/admin/tenants/org-actions";
import {
  IDLE_AS_OF_LOOKUP,
  IDLE_CONFLICT_RESOLUTION,
  IDLE_PROFILE_AMENDMENT,
  IDLE_REGISTRY_SEARCH,
} from "@/app/admin/tenants/org-state";

const AMEND_TONE = {
  amended: "success",
  "version-conflict": "warning",
  "approval-required": "warning",
  "registry-conflict": "warning",
  "not-transactable": "warning",
  unauthenticated: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
  "tenant-context": "error",
} as const;

const ASOF_TONE = {
  found: "success",
  // A date before the entity had any profile is a true answer, not a failure.
  "no-profile-then": "neutral",
  unauthenticated: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
  "tenant-context": "error",
} as const;

const SEARCH_TONE = {
  found: "success",
  none: "neutral",
  unauthenticated: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
  "tenant-context": "error",
} as const;

const RESOLVE_TONE = {
  resolved: "success",
  "already-resolved": "warning",
  unauthenticated: "warning",
  unauthorized: "error",
  error: "error",
  idle: "neutral",
  "tenant-context": "error",
} as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type EntityChoice = { legal_entity_id: string; entity_code: string; legal_name: string };

// ── Profile amendment ───────────────────────────────────────────────────────

/**
 * One form, three commands.
 *
 * ChangeLegalName and ChangeRegisteredOffice are narrowings of
 * AmendLegalProfile that record a specific change_reason. They are offered as
 * separate modes rather than as "an amendment where you happen to set the name"
 * because the reason recorded is what a downstream consumer keys off, and
 * leaving it to the operator to remember to set it would make the distinction
 * unreliable exactly where it matters.
 */
export function AmendProfileForm({
  entities,
  entityVersions,
}: {
  entities: EntityChoice[];
  /** record_version per entity id, posted back as expected_version. */
  entityVersions: Record<string, number>;
}) {
  const [state, action, pending] = useActionState(amendLegalProfileAction, IDLE_PROFILE_AMENDMENT);
  const [mode, setMode] = useState("legal-name");
  const [entityId, setEntityId] = useState(entities[0]?.legal_entity_id ?? "");
  const [reason, setReason] = useState("AMENDMENT");

  if (entities.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No legal entities in this tenant yet. Create one before amending a profile.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="expected_version" value={entityVersions[entityId] ?? ""} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="entity_id">
            Legal entity
          </label>
          <select
            id="entity_id"
            name="entity_id"
            className={FIELD}
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
          >
            {entities.map((e) => (
              <option key={e.legal_entity_id} value={e.legal_entity_id}>
                {e.entity_code} — {e.legal_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="mode">
            Change
          </label>
          <select id="mode" name="mode" className={FIELD} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="legal-name">Legal name</option>
            <option value="registered-office">Registered office</option>
            <option value="amend">Other profile fields</option>
          </select>
        </div>
      </div>

      {mode === "legal-name" ? (
        <div className={PANEL}>
          <div>
            <label className={LABEL} htmlFor="legal_name">
              New legal name
            </label>
            <input id="legal_name" name="legal_name" required className={FIELD} placeholder="Acme Holdings Plc" />
          </div>
          <div>
            <label className={LABEL} htmlFor="approved_by_principal_id">
              Approving principal
            </label>
            <input
              id="approved_by_principal_id"
              name="approved_by_principal_id"
              required
              className={FIELD}
              placeholder="principal id of the second approver"
            />
            <p className={HINT}>
              A legal-name change needs a second person, and it cannot be you. Registry number and
              incorporation jurisdiction are under the same rule.
            </p>
          </div>
        </div>
      ) : null}

      {mode === "registered-office" ? (
        <div className={PANEL}>
          <div>
            <label className={LABEL} htmlFor="registered_office">
              Registered office
            </label>
            <textarea
              id="registered_office"
              name="registered_office"
              required
              rows={3}
              className={FIELD}
              placeholder='{"line1":"1 New Street","city":"London","postcode":"EC1A 1AA"}'
            />
            <p className={HINT}>
              Stored as structured JSON and not interpreted here. Address normalisation and legal
              presence belong to other services — recording an address in the registry proves nothing
              about establishment or tax nexus.
            </p>
          </div>
        </div>
      ) : null}

      {mode === "amend" ? (
        <div className={PANEL}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="trading_name">
                Trading name <span className={OPTIONAL}>optional</span>
              </label>
              <input id="trading_name" name="trading_name" className={FIELD} />
            </div>
            <div>
              <label className={LABEL} htmlFor="registry_authority">
                Registry authority <span className={OPTIONAL}>optional</span>
              </label>
              <input id="registry_authority" name="registry_authority" className={FIELD} placeholder="Companies House" />
            </div>
            <div>
              <label className={LABEL} htmlFor="legal_form_code">
                Legal form code <span className={OPTIONAL}>optional</span>
              </label>
              <input id="legal_form_code" name="legal_form_code" className={FIELD} placeholder="ISO 20275 / ELF" />
            </div>
            <div>
              <label className={LABEL} htmlFor="legal_form_local_text">
                Legal form, local text <span className={OPTIONAL}>optional</span>
              </label>
              <input id="legal_form_local_text" name="legal_form_local_text" className={FIELD} />
            </div>
          </div>
          <div>
            <label className={LABEL} htmlFor="change_reason">
              Reason for the change
            </label>
            <select
              id="change_reason"
              name="change_reason"
              className={FIELD}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {PROFILE_CHANGE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <p className={HINT}>{PROFILE_CHANGE_REASON_HELP[reason]}</p>
          </div>
          <div>
            <label className={LABEL} htmlFor="amend_approver">
              Approving principal <span className={OPTIONAL}>required only for registry number</span>
            </label>
            <input id="amend_approver" name="approved_by_principal_id" className={FIELD} />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="effective_from">
            Effective from
          </label>
          <input id="effective_from" name="effective_from" type="date" className={FIELD} defaultValue={today()} />
          <p className={HINT}>
            When the fact became true in the world, not when you are recording it. A past date is
            legitimate — a filing learned about late is effective from the filing date — and does not
            change the entity&rsquo;s present-day identity.
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor="source_evidence_ref">
            Evidence reference <span className={OPTIONAL}>optional</span>
          </label>
          <input
            id="source_evidence_ref"
            name="source_evidence_ref"
            className={FIELD}
            placeholder="companies-house/filing/NM01"
          />
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Recording…" : "Record new version"}
      </Button>

      <ResultBanner tone={AMEND_TONE[state.status]} message={state.message}>
        {state.version ? (
          <div className="mt-2 space-y-1.5">
            <LabelledId label="Version" value={String(state.version.version_number)} />
            <LabelledId label="Legal name" value={state.version.legal_name} />
            <LabelledId label="Recorded at" value={state.version.recorded_at} />
          </div>
        ) : null}
      </ResultBanner>
    </form>
  );
}

// ── Version history ─────────────────────────────────────────────────────────

/**
 * Every recorded version of an entity's profile.
 *
 * Shows business time and record time side by side. They are usually the same
 * and the cases where they differ are the interesting ones: a row whose
 * "recorded" is much later than its "in force from" is a late-arriving change,
 * and it is the reason a report run last month may not match one run today for
 * the same period.
 */
export function ProfileVersionTable({ versions }: { versions: LegalEntityProfileVersion[] }) {
  if (versions.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No profile versions recorded for this entity.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-slate-200 text-left dark:border-slate-800">
            <th className={HEAD}>Version</th>
            <th className={HEAD}>Legal name</th>
            <th className={HEAD}>In force</th>
            <th className={HEAD}>Recorded</th>
            <th className={HEAD}>Why</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => {
            const lateByDays =
              (new Date(v.recorded_at).getTime() - new Date(v.effective_from).getTime()) / 86_400_000;
            return (
              <tr key={v.profile_version_id} className="border-b border-slate-100 dark:border-slate-800/60">
                <td className={CELL}>{v.version_number}</td>
                <td className={CELL}>{v.legal_name}</td>
                <td className={CELL}>
                  {v.effective_from.slice(0, 10)}
                  {v.effective_to ? ` → ${v.effective_to.slice(0, 10)}` : " → current"}
                </td>
                <td className={CELL}>
                  {v.recorded_at.slice(0, 10)}
                  {lateByDays > 1 ? (
                    <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                      (learned {Math.round(lateByDays)}d later)
                    </span>
                  ) : null}
                </td>
                <td className={CELL}>
                  {v.change_reason}
                  {v.change_reason === "CORRECTION" ? (
                    <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                      — prior version was wrong
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── As-of reconstruction ────────────────────────────────────────────────────

export function EntityAsOfForm({ entities }: { entities: EntityChoice[] }) {
  const [state, action, pending] = useActionState(lookupEntityAsOfAction, IDLE_AS_OF_LOOKUP);

  if (entities.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No entities to reconstruct.</p>;
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="asof_entity">
            Legal entity
          </label>
          <select id="asof_entity" name="entity_id" className={FIELD}>
            {entities.map((e) => (
              <option key={e.legal_entity_id} value={e.legal_entity_id}>
                {e.entity_code} — {e.legal_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="as_of">
            As of
          </label>
          <input id="as_of" name="as_of" type="date" required className={FIELD} defaultValue={today()} />
          <p className={HINT}>
            The business date, not the date you are asking on. &ldquo;What was this entity called when
            that invoice was raised?&rdquo;
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Looking up…" : "Reconstruct"}
      </Button>

      <ResultBanner tone={ASOF_TONE[state.status]} message={state.message}>
        {state.result?.profile ? (
          <div className="mt-2 space-y-1.5">
            <LabelledId label="Legal name then" value={state.result.profile.legal_name} />
            <LabelledId label="Version" value={String(state.result.profile.version_number)} />
            {state.result.profile.registration_number ? (
              <LabelledId label="Registry number" value={state.result.profile.registration_number} />
            ) : null}
          </div>
        ) : null}
      </ResultBanner>
    </form>
  );
}

// ── Registry-number search ──────────────────────────────────────────────────

export function RegistryNumberSearchForm() {
  const [state, action, pending] = useActionState(findByRegistryNumberAction, IDLE_REGISTRY_SEARCH);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="registration_number">
            Registration number
          </label>
          <input id="registration_number" name="registration_number" required className={FIELD} placeholder="12345678" />
        </div>
        <div>
          <label className={LABEL} htmlFor="search_jurisdiction">
            Jurisdiction <span className={OPTIONAL}>optional</span>
          </label>
          <input id="search_jurisdiction" name="jurisdiction_id" className={FIELD} placeholder="jurisdiction id" />
          <p className={HINT}>
            A registry number is only unique within a registry, so the same string in two jurisdictions
            is two unrelated entities.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Searching…" : "Search"}
      </Button>

      <ResultBanner tone={SEARCH_TONE[state.status]} message={state.message}>
        {state.matches?.length ? (
          <ul className="mt-2 space-y-1.5">
            {state.matches.map((m) => (
              <li key={m.legal_entity_id} className="text-sm">
                <span className="font-medium">{m.entity_code}</span> — {m.legal_name}{" "}
                <span className="text-xs text-slate-500 dark:text-slate-400">({m.entity_status})</span>
              </li>
            ))}
          </ul>
        ) : null}
      </ResultBanner>
    </form>
  );
}

// ── Registry conflict quarantine ────────────────────────────────────────────

/**
 * Quarantined duplicate-registry claims.
 *
 * Each row is an entity that was NOT created: the registry refused it because
 * another active entity in the same jurisdiction already held the number, and
 * recorded the attempt here rather than merging or overwriting anything. The
 * payload is the only surviving record of what was attempted, which is why it
 * is shown rather than summarised away.
 */
export function RegistryConflictPanel({ conflicts }: { conflicts: EntityRegistryConflict[] }) {
  const [state, action, pending] = useActionState(
    resolveRegistryConflictAction,
    IDLE_CONFLICT_RESOLUTION,
  );
  const [resolution, setResolution] = useState<string>(CONFLICT_RESOLUTIONS[0]);

  if (conflicts.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Nothing quarantined. A duplicate registry claim would appear here — refused, not merged, with
        the rejected details preserved.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {conflicts.map((c) => (
        <div key={c.conflict_id} className="rounded-lg border border-amber-200 p-4 dark:border-amber-500/30">
          <p className="text-sm text-slate-900 dark:text-slate-100">
            An attempt to register <span className="font-mono">{c.registration_number}</span> was refused:
            entity <span className="font-mono">{c.existing_legal_entity_id}</span> already holds it in this
            jurisdiction.
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Detected {new Date(c.detected_at).toLocaleString()} · {CONFLICT_RESOLUTION_LABELS[c.status] ?? c.status}
          </p>

          {Object.keys(c.attempted_payload ?? {}).length > 0 ? (
            <dl className="mt-3 space-y-1">
              {Object.entries(c.attempted_payload).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-xs">
                  <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{String(v)}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {c.status === "OPEN" ? (
            <form action={action} className="mt-4 space-y-3">
              <input type="hidden" name="conflict_id" value={c.conflict_id} />
              <div>
                <label className={LABEL} htmlFor={`status-${c.conflict_id}`}>
                  Conclusion
                </label>
                <select
                  id={`status-${c.conflict_id}`}
                  name="status"
                  className={FIELD}
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                >
                  {CONFLICT_RESOLUTIONS.map((r) => (
                    <option key={r} value={r}>
                      {CONFLICT_RESOLUTION_LABELS[r]}
                    </option>
                  ))}
                </select>
                <p className={HINT}>{CONFLICT_RESOLUTION_HELP[resolution]}</p>
              </div>
              <div>
                <label className={LABEL} htmlFor={`note-${c.conflict_id}`}>
                  Note
                </label>
                <input
                  id={`note-${c.conflict_id}`}
                  name="resolution_note"
                  required
                  className={FIELD}
                  placeholder="Different registrars — confirmed with Companies House"
                />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Recording…" : "Record conclusion"}
              </Button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              {CONFLICT_RESOLUTION_LABELS[c.status]} — {c.resolution_note}
            </p>
          )}
        </div>
      ))}

      <ResultBanner tone={RESOLVE_TONE[state.status]} message={state.message} />
    </div>
  );
}
