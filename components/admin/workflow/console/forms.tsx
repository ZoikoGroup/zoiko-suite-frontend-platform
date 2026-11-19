import type { ReactNode } from "react";
import { useState, FormEvent } from "react";
import { Button, Input, Textarea, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Label } from "@/components/ui";
import { DetailDrawer } from "@/components/admin/console";
import { createWorkflow, createWorkflowDefinition } from "@/lib/api/workflow";
import { explainWorkflowError } from "@/lib/api/workflow";
import { WORKFLOW_TYPES, STAGE_TYPES } from "./constants";
import type { StageInput, Caller } from "@/lib/api/workflow";
import type { Identity } from "@/lib/api/client";
import { decodeDefinitionStages, describeStage } from "@/lib/api/workflow";

interface StartWorkflowDialogProps {
  legalEntityId: string;
}

export function StartWorkflowDialog({ legalEntityId }: StartWorkflowDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    workflowType: "PURCHASE_APPROVAL",
    subjectType: "",
    subjectId: "",
    escalationTarget: "",
    workflowDefinitionId: "",
    useDefinition: false,
    stages: [] as StageInput[],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const identity: Caller = { principalId: "", tenantId: "", legalEntityId };
    const result = await createWorkflow({
      identity,
      legalEntityId,
      workflowType: form.workflowType,
      subjectType: form.subjectType || undefined,
      subjectId: form.subjectId || undefined,
      escalationTarget: form.escalationTarget || undefined,
      workflowDefinitionId: form.useDefinition ? form.workflowDefinitionId : undefined,
      stages: form.useDefinition ? undefined : form.stages,
      idempotencyKey: `e2e-start-${Date.now()}`,
    });

    if (result.ok) {
      setOpen(false);
      window.location.reload();
    } else {
      setError(explainWorkflowError(result.error.message));
    }
    setLoading(false);
  };

  const addStage = () => {
    setForm(prev => ({
      ...prev,
      stages: [...prev.stages, { stage_type: "SINGLE" }],
    }));
  };

  const updateStage = (index: number, field: keyof StageInput, value: any) => {
    setForm(prev => {
      const newStages = [...prev.stages];
      newStages[index] = { ...newStages[index], [field]: value };
      return { ...prev, stages: newStages };
    });
  };

  const removeStage = (index: number) => {
    setForm(prev => ({
      ...prev,
      stages: prev.stages.filter((_, i) => i !== index),
    }));
  };

  return (
    <>
      <Button onClick={() => { setForm({ workflowType: "PURCHASE_APPROVAL", subjectType: "", subjectId: "", escalationTarget: "", workflowDefinitionId: "", useDefinition: false, stages: [] }); setError(""); setOpen(true); }}>
        Start workflow
      </Button>
      {open && (
        <DetailDrawer
          heading="Start Workflow"
          onClose={() => setOpen(false)}
          actions={<Button onClick={handleSubmit} disabled={loading || form.stages.length === 0}>{loading ? "Starting..." : "Start"}</Button>}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm dark:bg-rose-900/30">{error}</div>}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="workflowType">Workflow Type *</Label>
                <Select value={form.workflowType} onValueChange={(v) => setForm(prev => ({ ...prev, workflowType: v }))}>
                  <SelectTrigger><SelectValue placeholder="Workflow type" /></SelectTrigger>
                  <SelectContent>
                    {WORKFLOW_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="subjectType">Subject Type</Label>
                <Input id="subjectType" value={form.subjectType} onChange={(e) => setForm(prev => ({ ...prev, subjectType: e.target.value }))} placeholder="e.g. INVOICE" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="subjectId">Subject ID</Label>
                <Input id="subjectId" value={form.subjectId} onChange={(e) => setForm(prev => ({ ...prev, subjectId: e.target.value }))} placeholder="e.g. INV-2024-001" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="escalationTarget">Escalation Target</Label>
                <Input id="escalationTarget" value={form.escalationTarget} onChange={(e) => setForm(prev => ({ ...prev, escalationTarget: e.target.value }))} placeholder="principal-id" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Use Workflow Definition?</Label>
              <Select
                value={form.useDefinition ? "true" : "false"}
                onValueChange={(v) => setForm(prev => ({ ...prev, useDefinition: v === "true" }))}
              >
                <SelectTrigger><SelectValue placeholder="Select option" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No, define stages inline</SelectItem>
                  <SelectItem value="true">Yes, pick a definition</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.useDefinition ? (
              <div className="space-y-1">
                <Label htmlFor="workflowDefinitionId">Workflow Definition ID *</Label>
                <Input id="workflowDefinitionId" value={form.workflowDefinitionId} onChange={(e) => setForm(prev => ({ ...prev, workflowDefinitionId: e.target.value }))} placeholder="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" required />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Stages (at least one required)</h4>
                  <Button type="button" variant="outline" size="sm" onClick={addStage}>+ Add Stage</Button>
                </div>
                {form.stages.map((stage, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-3 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Stage {index + 1}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeStage(index)}>Remove</Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`stageType-${index}`}>Stage Type *</Label>
                        <Select value={stage.stage_type} onValueChange={(v) => updateStage(index, "stage_type", v)}>
                          <SelectTrigger><SelectValue placeholder="Stage type" /></SelectTrigger>
                          <SelectContent>
                            {STAGE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      {stage.stage_type === "SINGLE" && (
                        <div className="space-y-1">
                          <Label htmlFor={`approver-${index}`}>Approver Principal ID *</Label>
                          <Input id={`approver-${index}`} value={stage.approver_principal_id || ""} onChange={(e) => updateStage(index, "approver_principal_id", e.target.value)} placeholder="principal-id" required />
                        </div>
                      )}
                      {stage.stage_type === "QUORUM" && (
                        <>
                          <div className="space-y-1">
                            <Label htmlFor={`quorumApprovers-${index}`}>Quorum Approvers (comma-separated) *</Label>
                            <Input id={`quorumApprovers-${index}`} value={stage.quorum_approvers?.join(", ") || ""} onChange={(e) => updateStage(index, "quorum_approvers", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} placeholder="approver-1, approver-2" required />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`requiredApprovals-${index}`}>Required Approvals *</Label>
                            <Input id={`requiredApprovals-${index}`} type="number" min="1" value={stage.required_approvals || 1} onChange={(e) => updateStage(index, "required_approvals", parseInt(e.target.value) || 1)} required />
                          </div>
                        </>
                      )}
                      {stage.stage_type === "ROLE" && (
                        <div className="space-y-1">
                          <Label htmlFor={`approverRole-${index}`}>Approver Role *</Label>
                          <Input id={`approverRole-${index}`} value={stage.approver_role || ""} onChange={(e) => updateStage(index, "approver_role", e.target.value)} placeholder="e.g. FINANCE_MANAGER" required />
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label htmlFor={`dueAtHours-${index}`}>Due In (hours)</Label>
                        <Input id={`dueAtHours-${index}`} type="number" min="1" value={stage.due_at_hours || ""} onChange={(e) => updateStage(index, "due_at_hours", e.target.value ? parseInt(e.target.value) : undefined)} placeholder="e.g. 48" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-500 dark:text-slate-400">
              The initiator never decides. Nobody decides two stages. A service account never decides.
              All decisions checked against authorization-svc with workflow_type, approver_role, stage_order.
            </p>
          </form>
        </DetailDrawer>
      )}
    </>
  );
}

interface DefineWorkflowDialogProps {
  legalEntityId: string;
}

export function DefineWorkflowDialog({ legalEntityId }: DefineWorkflowDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    workflowType: "PURCHASE_APPROVAL",
    version: 1,
    name: "",
    description: "",
    stages: [] as StageInput[],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.stages.length === 0) return;
    setLoading(true);
    setError("");

    const identity: Caller = { principalId: "", tenantId: "", legalEntityId };
    const result = await createWorkflowDefinition({
      identity,
      workflowType: form.workflowType,
      version: form.version,
      name: form.name || undefined,
      description: form.description || undefined,
      stages: form.stages,
    });

    if (result.ok) {
      setOpen(false);
      window.location.reload();
    } else {
      setError(explainWorkflowError(result.error.message));
    }
    setLoading(false);
  };

  const addStage = () => {
    setForm(prev => ({
      ...prev,
      stages: [...prev.stages, { stage_type: "SINGLE" }],
    }));
  };

  const updateStage = (index: number, field: keyof StageInput, value: any) => {
    setForm(prev => {
      const newStages = [...prev.stages];
      newStages[index] = { ...newStages[index], [field]: value };
      return { ...prev, stages: newStages };
    });
  };

  const removeStage = (index: number) => {
    setForm(prev => ({
      ...prev,
      stages: prev.stages.filter((_, i) => i !== index),
    }));
  };

  return (
    <>
      <Button variant="outline" onClick={() => { setForm({ workflowType: "PURCHASE_APPROVAL", version: 1, name: "", description: "", stages: [] }); setError(""); setOpen(true); }}>
        New definition
      </Button>
      {open && (
        <DetailDrawer
          heading="Register Workflow Definition"
          onClose={() => setOpen(false)}
          actions={<Button onClick={handleSubmit} disabled={loading || form.stages.length === 0}>{loading ? "Registering..." : "Register"}</Button>}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm dark:bg-rose-900/30">{error}</div>}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="workflowType">Workflow Type *</Label>
                <Select value={form.workflowType} onValueChange={(v) => setForm(prev => ({ ...prev, workflowType: v }))}>
                  <SelectTrigger><SelectValue placeholder="Workflow type" /></SelectTrigger>
                  <SelectContent>
                    {WORKFLOW_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="version">Version *</Label>
                <Input id="version" type="number" min="1" value={form.version} onChange={(e) => setForm(prev => ({ ...prev, version: parseInt(e.target.value) || 1 }))} required />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Standard Purchase Approval" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} rows={2} placeholder="What this approval route is for" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Stages (at least one required)</h4>
                <Button type="button" variant="outline" size="sm" onClick={addStage}>+ Add Stage</Button>
              </div>
              {form.stages.map((stage, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Stage {index + 1}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeStage(index)}>Remove</Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`defStageType-${index}`}>Stage Type *</Label>
                      <Select value={stage.stage_type} onValueChange={(v) => updateStage(index, "stage_type", v)}>
                        <SelectTrigger><SelectValue placeholder="Stage type" /></SelectTrigger>
                        <SelectContent>
                          {STAGE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {stage.stage_type === "SINGLE" && (
                      <div className="space-y-1">
                        <Label htmlFor={`defApprover-${index}`}>Approver Principal ID</Label>
                        <Input id={`defApprover-${index}`} value={stage.approver_principal_id || ""} onChange={(e) => updateStage(index, "approver_principal_id", e.target.value)} placeholder="Leave blank for role-based" />
                      </div>
                    )}
                    {stage.stage_type === "QUORUM" && (
                      <>
                        <div className="space-y-1">
                          <Label htmlFor={`defQuorumApprovers-${index}`}>Quorum Approvers (comma-separated) *</Label>
                          <Input id={`defQuorumApprovers-${index}`} value={stage.quorum_approvers?.join(", ") || ""} onChange={(e) => updateStage(index, "quorum_approvers", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} placeholder="approver-1, approver-2" required />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`defRequiredApprovals-${index}`}>Required Approvals *</Label>
                          <Input id={`defRequiredApprovals-${index}`} type="number" min="1" value={stage.required_approvals || 1} onChange={(e) => updateStage(index, "required_approvals", parseInt(e.target.value) || 1)} required />
                        </div>
                      </>
                    )}
                    {stage.stage_type === "ROLE" && (
                      <div className="space-y-1">
                        <Label htmlFor={`defApproverRole-${index}`}>Approver Role *</Label>
                        <Input id={`defApproverRole-${index}`} value={stage.approver_role || ""} onChange={(e) => updateStage(index, "approver_role", e.target.value)} placeholder="e.g. FINANCE_MANAGER" required />
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label htmlFor={`defDueAtHours-${index}`}>Due In (hours)</Label>
                      <Input id={`defDueAtHours-${index}`} type="number" min="1" value={stage.due_at_hours || ""} onChange={(e) => updateStage(index, "due_at_hours", e.target.value ? parseInt(e.target.value) : undefined)} placeholder="e.g. 48" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              A definition is active the moment it is created. A running workflow keeps the route it started with.
              Changing a definition never changes a decision already in progress.
            </p>
          </form>
        </DetailDrawer>
      )}
    </>
  );
}