"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { JsonBlock, ResultBanner } from "@/components/admin/shared";
import { FIELD, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { submitNotification } from "@/app/admin/notifications/actions";
import { IDLE_SEND_STATE, type SendNotificationState } from "@/app/admin/notifications/state";

const TONE = {
  sent: "success",
  replayed: "neutral",
  failed: "warning",
  denied: "error",
  error: "error",
  idle: "neutral",
} as const;

export function SendNotificationForm() {
  const [state, action, pending] = useActionState<SendNotificationState, FormData>(
    submitNotification,
    IDLE_SEND_STATE,
  );

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
            {["EMAIL", "SMS", "IN_APP", "WEBHOOK"].map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="subject" className={LABEL}>
            Subject
          </label>
          <input
            id="subject"
            name="subject"
            required
            placeholder="Payroll cutoff approaching"
            className={FIELD}
            autoComplete="off"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="body" className={LABEL}>
            Body <span className={OPTIONAL}>(optional)</span>
          </label>
          <textarea
            id="body"
            name="body"
            rows={3}
            placeholder="Cutoff for the next payroll run is Friday."
            className={`${FIELD} font-mono text-xs`}
          />
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
          {pending ? "Sending…" : "Send notification"}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Idempotent on correlation id — a retry replays the stored notice, never sends twice
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
              ...(state.notification.failure_reason
                ? { failure_reason: state.notification.failure_reason }
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