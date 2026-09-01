"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { JsonBlock, ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { submitNotification } from "@/app/admin/notifications/actions";
import { IDLE_SEND_STATE, type SendNotificationState } from "@/app/admin/notifications/state";
import type { NotificationTemplate } from "@/lib/api/notifications";

const TONE = {
  sent: "success",
  replayed: "neutral",
  // Warning, like `failed` â€” but the two say different things, and the message
  // carries the difference: a retrying notice has not been given up on.
  retrying: "warning",
  failed: "warning",
  denied: "error",
  error: "error",
  idle: "neutral",
} as const;

/** Turn `organization_name` into `Organization name` for a field label. */
function humanise(variable: string): string {
  const spaced = variable.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

type Props = {
  /**
   * The catalogue, fetched server-side. Empty means the service could not be
   * asked â€” the form still works for free-text sends, and says why the
   * template option is missing rather than silently offering nothing.
   */
  templates: NotificationTemplate[];
  templatesError?: string;
};

export function SendNotificationForm({ templates, templatesError }: Props) {
  const [state, action, pending] = useActionState<SendNotificationState, FormData>(
    submitNotification,
    IDLE_SEND_STATE,
  );

  // "" means free text. Selecting a template swaps the content half of the
  // form: the two are mutually exclusive at the service, and offering both at
  // once would let an operator build a request that is refused on submit.
  const [templateName, setTemplateName] = useState("");
  const selected = templates.find((t) => t.name === templateName);

  // React resets a <form action={...}> once the action returns, which clears
  // the uncontrolled fields AND the template <select> back to its default. This
  // state does not follow on its own, and the two then disagree: measured after
  // a successful send, the select read "" while the variables panel was still
  // rendered and subject/body were still disabled. The form was left unusable â€”
  // no template visibly chosen, and no way to type a subject either.
  //
  // Resetting alongside the DOM keeps the two descriptions of "which template
  // is selected" as one. It runs for a failed or retrying send as well: those
  // are recorded notifications, the form was reset for them too, and leaving
  // half of it populated would be the same contradiction.
  //
  // Not on "error": a request refused before it reached the service (a missing
  // subject, a template with both forms supplied) is one the operator is about
  // to correct, and clearing their selection would make them start over.
  useEffect(() => {
    if (state.status === "idle" || state.status === "error" || state.status === "denied") return;
    setTemplateName("");
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="recipient_principal_id" className={LABEL}>
            Recipient principal id
          </label>
          <input
            id="recipient_principal_id"
            name="recipient_principal_id"
            required
            placeholder="44444444-4444-4444-4444-444444444444"
            className={`${FIELD} font-mono text-xs`}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="channel" className={LABEL}>
            Channel
          </label>
          <select id="channel" name="channel" defaultValue="EMAIL" className={FIELD}>
            {/* SMS omitted: the service refuses it at the boundary. Offering
                it here would produce a form that submits to a guaranteed 400. */}
            {["EMAIL", "IN_APP", "WEBHOOK"].map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
        </div>

        {/* â”€â”€ Content: a template, or free text â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="sm:col-span-2">
          <label htmlFor="template" className={LABEL}>
            Template <span className={OPTIONAL}>(optional)</span>
          </label>
          <select
            id="template"
            name="template"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className={FIELD}
            disabled={templates.length === 0}
          >
            <option value="">â€” none, write the subject and body below â€”</option>
            {templates.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} â€” {t.subject}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            {templatesError ? (
              <span className="text-amber-600 dark:text-amber-400">
                The template catalogue could not be read ({templatesError}), so only a free-text
                send is available here. This is the catalogue being unreachable, not empty.
              </span>
            ) : selected ? (
              <>
                Renders server-side as HTML with each value escaped for where it lands, and sends
                under its own subject: <strong>{selected.subject}</strong>. The subject and body
                fields are disabled because supplying both forms is refused.
              </>
            ) : (
              <>
                Six transactional templates are compiled into the service. Picking one replaces the
                subject and body below.
              </>
            )}
          </p>
        </div>

        {selected && selected.required_variables.length > 0 && (
          <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
            <p className="mb-3 text-xs font-medium text-slate-700 dark:text-slate-200">
              Variables required by <span className="font-mono">{selected.name}</span>
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {selected.required_variables.map((variable) => (
                <div key={variable}>
                  <label htmlFor={`var_${variable}`} className={LABEL}>
                    {humanise(variable)}
                  </label>
                  <input
                    id={`var_${variable}`}
                    // var_ prefix: the action collects these without needing to
                    // know the catalogue.
                    name={`var_${variable}`}
                    required
                    className={FIELD}
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              All required. The service refuses to render a partial message rather than send one
              with a blank organization name or an empty login link.
            </p>
          </div>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="subject" className={LABEL}>
            Subject {selected && <span className={OPTIONAL}>(provided by the template)</span>}
          </label>
          <input
            id="subject"
            name="subject"
            required={!selected}
            disabled={Boolean(selected)}
            placeholder={selected ? selected.subject : "Payroll cutoff approaching"}
            className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-50`}
            autoComplete="off"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="body" className={LABEL}>
            Body <span className={OPTIONAL}>{selected ? "(provided by the template)" : "(optional)"}</span>
          </label>
          <textarea
            id="body"
            name="body"
            rows={3}
            disabled={Boolean(selected)}
            placeholder={
              selected
                ? "The template renders the body."
                : "Cutoff for the next payroll run is Friday."
            }
            className={`${FIELD} font-mono text-xs disabled:cursor-not-allowed disabled:opacity-50`}
          />
        </div>

        {/* â”€â”€ Delivery â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="sm:col-span-2">
          <label htmlFor="recipient_address" className={LABEL}>
            Recipient address override <span className={OPTIONAL}>(optional)</span>
          </label>
          <input
            id="recipient_address"
            name="recipient_address"
            type="email"
            placeholder="Leave empty â€” the address is resolved from identity-context-svc"
            className={FIELD}
            autoComplete="off"
          />
          <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Normally leave this empty: the address is read from the recipient&rsquo;s principal
            record, which is the authoritative contact fact, and the notification records that it
            came from there. Set it only for someone who is not an established principal yet â€” the
            registration notice that goes to an organization awaiting approval. The stored
            provenance keeps the two distinguishable afterwards.
          </p>
        </div>

        <div>
          <label htmlFor="source_event_type" className={LABEL}>
            Source event type <span className={OPTIONAL}>(optional)</span>
          </label>
          <input
            id="source_event_type"
            name="source_event_type"
            placeholder="PAYROLL_RUN"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="source_reference" className={LABEL}>
            Source reference <span className={OPTIONAL}>(optional)</span>
          </label>
          <input
            id="source_reference"
            name="source_reference"
            placeholder="pr-2026-08"
            className={FIELD}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} size="sm">
          {pending ? "Sendingâ€¦" : "Send notification"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Idempotent on correlation id â€” a retry replays the stored notice, never sends twice
        </p>
      </div>

      <ResultBanner tone={TONE[state.status]} message={state.message}>
        {state.notification && (
          <JsonBlock
            value={{
              notification_id: state.notification.notification_id,
              status: state.notification.status,
              channel: state.notification.channel,
              recipient_principal_id: state.notification.recipient_principal_id,
              // The delivery evidence, shown because it is the answer to
              // "where did this actually go, and who says so".
              ...(state.notification.recipient_address
                ? {
                    recipient_address: state.notification.recipient_address,
                    recipient_address_source: state.notification.recipient_address_source,
                  }
                : {}),
              ...(state.notification.provider_response
                ? { provider_response: state.notification.provider_response }
                : {}),
              ...(state.notification.failure_reason
                ? { failure_reason: state.notification.failure_reason }
                : {}),
              ...(state.notification.next_attempt_at
                ? {
                    delivery_attempts: state.notification.delivery_attempts,
                    next_attempt_at: state.notification.next_attempt_at,
                  }
                : {}),
              correlation_id: state.notification.correlation_id,
              sent_at: state.notification.sent_at ?? null,
            }}
          />
        )}
      </ResultBanner>
    </form>
  );
}
