import { Badge } from "@/components/ui";
import { CopyableId, DetailList, StoredAs, type Detail } from "@/components/admin/shared";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  describeMeetingStatus,
  describeResolutionCategory,
  explainResolution,
  summariseVotes,
  type BoardMeeting,
  type BoardResolution,
} from "@/lib/api/legal";

/**
 * The two records board-resolutions-svc returns, in plain English.
 *
 * These replace the status codes and the raw counts the board panel and its
 * three forms used to show. Nothing here drops or rewrites a stored value:
 * every field is present, with a label instead of a column name, and the code
 * the service holds stays visible beside the wording that reads it.
 *
 * The order in each is the order the questions get asked in — where does this
 * stand, what does it say, what happens next, then the references needed to
 * carry on — rather than the order the columns are declared in.
 *
 * No "use client": these render from the server-side panel and from the three
 * client forms, and need nothing from either runtime.
 */

/**
 * A vote tally, as a sentence and three figures.
 *
 * Deliberately separate from the resolution's status. The service stores these
 * counts without checking them against a quorum or against each other, and
 * passing a resolution does not require the tally to favour it — so a reader
 * must not come away thinking the numbers carried the decision. That is why the
 * caveat sits under the figures rather than in a comment.
 */
export function VoteTally({
  resolution,
  className,
}: {
  resolution: Pick<BoardResolution, "votes_for" | "votes_against" | "abstentions">;
  className?: string;
}) {
  const votes = summariseVotes(resolution);

  if (!votes.anyRecorded) {
    return (
      <p className={cn("text-sm text-slate-500 dark:text-slate-400", className)}>
        No votes have been recorded against this resolution yet.
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{votes.headline}</p>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {[
          { label: "In favour", value: votes.inFavour },
          { label: "Against", value: votes.against },
          { label: "Abstained", value: votes.abstained },
        ].map((figure) => (
          <div key={figure.label}>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {figure.label}
            </dt>
            <dd className="text-sm tabular-nums text-slate-800 dark:text-slate-200">
              {figure.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">
        These are counts someone entered. Nothing checks them against a quorum or against the
        size of the board, and they do not decide the resolution on their own.
      </p>
    </div>
  );
}

/**
 * One board resolution — where it stands, what it says, and what happens next.
 *
 * "Where it stands" leads, because it is the question a resolution exists to
 * answer and the one the raw status code answers worst: PROPOSED and PASSED look
 * equally settled next to each other in a JSON blob, and only one of them means
 * the board has decided anything.
 */
export function ResolutionSummary({
  resolution,
  /** `compact` drops the audit trail and the wording — used right after a write,
   *  where the reader wants confirmation of what they just did rather than the
   *  full record. */
  variant = "full",
  className,
}: {
  resolution: BoardResolution;
  variant?: "full" | "compact";
  className?: string;
}) {
  const explained = explainResolution(resolution);
  const category = describeResolutionCategory(resolution.category);
  const full = variant === "full";

  const details: Detail[] = [
    {
      label: "What kind of decision this is",
      value: category.label,
      hint: category.meaning,
      wide: true,
    },
    {
      label: "Its number",
      value: resolution.resolution_number || "Not numbered",
      hint: resolution.resolution_number
        ? "How the board refers to this resolution in its minutes"
        : "No number was given when it was proposed, and one cannot be added later",
    },
    {
      label: "Applies from",
      value: formatDate(resolution.effective_from),
      hint: resolution.effective_to
        ? `Until ${formatDate(resolution.effective_to)}`
        : "With no end date set",
    },
  ];

  if (full) {
    details.push(
      {
        label: "Proposed by",
        value: <CopyableId value={resolution.created_by} className="text-sm" />,
        // The single most useful fact about the creator, and it is not
        // discoverable from the record: this person is barred from passing it.
        hint: "This person may not be the one who passes it — that split is enforced by the service",
      },
      {
        label: "Proposed on",
        value: formatDateTime(resolution.created_at),
      },
    );
  }

  if (resolution.meeting_id) {
    details.push({
      label: "Decided at meeting",
      value: <CopyableId value={resolution.meeting_id} className="text-sm" />,
      hint: "The board meeting this resolution belongs to",
    });
  } else if (full) {
    details.push({
      label: "Decided at meeting",
      value: "Not tied to a meeting",
      hint: "Proposed on its own rather than at a sitting of the board",
    });
  }

  if (resolution.passed_at) {
    details.push({
      label: "Passed on",
      value: formatDateTime(resolution.passed_at),
      hint: "Recorded once, when the resolution was closed, and never rewritten",
    });
  }
  if (resolution.passed_by) {
    details.push({
      label: "Passed by",
      value: <CopyableId value={resolution.passed_by} className="text-sm" />,
      hint: "The person who put it into force, which the service records as themselves",
    });
  }

  if (resolution.document_vault_id) {
    details.push({
      label: "Supporting document",
      value: <CopyableId value={resolution.document_vault_id} className="text-sm" />,
      hint: "Filed with the resolution as evidence for the decision",
    });
  }

  details.push({
    label: "Reference for this resolution",
    value: <CopyableId value={resolution.resolution_id} className="text-sm" />,
    hint: "Quote this to find the record again, or to report a problem with it",
  });

  if (full) {
    details.push({
      label: "Which company it applies to",
      value: <CopyableId value={resolution.legal_entity_id} className="text-sm" />,
    });
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={explained.status.tone} dot={explained.status.raw === "PASSED"}>
          {explained.status.label}
        </Badge>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {explained.headline}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {explained.meaning}
      </p>

      {!category.recognised && (
        <p className="text-sm leading-relaxed text-amber-700 dark:text-amber-400">
          {category.meaning}
        </p>
      )}

      <StoredAs code={explained.status.raw} />

      <DetailList items={details} />

      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          How the board voted
        </p>
        <VoteTally resolution={resolution} />
      </div>

      {full && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            What the resolution says
          </p>
          {/* The wording is the record that survives, so it is shown as written
              — line breaks and all — rather than reflowed into a paragraph. */}
          <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            {resolution.content?.trim() || "No wording was recorded."}
          </p>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          What happens next
        </p>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {explained.nextStep}
        </p>
      </div>
    </div>
  );
}

/**
 * One board meeting, in plain English.
 *
 * The load-bearing fact is that scheduling a meeting is the whole of what this
 * service can do with one. There is no way to start, adjourn, or cancel a
 * meeting, and no way to record its minutes — so "Scheduled" is a permanent
 * state rather than a stage, and a reader who treats it as a stage will wait for
 * a transition that cannot arrive.
 */
export function MeetingSummary({
  meeting,
  variant = "full",
  className,
}: {
  meeting: BoardMeeting;
  variant?: "full" | "compact";
  className?: string;
}) {
  const status = describeMeetingStatus(meeting.status);
  const full = variant === "full";

  const details: Detail[] = [
    {
      label: "When it sits",
      value: formatDateTime(meeting.scheduled_at),
      wide: !full,
    },
    {
      label: "Where",
      value: meeting.location || "No location given",
    },
    {
      label: "Applies from",
      value: formatDate(meeting.effective_from),
      hint: meeting.effective_to
        ? `Until ${formatDate(meeting.effective_to)}`
        : "With no end date set",
    },
    {
      label: "Reference for this meeting",
      value: <CopyableId value={meeting.meeting_id} className="text-sm" />,
      hint: "Choose this meeting by name when proposing a resolution; quote the reference to report a problem",
    },
  ];

  if (full) {
    details.push(
      {
        label: "Minutes",
        value: meeting.minutes_summary || "None recorded",
        hint: meeting.minutes_summary
          ? undefined
          : "There is no way to add minutes to a meeting here — the resolutions proposed at it are the record",
        wide: true,
      },
      {
        label: "Scheduled by",
        value: <CopyableId value={meeting.created_by} className="text-sm" />,
      },
      {
        label: "Scheduled on",
        value: formatDateTime(meeting.created_at),
      },
      {
        label: "Which company it applies to",
        value: <CopyableId value={meeting.legal_entity_id} className="text-sm" />,
      },
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{meeting.title}</p>
      </div>

      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{status.meaning}</p>

      <StoredAs code={status.raw} />

      <DetailList items={details} />
    </div>
  );
}
