import { Badge } from "@/components/ui";
import { DetailList, CopyableId, type Detail } from "@/components/admin/shared";
import { formatDateTime } from "@/lib/format";
import type { Archive, ArchiveVerificationRecord } from "@/lib/api/audit-events";

/**
 * One archive, in plain English — the AUD-10 "tamper-evident claim" read back
 * as something a reader can check without decoding hex.
 */
export function ArchiveSummary({ archive }: { archive: Archive }) {
  const details: Detail[] = [
    {
      label: "Sequence range",
      value: `${archive.from_sequence} – ${archive.to_sequence}`,
      hint: `${archive.event_count} events`,
    },
    {
      label: "Sealed",
      value: formatDateTime(archive.created_at),
    },
    {
      label: "Sealed by",
      value: <CopyableId value={archive.created_by_principal_id} className="text-sm" />,
    },
    {
      label: "Archive digest",
      value: <CopyableId value={archive.archive_digest} className="text-sm" />,
      hint: "The single hash this archive's whole range reduces to — re-verifying recomputes and compares this.",
      wide: true,
    },
    {
      label: "First event hash",
      value: <CopyableId value={archive.first_event_hash} className="text-sm" />,
    },
    {
      label: "Last event hash",
      value: <CopyableId value={archive.last_event_hash} className="text-sm" />,
    },
    {
      label: "Archive reference",
      value: <CopyableId value={archive.archive_id} className="text-sm" />,
      hint: "Quote this to re-verify or report a problem with this archive",
      wide: true,
    },
  ];

  return <DetailList items={details} />;
}

const RESULT_TONE = { VERIFIED: "success", DIVERGED: "danger" } as const;

/**
 * Full re-verification history for one archive — every attempt kept, newest
 * first, because the history itself is the evidence: a VERIFIED result today
 * does not retroactively explain a DIVERGED one from last month.
 */
export function ArchiveVerificationHistory({
  verifications,
}: {
  verifications: ArchiveVerificationRecord[];
}) {
  if (verifications.length === 0) {
    return (
      <p className="text-xs italic text-slate-400 dark:text-slate-500">
        This archive has never been re-verified since it was sealed.
      </p>
    );
  }

  const sorted = [...verifications].sort(
    (a, b) => new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime(),
  );

  return (
    <ul className="space-y-2">
      {sorted.map((v) => (
        <li
          key={v.verification_id}
          className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60"
        >
          <div>
            <Badge tone={RESULT_TONE[v.result]} dot={v.result === "VERIFIED"}>
              {v.result === "VERIFIED" ? "Verified" : "Diverged"}
            </Badge>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {formatDateTime(v.verified_at)} by <CopyableId value={v.verified_by_principal_id} />
            </p>
            {v.result === "DIVERGED" && v.first_divergent_sequence !== undefined && (
              <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                First divergence at sequence {v.first_divergent_sequence}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
