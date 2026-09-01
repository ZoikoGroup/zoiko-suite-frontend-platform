import { Badge } from "@/components/ui";
import { CopyableId } from "@/components/admin/shared";
import { CELL, HEAD } from "@/components/admin/shared/form";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  readNotification,
  type Notification,
} from "@/lib/api/notifications";

const TONE = {
  sent: "success",
  pending: "neutral",
  // Warning, not danger. A scheduled retry has not been given up on — the
  // platform is still actively trying to deliver it — so it must not sit in
  // the register wearing the same colour as a notice that definitively did not
  // go out.
  retrying: "warning",
  failed: "danger",
} as const;

/**
 * Raw delivery records.
 *
 * A FAILED row is not a cosmetic error state — it is recorded proof the notice
 * did not go out. It is now genuinely reachable: a provider refusing the
 * recipient, an address that could not be resolved, or a channel with no
 * provider behind it all produce one.
 *
 * SENT must not be rendered as "received". For IN_APP it does mean delivered —
 * the row is the delivery. For EMAIL it means a provider accepted the message,
 * which ZS-SVC-Y-001 §0.4 requires be reported as acceptance and nothing more.
 */
export function NotificationTable({ notifications }: { notifications: Notification[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] border-collapse text-left">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th scope="col" className={HEAD}>
              Subject
            </th>
            <th scope="col" className={HEAD}>
              Channel
            </th>
            <th scope="col" className={HEAD}>
              Status
            </th>
            <th scope="col" className={HEAD}>
              Recipient
            </th>
            <th scope="col" className={HEAD}>
              Source
            </th>
            <th scope="col" className={HEAD}>
              Recorded
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.map((notification) => {
            const reading = readNotification(notification);

            return (
              <tr
                key={notification.notification_id}
                className="align-top transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <td className={cn(CELL, "max-w-[16rem] font-medium text-slate-900 dark:text-slate-100")}>
                  <span className="break-words">{notification.subject}</span>
                  <p className="mt-0.5">
                    <CopyableId value={notification.notification_id} className="font-normal" />
                  </p>
                </td>
                <td className={CELL}>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-navy-700 dark:bg-slate-800 dark:text-navy-300">
                    {notification.channel}
                  </span>
                </td>
                <td className={CELL}>
                  <Badge tone={TONE[reading]} dot>
                    {/* RETRYING is a reading, not a stored status — the row
                        really is PENDING. Showing the raw status here would
                        put a plain "PENDING" next to an amber badge and a
                        failure reason, which reads as a contradiction. */}
                    {reading === "retrying" ? "RETRYING" : notification.status}
                  </Badge>
                  {reading === "failed" && (
                    <p className="mt-1 max-w-[14rem] text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                      {notification.failure_reason ?? "delivery failed"}
                    </p>
                  )}
                  {reading === "retrying" && (
                    <p className="mt-1 max-w-[14rem] text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                      {/* Deliberately phrased as the LAST attempt, not as the
                          outcome. The notice has not failed; this is why the
                          most recent try did not land. */}
                      Attempt {notification.delivery_attempts ?? 1} failed
                      {notification.failure_reason ? `: ${notification.failure_reason}` : ""}
                      {notification.next_attempt_at && (
                        <span className="mt-0.5 block text-slate-500 dark:text-slate-400">
                          Next attempt {formatDateTime(notification.next_attempt_at)}
                        </span>
                      )}
                    </p>
                  )}

                  {/* Read state, IN_APP only. This service cannot observe
                      whether an email was opened and does not pretend to, so
                      the absence of a marker on an EMAIL row is not "unread" —
                      it is "unknowable", and showing "unread" there would be a
                      claim the platform has no basis for. */}
                  {notification.channel === "IN_APP" && reading === "sent" && (
                    <p className="mt-1 text-[11px] leading-snug">
                      {notification.read_at ? (
                        <span className="text-slate-500 dark:text-slate-400">
                          Read {formatDateTime(notification.read_at)}
                        </span>
                      ) : (
                        <span className="font-medium text-navy-600 dark:text-navy-300">
                          Unread
                        </span>
                      )}
                    </p>
                  )}

                  {/* Acceptance evidence, never a delivery receipt. */}
                  {notification.provider_response && reading === "sent" && (
                    <p
                      className="mt-1 max-w-[14rem] truncate text-[11px] leading-snug text-slate-400 dark:text-slate-500"
                      title={`Provider acceptance evidence — not proof of receipt: ${notification.provider_response}`}
                    >
                      {notification.provider_response}
                    </p>
                  )}
                </td>
                <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                  <CopyableId value={notification.recipient_principal_id} />

                  {/* Where the message actually went, and who vouched for that
                      address. The register named only the principal before, so
                      "which address did we use" — the whole question when
                      someone says they never received a notice — had no answer
                      anywhere in the console. */}
                  {notification.recipient_address ? (
                    <span className="mt-1 block text-[11px] leading-snug">
                      <span className="text-slate-600 dark:text-slate-300">
                        {notification.recipient_address}
                      </span>
                      {notification.recipient_address_source === "REQUEST" && (
                        <span
                          className="ml-1 rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                          title="Supplied by the caller, not read from the identity authority"
                        >
                          caller-supplied
                        </span>
                      )}
                    </span>
                  ) : notification.channel === "IN_APP" ? (
                    <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
                      in-app &mdash; no external address
                    </span>
                  ) : null}
                </td>
                <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                  {notification.source_event_type ? (
                    <>
                      {notification.source_event_type}
                      {notification.source_reference && (
                        <span className="block text-[11px]">{notification.source_reference}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">—</span>
                  )}
                </td>
                <td className={cn(CELL, "whitespace-nowrap text-slate-500 dark:text-slate-400")}>
                  {formatDateTime(notification.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}