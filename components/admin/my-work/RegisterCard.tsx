import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CloudOff, Inbox, Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { PanelEmptyState } from "@/components/admin/shared";
import type { ApiError } from "@/lib/api/client";

export type RegisterRead<T> = { ok: true; data: T[] } | { ok: false; error: ApiError };

export type RegisterColumn<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

/**
 * Why a register could not be read, in words an operator can act on.
 *
 * A refusal and an outage are different answers and must not both read as
 * "nothing here" — an empty table would tell the reader there is no work when
 * the truth is that the console could not look.
 */
export function describeReadError(service: string, error: ApiError): { label: string; hint: string; refused: boolean } {
  if (error.status === 401 || error.status === 403) {
    return {
      label: `${service} refused the read`,
      hint: `Your role is not granted this register (HTTP ${error.status}). ${error.message}`,
      refused: true,
    };
  }
  if (error.kind === "unreachable" || error.kind === "timeout" || (error.status ?? 0) >= 500) {
    return {
      label: `${service} is unavailable`,
      hint: error.status ? `HTTP ${error.status}. ${error.message}` : error.message,
      refused: false,
    };
  }
  return {
    label: `${service} could not be read`,
    hint: error.status ? `HTTP ${error.status}. ${error.message}` : error.message,
    refused: false,
  };
}

/**
 * One register read from one service, rendered as a table — or as the reason it
 * could not be. Server component: the caller passes the result it read with the
 * session's own identity.
 */
export function RegisterCard<T>({
  title,
  description,
  service,
  read,
  columns,
  rowKey,
  emptyLabel,
  emptyHint,
  link,
}: {
  title: string;
  description: string;
  /** The backend service the rows come from, named in failures. */
  service: string;
  read: RegisterRead<T>;
  columns: RegisterColumn<T>[];
  rowKey: (row: T) => string;
  emptyLabel: string;
  emptyHint?: string;
  /** Where the register is worked, e.g. the domain page that owns it. */
  link?: { href: string; label: string };
}) {
  let body: ReactNode;
  if (!read.ok) {
    const why = describeReadError(service, read.error);
    body = <PanelEmptyState icon={why.refused ? Lock : CloudOff} tone="warning" label={why.label} hint={why.hint} />;
  } else if (read.data.length === 0) {
    body = <PanelEmptyState icon={Inbox} label={emptyLabel} hint={emptyHint} />;
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {columns.map((c) => (
                <th key={c.header} scope="col" className={`px-3 py-2 font-medium ${c.className ?? ""}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {read.data.map((row) => (
              <tr key={rowKey(row)} className="text-slate-700 dark:text-slate-300">
                {columns.map((c) => (
                  <td key={c.header} className={`px-3 py-2.5 align-top ${c.className ?? ""}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            {title}
            {read.ok ? (
              <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">({read.data.length})</span>
            ) : null}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {link ? (
          <Link
            href={link.href}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-navy-700 hover:underline dark:text-navy-300"
          >
            {link.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
