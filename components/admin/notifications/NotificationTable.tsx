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
  failed: "danger",
} as const;

/**
 * Raw delivery records.
 *
 * A FAILED row is not a cosmetic error state — it is recorded proof the notice
 * did not go out, and the only way today to reach it is an unsupported channel.
 * SENT means "recorded and stub-delivered", which must not be read as "actually
 * received": no provider is wired up on this platform.
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
                    {notification.status}
                  </Badge>
                  {reading === "failed" && (
                    <p className="mt-1 max-w-[14rem] text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                      {notification.failure_reason ?? "delivery failed"}
                    </p>
                  )}
                </td>
                <td className={cn(CELL, "text-slate-500 dark:text-slate-400")}>
                  <CopyableId value={notification.recipient_principal_id} />
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