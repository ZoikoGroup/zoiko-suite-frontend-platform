"use client";

// The Workflow Builder (v2.0 mock): a route's stages as a flow, the stage list,
// the selected stage's configuration and the route's settings, saved as a new
// versioned definition. Also the Start Workflow form, which shares the stage
// editor for an ad-hoc route.
//
// workflow-svc stores a route as an ordered list of stages, each naming who
// decides: one person, N of a named pool, or anyone holding a role, with an
// optional deadline. It stores no stage names and no routing rules, so the
// builder offers neither — anything it showed would be dropped on save.
// Definitions are immutable once created: "editing" one saves a new version.

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Clock3,
  GripVertical,
  Plus,
  PlayCircle,
  Rocket,
  Save,
  Settings2,
  Trash2,
  UserRound,
  UsersRound,
  Shield,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ResultBanner, type BannerTone } from "@/components/admin/shared/ResultBanner";
import { FIELD, HINT, LABEL, OPTIONAL } from "@/components/admin/shared/form";
import { defineWorkflowAction, startWorkflowAction } from "@/app/admin/workflows/actions";
import { IDLE_DEFINE, IDLE_START, type DefineWorkflowState, type StartWorkflowState } from "@/app/admin/workflows/state";
import type { StageInput } from "@/lib/api/workflow";

export type Person = { id: string; name: string };

type Kind = "SINGLE" | "QUORUM" | "ROLE";

type DraftStage = {
  key: number;
  kind: Kind;
  approver: string;
  pool: string[];
  required: number;
  role: string;
  dueHours: string;
};

const TONE: Record<string, BannerTone> = {
  idle: "neutral",
  defined: "success",
  started: "success",
  replayed: "neutral",
  refused: "warning",
  error: "error",
};

const ROLE_SUGGESTIONS = ["FINANCE_DIRECTOR", "CFO", "CEO", "LEGAL_COUNSEL", "COMPLIANCE_OFFICER", "RISK_OFFICER", "PROCUREMENT_MANAGER", "TAX_OFFICER"];

function fromInput(s: StageInput, key: number): DraftStage {
  const kind: Kind = s.stage_type ?? (s.approver_role ? "ROLE" : s.quorum_approvers?.length ? "QUORUM" : "SINGLE");
  return {
    key,
    kind,
    approver: s.approver_principal_id ?? "",
    pool: s.quorum_approvers ?? [],
    required: s.required_approvals ?? 1,
    role: s.approver_role ?? "",
    dueHours: s.due_at_hours ? String(s.due_at_hours) : "",
  };
}

function blank(key: number): DraftStage {
  return { key, kind: "SINGLE", approver: "", pool: [], required: 1, role: "", dueHours: "" };
}

function serialise(stages: DraftStage[]): string {
  return JSON.stringify(
    stages.map((s) => ({
      stage_type: s.kind,
      approver_principal_id: s.kind === "SINGLE" ? s.approver.trim() : undefined,
      quorum_approvers: s.kind === "QUORUM" ? s.pool : undefined,
      required_approvals: s.kind === "QUORUM" ? s.required : undefined,
      approver_role: s.kind === "ROLE" ? s.role.trim().toUpperCase() : undefined,
      due_at_hours: s.dueHours ? Number(s.dueHours) : undefined,
    })),
  );
}

function humanize(code: string): string {
  const c = code.trim();
  if (!c) return "";
  return c
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w, i) => (i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function stageTitle(s: DraftStage, people: Person[]): string {
  if (s.kind === "ROLE") return s.role ? humanize(s.role) : "Role not set";
  if (s.kind === "QUORUM") return s.pool.length ? `${s.required} of ${s.pool.length} approvers` : "Pool not set";
  const p = people.find((x) => x.id === s.approver);
  return p?.name ?? (s.approver ? `${s.approver.slice(0, 8)}…` : "Approver not set");
}

function stageProblem(s: DraftStage): string | null {
  if (s.kind === "SINGLE" && !s.approver.trim()) return "Choose the approver";
  if (s.kind === "QUORUM" && s.pool.length === 0) return "Add people to the pool";
  if (s.kind === "QUORUM" && (s.required < 1 || s.required > s.pool.length)) return `Needs 1–${s.pool.length || 1} approvals`;
  if (s.kind === "ROLE" && !s.role.trim()) return "Name the role";
  return null;
}

/** Everyone named twice across stages: workflow-svc refuses such a route. */
function duplicates(stages: DraftStage[]): Set<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const s of stages) {
    const people = s.kind === "SINGLE" ? [s.approver] : s.kind === "QUORUM" ? s.pool : [];
    for (const p of people.filter(Boolean)) (seen.has(p) ? dup : seen).add(p);
  }
  return dup;
}

const TILE = [
  "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
  "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
  "border-navy-200 bg-navy-50 text-navy-700 dark:border-navy-500/30 dark:bg-navy-500/10 dark:text-navy-300",
  "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300",
];

function KindIcon({ kind, className }: { kind: Kind; className?: string }) {
  if (kind === "QUORUM") return <UsersRound className={className} />;
  if (kind === "ROLE") return <Shield className={className} />;
  return <UserRound className={className} />;
}

// ── the stage editor, shared by the builder and the start form ──────────────

function PersonSelect({ id, value, onChange, people, exclude = [] }: { id: string; value: string; onChange: (v: string) => void; people: Person[]; exclude?: string[] }) {
  if (people.length === 0) {
    return (
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Principal ID (UUID)" autoComplete="off" className={cn(FIELD, "font-mono text-xs")} />
    );
  }
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={FIELD}>
      <option value="">Choose a person…</option>
      {people
        .filter((p) => p.id === value || !exclude.includes(p.id))
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  );
}

function StageConfig({
  stage,
  index,
  people,
  update,
  taken,
  me,
  isInstance,
}: {
  stage: DraftStage;
  index: number;
  people: Person[];
  update: (patch: Partial<DraftStage>) => void;
  /** People already named in other stages. */
  taken: string[];
  me?: string;
  /** Starting an instance: the initiator may not be named. */
  isInstance?: boolean;
}) {
  const id = `stage-${stage.key}`;
  const exclude = [...taken, ...(isInstance && me ? [me] : [])];
  const kinds: { kind: Kind; title: string; text: string }[] = [
    { kind: "SINGLE", title: "One named approver", text: "A single person decides the stage." },
    { kind: "QUORUM", title: "N of a named group", text: "Any N people from a pool must approve (parallel)." },
    { kind: "ROLE", title: "Anyone holding a role", text: "Whoever holds the role when it is decided." },
  ];
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-navy-950 dark:text-slate-100">Approvers</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {kinds.map((k) => (
            <label
              key={k.kind}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-[12px] transition-colors",
                stage.kind === k.kind ? "border-navy-500 bg-navy-50/60 dark:border-navy-400 dark:bg-navy-500/10" : "border-slate-200 hover:border-slate-300 dark:border-slate-700",
              )}
            >
              <input type="radio" name={`${id}-kind`} checked={stage.kind === k.kind} onChange={() => update({ kind: k.kind })} className="mt-0.5 accent-navy-600" />
              <span>
                <span className="block font-semibold text-navy-950 dark:text-slate-100">{k.title}</span>
                <span className="text-slate-500 dark:text-slate-400">{k.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {stage.kind === "SINGLE" && (
        <div>
          <label htmlFor={`${id}-approver`} className={LABEL}>Approver</label>
          <PersonSelect id={`${id}-approver`} value={stage.approver} onChange={(v) => update({ approver: v })} people={people} exclude={exclude} />
          <p className={HINT}>Must hold WORKFLOW_APPROVE for the entity; workflow-svc checks before anything is written.</p>
        </div>
      )}

      {stage.kind === "QUORUM" && (
        <div className="space-y-3">
          <div>
            <p className={LABEL}>Approver pool</p>
            {people.length ? (
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 scrollbar-thin dark:border-slate-700">
                {people
                  .filter((p) => stage.pool.includes(p.id) || !exclude.includes(p.id))
                  .map((p) => (
                    <label key={p.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-[12.5px] hover:bg-slate-50 dark:hover:bg-slate-800">
                      <input
                        type="checkbox"
                        checked={stage.pool.includes(p.id)}
                        onChange={(e) =>
                          update({ pool: e.target.checked ? [...stage.pool, p.id] : stage.pool.filter((x) => x !== p.id), required: Math.max(1, Math.min(stage.required, e.target.checked ? stage.pool.length + 1 : stage.pool.length - 1)) })
                        }
                        className="accent-navy-600"
                      />
                      {p.name}
                    </label>
                  ))}
              </div>
            ) : (
              <input
                value={stage.pool.join(", ")}
                onChange={(e) => update({ pool: e.target.value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean) })}
                placeholder="Principal IDs, comma-separated"
                className={cn(FIELD, "font-mono text-xs")}
              />
            )}
          </div>
          <div className="max-w-48">
            <label htmlFor={`${id}-required`} className={LABEL}>Approvals needed</label>
            <input
              id={`${id}-required`}
              type="number"
              min={1}
              max={Math.max(1, stage.pool.length)}
              value={stage.required}
              onChange={(e) => update({ required: Number(e.target.value) })}
              className={FIELD}
            />
            <p className={HINT}>of {stage.pool.length} in the pool</p>
          </div>
        </div>
      )}

      {stage.kind === "ROLE" && (
        <div>
          <label htmlFor={`${id}-role`} className={LABEL}>Role</label>
          <input
            id={`${id}-role`}
            list={`${id}-roles`}
            value={stage.role}
            onChange={(e) => update({ role: e.target.value })}
            placeholder="e.g. FINANCE_DIRECTOR"
            autoComplete="off"
            className={cn(FIELD, "uppercase placeholder:normal-case")}
          />
          <datalist id={`${id}-roles`}>
            {ROLE_SUGGESTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <p className={HINT}>The role authorization-svc grants. Whoever holds it when the stage is decided may decide it.</p>
        </div>
      )}

      <div className="max-w-56">
        <label htmlFor={`${id}-due`} className={LABEL}>
          Stage deadline <span className={OPTIONAL}>(hours, optional)</span>
        </label>
        <div className="relative">
          <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id={`${id}-due`}
            type="number"
            min={1}
            value={stage.dueHours}
            onChange={(e) => update({ dueHours: e.target.value })}
            placeholder="e.g. 48"
            className={cn(FIELD, "pl-9")}
          />
        </div>
        <p className={HINT}>Counted from when stage {index + 1} becomes current; when it passes, the workflow escalates.</p>
      </div>
    </div>
  );
}

function useStages(initial: StageInput[] | undefined) {
  const [stages, setStages] = useState<DraftStage[]>(() => (initial?.length ? initial.map(fromInput) : [blank(0)]));
  const [nextKey, setNextKey] = useState(() => Math.max(1, initial?.length ?? 1));
  const [selected, setSelected] = useState(0);
  const update = (key: number, patch: Partial<DraftStage>) => setStages((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const add = () => {
    setStages((all) => [...all, blank(nextKey)]);
    setSelected(stages.length);
    setNextKey((k) => k + 1);
  };
  const remove = (key: number) => {
    setStages((all) => all.filter((s) => s.key !== key));
    setSelected((i) => Math.max(0, Math.min(i, stages.length - 2)));
  };
  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= stages.length) return;
    setStages((all) => {
      const copy = [...all];
      [copy[index], copy[to]] = [copy[to], copy[index]];
      return copy;
    });
    setSelected(to);
  };
  return { stages, selected: Math.min(selected, stages.length - 1), setSelected, update, add, remove, move };
}

// ── the builder ──────────────────────────────────────────────────────────────

export type BuilderSeed = {
  name: string;
  workflowType: string;
  description: string;
  version: number;
  stages?: StageInput[];
  basedOn?: { label: string; status: string };
};

export function DefinitionBuilder({
  seed,
  people,
  nextVersions,
  libraryHref,
}: {
  seed: BuilderSeed;
  people: Person[];
  /** The next free version per workflow type, so a new draft does not collide. */
  nextVersions: Record<string, number>;
  libraryHref: string;
}) {
  const [state, save, saving] = useActionState<DefineWorkflowState, FormData>(defineWorkflowAction, IDLE_DEFINE);
  const { stages, selected, setSelected, update, add, remove, move } = useStages(seed.stages);
  const [name, setName] = useState(seed.name);
  const [type, setType] = useState(seed.workflowType);
  const [description, setDescription] = useState(seed.description);
  const [version, setVersion] = useState(String(seed.version));
  const typeCode = type.trim().toUpperCase().replace(/\s+/g, "_");
  const suggested = nextVersions[typeCode] ?? 1;
  const dup = useMemo(() => duplicates(stages), [stages]);
  const current = stages[selected];
  const problems = stages.map(stageProblem);
  const ready = typeCode && stages.length > 0 && problems.every((p) => !p) && dup.size === 0;
  const saved = state.status === "defined" ? state.definition : null;

  return (
    <form action={save} className="space-y-4" data-testid="workflow-builder">
      <input type="hidden" name="stages" value={serialise(stages)} />
      <input type="hidden" name="workflow_type" value={typeCode} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="version" value={version} />

      <Card className="flex flex-wrap items-center gap-4 p-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-50 text-navy-700 dark:bg-navy-500/15 dark:text-navy-200">
          <UsersRound className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[20px] font-bold text-navy-950 dark:text-slate-100">{name || "Untitled workflow"}</p>
            <Badge tone="warning">Draft</Badge>
            {seed.basedOn && <span className="text-[12px] text-slate-500">based on {seed.basedOn.label}</span>}
          </div>
          <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">{description || "Describe what this route approves."}</p>
        </div>
        <Link href={libraryHref} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">
          <Settings2 className="h-4 w-4" />
          Workflow Library
        </Link>
      </Card>

      {/* The route as a flow: Start → stages → Complete. */}
      <Card className="overflow-x-auto p-4 scrollbar-thin">
        <ol className="flex min-w-max items-center gap-2">
          <li className="flex h-20 w-28 flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            <PlayCircle className="h-6 w-6" />
            <span className="mt-1 text-[13px] font-bold">Start</span>
            <span className="text-[11px]">Request</span>
          </li>
          {stages.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-slate-400" />
              <button
                type="button"
                onClick={() => setSelected(i)}
                className={cn(
                  "relative flex h-20 w-40 flex-col items-center justify-center rounded-xl border px-2 text-center transition-shadow",
                  TILE[i % TILE.length],
                  i === selected && "ring-2 ring-navy-500 ring-offset-2 dark:ring-offset-slate-900",
                )}
              >
                {!problems[i] && <CheckCircle2 className="absolute right-1.5 top-1.5 h-4 w-4 text-emerald-600" />}
                <KindIcon kind={s.kind} className="h-5 w-5" />
                <span className="mt-1 line-clamp-2 text-[12.5px] font-bold leading-tight">
                  {i + 1}. {stageTitle(s, people)}
                </span>
              </button>
            </li>
          ))}
          <li className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-slate-400" />
            <span className="flex h-20 w-28 flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="h-6 w-6" />
              <span className="mt-1 text-[13px] font-bold">Complete</span>
            </span>
          </li>
        </ol>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,0.8fr)]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[16px] font-bold text-navy-950 dark:text-slate-100">Workflow Stages ({stages.length})</h3>
            <button type="button" onClick={add} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-[12.5px] font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">
              <Plus className="h-4 w-4" />
              Add Stage
            </button>
          </div>
          <ol className="space-y-2">
            {stages.map((s, i) => (
              <li
                key={s.key}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2.5",
                  i === selected ? "border-navy-500 bg-navy-50/50 dark:border-navy-400 dark:bg-navy-500/10" : "border-slate-200 dark:border-slate-700",
                )}
              >
                <GripVertical className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                <button type="button" onClick={() => setSelected(i)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-[14px] font-bold text-navy-700 dark:bg-navy-500/15 dark:text-navy-200">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-navy-950 dark:text-slate-100">{stageTitle(s, people)}</span>
                    <span className={cn("block truncate text-[11.5px]", problems[i] ? "text-amber-700 dark:text-amber-300" : "text-slate-500")}>
                      {problems[i] ?? (s.kind === "SINGLE" ? "One approver" : s.kind === "QUORUM" ? "Quorum" : "Role")}
                      {!problems[i] && s.dueHours ? ` · ${s.dueHours}h deadline` : ""}
                    </span>
                  </span>
                </button>
                <span className="flex shrink-0 items-center">
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-slate-400 hover:text-navy-700 disabled:opacity-30">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label="Move down" disabled={i === stages.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-slate-400 hover:text-navy-700 disabled:opacity-30">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label="Remove stage" disabled={stages.length === 1} onClick={() => remove(s.key)} className="rounded p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          {dup.size > 0 && (
            <p className="mt-3 text-[12px] text-amber-700 dark:text-amber-300">The same person is named in two stages. Nobody decides two stages of one workflow.</p>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-[16px] font-bold text-navy-950 dark:text-slate-100">
            Stage {selected + 1}: {current ? stageTitle(current, people) : ""} — Configuration
          </h3>
          {current && (
            <StageConfig
              stage={current}
              index={selected}
              people={people}
              update={(patch) => update(current.key, patch)}
              taken={stages.filter((s) => s.key !== current.key).flatMap((s) => (s.kind === "SINGLE" ? [s.approver] : s.kind === "QUORUM" ? s.pool : []))}
            />
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <h3 className="flex items-center gap-2 text-[16px] font-bold text-navy-950 dark:text-slate-100">
            <Settings2 className="h-4 w-4" />
            Workflow Settings
          </h3>
          <div>
            <label htmlFor="wb-name" className={LABEL}>Workflow Name</label>
            <input id="wb-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={FIELD} placeholder="e.g. Third Party Onboarding" />
          </div>
          <div>
            <label htmlFor="wb-type" className={LABEL}>Workflow Type *</label>
            <input
              id="wb-type"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                const code = e.target.value.trim().toUpperCase().replace(/\s+/g, "_");
                setVersion(String(nextVersions[code] ?? 1));
              }}
              placeholder="e.g. VENDOR_ONBOARDING"
              className={cn(FIELD, "uppercase placeholder:normal-case")}
            />
            <p className={HINT}>The code services start workflows with. A workflow started with a definition must use the same type.</p>
          </div>
          <div>
            <label htmlFor="wb-version" className={LABEL}>Version</label>
            <input id="wb-version" type="number" min={1} value={version} onChange={(e) => setVersion(e.target.value)} className={FIELD} />
            {Number(version) !== suggested && <p className={HINT}>The next free version of {typeCode || "this type"} is {suggested}.</p>}
          </div>
          <div>
            <label htmlFor="wb-desc" className={LABEL}>Description <span className={OPTIONAL}>(optional)</span></label>
            <textarea id="wb-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} className={FIELD} />
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
            <p className="font-semibold text-navy-950 dark:text-slate-100">Publishing</p>
            Saved routes start as drafts. Validation is approved by someone other than the author (maker–checker), then the route is submitted and
            published from the Workflow Library. Running workflows keep the version they started with.
          </div>
        </Card>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-[13px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Version: v{version || "?"} (Draft)
        </span>
        <span className="text-[12.5px] text-slate-500 dark:text-slate-400">
          {stages.length} stage{stages.length === 1 ? "" : "s"} · {ready ? "ready to save" : "complete every stage to save"}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Button type="submit" variant="secondary" disabled={!ready || saving} loading={saving}>
            <Save className="h-4 w-4" />
            Save as Draft
          </Button>
          <Button type="submit" name="then" value="validate" variant="accent" disabled={!ready || saving}>
            <Rocket className="h-4 w-4" />
            Save &amp; Send for Validation
          </Button>
        </span>
      </Card>

      <ResultBanner tone={TONE[state.status] ?? "neutral"} message={"message" in state ? state.message : undefined} testId="workflow-builder-result">
        {saved && (
          <p className="text-[12.5px]">
            <Link href={`${libraryHref}&def=${saved.workflow_definition_id}`} className="font-semibold underline">
              Open v{saved.version} in the Workflow Library
            </Link>
          </p>
        )}
      </ResultBanner>
    </form>
  );
}

// ── start a workflow ─────────────────────────────────────────────────────────

export type RouteOption = { id: string; label: string; workflowType: string; stages: number };

export function StartWorkflowForm({
  routes,
  entities,
  defaultEntity,
  people,
  me,
  idempotencyKey,
  initialRoute,
  resolves,
  initialType,
}: {
  initialRoute?: string;
  /** The governance decision this approval resolves, from a "Start the
   *  approval" link (an escalated policy evaluation). */
  resolves?: string;
  /** A workflow type to start ad hoc with, from the same link. */
  initialType?: string;
  routes: RouteOption[];
  entities: { id: string; name: string }[];
  defaultEntity: string;
  people: Person[];
  me: string;
  idempotencyKey: string;
}) {
  const [state, start, starting] = useActionState<StartWorkflowState, FormData>(startWorkflowAction, IDLE_START);
  const [routeId, setRouteId] = useState(
    initialRoute && routes.some((r) => r.id === initialRoute) ? initialRoute : initialType ? "" : (routes[0]?.id ?? ""),
  );
  const route = routes.find((r) => r.id === routeId);
  const [type, setType] = useState(route?.workflowType ?? initialType ?? "");
  const { stages, selected, setSelected, update, add, remove } = useStages(undefined);
  const adhoc = routeId === "";
  const current = stages[selected];
  const started = "workflow" in state ? state.workflow : null;

  return (
    <form action={start} className="space-y-4" data-testid="workflow-start">
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      {adhoc && <input type="hidden" name="stages" value={serialise(stages)} />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h3 className="text-[16px] font-bold text-navy-950 dark:text-slate-100">What needs approving</h3>
          <div>
            <label htmlFor="sw-route" className={LABEL}>Route</label>
            <select
              id="sw-route"
              name="workflow_definition_id"
              value={routeId}
              onChange={(e) => {
                setRouteId(e.target.value);
                const r = routes.find((x) => x.id === e.target.value);
                if (r) setType(r.workflowType);
              }}
              className={FIELD}
            >
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} · {r.stages} stage{r.stages === 1 ? "" : "s"}
                </option>
              ))}
              <option value="">Define the stages here (ad hoc)</option>
            </select>
            <p className={HINT}>{routes.length ? "Published routes fix who decides each stage." : "No published route yet: define the stages below, or publish one in the Workflow Library."}</p>
          </div>
          <div>
            <label htmlFor="sw-type" className={LABEL}>Workflow Type</label>
            <input
              id="sw-type"
              name="workflow_type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              readOnly={!adhoc}
              required
              placeholder="e.g. VENDOR_ONBOARDING"
              className={cn(FIELD, "uppercase placeholder:normal-case", !adhoc && "bg-slate-50 dark:bg-slate-800")}
            />
          </div>
          <div>
            <label htmlFor="sw-entity" className={LABEL}>Legal entity</label>
            {entities.length ? (
              <select id="sw-entity" name="legal_entity_id" defaultValue={defaultEntity} className={FIELD}>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            ) : (
              <input id="sw-entity" name="legal_entity_id" defaultValue={defaultEntity} className={cn(FIELD, "font-mono text-xs")} />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sw-stype" className={LABEL}>Subject type <span className={OPTIONAL}>(optional)</span></label>
              <input id="sw-stype" name="subject_type" placeholder="e.g. VENDOR" className={cn(FIELD, "uppercase placeholder:normal-case")} />
            </div>
            <div>
              <label htmlFor="sw-sid" className={LABEL}>Subject ID</label>
              <input id="sw-sid" name="subject_id" autoComplete="off" className={cn(FIELD, "font-mono text-xs")} />
            </div>
          </div>
          <div>
            <label htmlFor="sw-esc" className={LABEL}>Escalate to <span className={OPTIONAL}>(optional)</span></label>
            {people.length ? (
              <select id="sw-esc" name="escalation_target" defaultValue="" className={FIELD}>
                <option value="">Nobody named</option>
                {people
                  .filter((p) => p.id !== me)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            ) : (
              <input id="sw-esc" name="escalation_target" placeholder="Principal ID (UUID)" autoComplete="off" className={cn(FIELD, "font-mono text-xs")} />
            )}
            <p className={HINT}>Who a stage goes to when its deadline passes. Not you.</p>
          </div>
          <div>
            <label htmlFor="sw-cause" className={LABEL}>Resolves governance decision <span className={OPTIONAL}>(optional)</span></label>
            <input
              id="sw-cause"
              name="causation_id"
              defaultValue={resolves ?? ""}
              autoComplete="off"
              placeholder="Decision ID from the Governance Log"
              className={cn(FIELD, "font-mono text-xs")}
            />
            <p className={HINT}>
              The escalated decision this approval settles. Its approval is recorded in the Governance Log against that decision.
            </p>
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          {adhoc ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-bold text-navy-950 dark:text-slate-100">Stages ({stages.length})</h3>
                <button type="button" onClick={add} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-[12.5px] font-medium text-navy-900 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">
                  <Plus className="h-4 w-4" />
                  Add Stage
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {stages.map((s, i) => (
                  <span key={s.key} className="inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => setSelected(i)}
                      className={cn("rounded-l-lg border px-2.5 py-1 text-[12px] font-semibold", i === selected ? "border-navy-500 bg-navy-50 text-navy-800 dark:bg-navy-500/15 dark:text-navy-200" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300")}
                    >
                      {i + 1}. {stageTitle(s, people)}
                    </button>
                    <button type="button" aria-label="Remove stage" disabled={stages.length === 1} onClick={() => remove(s.key)} className="rounded-r-lg border border-l-0 border-slate-200 px-1.5 py-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 dark:border-slate-700">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              {current && (
                <StageConfig
                  stage={current}
                  index={selected}
                  people={people}
                  update={(patch) => update(current.key, patch)}
                  taken={stages.filter((s) => s.key !== current.key).flatMap((s) => (s.kind === "SINGLE" ? [s.approver] : s.kind === "QUORUM" ? s.pool : []))}
                  me={me}
                  isInstance
                />
              )}
            </>
          ) : (
            <>
              <h3 className="text-[16px] font-bold text-navy-950 dark:text-slate-100">Route</h3>
              <p className="text-[13px] text-slate-600 dark:text-slate-300">
                {route ? `${route.label} decides this in ${route.stages} stage${route.stages === 1 ? "" : "s"}.` : ""} The route&rsquo;s approvers are fixed by the
                definition; you cannot be one of them, and nobody decides two stages.
              </p>
            </>
          )}
        </Card>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <p className="text-[12.5px] text-slate-500 dark:text-slate-400">Every named approver is checked for WORKFLOW_APPROVE before anything is written.</p>
        <Button type="submit" variant="accent" loading={starting} className="ml-auto">
          <Rocket className="h-4 w-4" />
          {starting ? "Starting…" : "Start Workflow"}
        </Button>
      </Card>

      <ResultBanner tone={TONE[state.status] ?? "neutral"} message={"message" in state ? state.message : undefined} testId="workflow-start-result">
        {started && (
          <p className="text-[12.5px]">
            <Link href={`/admin/workflows/${started.workflow_instance_id}`} className="font-semibold underline">
              Open the workflow
            </Link>
          </p>
        )}
      </ResultBanner>
    </form>
  );
}
