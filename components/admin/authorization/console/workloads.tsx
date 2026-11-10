import { Server } from "lucide-react";
import { DetailDrawer, DrawerFacts, DrawerNote } from "@/components/admin/console";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AuthzData } from "./data";
import { ActionChips, Chip, Command, Mono, type RegisterSpec } from "./register";

const ACTIVE = { label: "Active", tone: "success" } as const;
const INACTIVE = { label: "Inactive", tone: "neutral" } as const;

export function workloadsRegister(data: AuthzData): RegisterSpec {
  const bindings = data.workloads.rows;
  const byId = new Map(bindings.map((b) => [b.workload_id, b]));

  return {
    noun: "workloads",
    what: "workload bindings",
    idColumn: "Workload",
    columns: [{ label: "Audience" }, { label: "Allowed actions" }, { label: "Since" }, { label: "State" }],
    searchPlaceholder: "Search workload, audience or action",
    empty: "No service identity is bound. Bind one with “Save binding”.",
    error: data.workloads.error,
    filters: [
      {
        name: "state",
        allLabel: "All states",
        options: [
          ["active", "Active"],
          ["inactive", "Inactive"],
        ],
      },
    ],
    rows: bindings.map((b) => ({
      id: b.workload_id,
      idLabel: b.workload_id,
      search: [b.workload_id, b.allowed_audience, ...b.allowed_actions].join(" "),
      facets: { state: b.active_flag ? "active" : "inactive" },
      cells: [
        <Mono key="a">{b.allowed_audience}</Mono>,
        <ActionChips key="l" list={b.allowed_actions} max={3} />,
        <span key="s" className="whitespace-nowrap tabular-nums">{formatDate(b.created_at)}</span>,
        <Chip key="t" {...(b.active_flag ? ACTIVE : INACTIVE)} />,
      ],
    })),
    drawer: (id, links) => {
      const b = byId.get(id);
      if (!b) return null;
      return (
        <DetailDrawer
          heading="Workload details"
          closeHref={links.close}
          icon={Server}
          title={<span className="font-mono text-[13px]">{b.workload_id}</span>}
          subtitle={`Calls ${b.allowed_audience}`}
          status={b.active_flag ? ACTIVE : INACTIVE}
          actions={
            b.active_flag ? (
              <Command command="workload.deactivate" id={id} label="Deactivate" title="Deactivate this binding" reasons="change" version={b.version} tone="danger" />
            ) : (
              <Command command="workload.reactivate" id={id} label="Reactivate" title="Reactivate this binding" reasons="restore" version={b.version} tone="accent" />
            )
          }
        >
          <DrawerFacts
            items={[
              { label: "Workload", value: <Mono>{b.workload_id}</Mono> },
              { label: "Audience", value: <Mono>{b.allowed_audience}</Mono> },
              { label: "Actions", value: `${b.allowed_actions.length}` },
              { label: "Since", value: formatDateTime(b.created_at) },
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-1">
            {b.allowed_actions.map((a) => (
              <code key={a} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {a}
              </code>
            ))}
          </div>
          <DrawerNote>A binding only narrows: this workload can take only the actions listed, whatever its roles say.</DrawerNote>
        </DetailDrawer>
      );
    },
  };
}
