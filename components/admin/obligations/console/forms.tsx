import type { ReactNode } from "react";
import { useState, FormEvent } from "react";
import { Button, Input, Textarea, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Label } from "@/components/ui";
import { DetailDrawer } from "@/components/admin/console";
import { raiseObligation, transitionObligation, satisfyClock, waiveClock, notApplicableClock, type ClockState } from "@/lib/api/obligations";
import { explainObligationError } from "@/lib/api/obligations";
import { OBLIGATION_TYPES, SOURCE_TYPES, SEVERITY_LEVELS, RESPONSIBLE_FUNCTIONS } from "@/lib/api/obligations";
import type { Identity } from "@/lib/api/client";
import { evaluateEvidence, type EvaluateEvidenceInput, type EvidenceEvaluationResult, type WriteIdentity } from "@/lib/api/evidence";
import { FilePlus, Clock, ShieldCheck, AlertTriangle, GitBranch, X, Search } from "lucide-react";

interface NewObligationDialogProps {
  legalEntityId: string;
}

export function NewObligationDialog({ legalEntityId }: NewObligationDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    obligationSourceType: "REGULATION",
    obligationSourceId: "",
    obligationCode: "",
    obligationType: "FILING",
    dueDate: "",
    severityLevel: "HIGH",
    responsibleFunction: "Tax",
    sourceReference: "",
    jurisdictionId: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.obligationSourceId || !form.obligationCode || !form.dueDate || !form.sourceReference || !form.jurisdictionId) return;
    setLoading(true);
    setError("");

    const identity: Identity = { principalId: "", tenantId: "" };
    const result = await raiseObligation({
      identity,
      principalId: "",
      legalEntityId,
      jurisdictionId: form.jurisdictionId,
      obligationSourceType: form.obligationSourceType,
      obligationSourceId: form.obligationSourceId,
      obligationCode: form.obligationCode,
      obligationType: form.obligationType,
      dueDate: form.dueDate, // expects RFC3339
      severityLevel: form.severityLevel,
      responsibleFunction: form.responsibleFunction,
      sourceReference: form.sourceReference,
      correlationId: `e2e-create-${Date.now()}`,
    });

    if (result.ok) {
      setOpen(false);
      window.location.reload();
    } else {
      setError(explainObligationError(result.error.message));
    }
    setLoading(false);
  };

  // Convert date input to RFC3339
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    if (date) {
      setForm(prev => ({ ...prev, dueDate: `${date}T00:00:00Z` }));
    }
  };

  return (
    <>
      <Button onClick={() => { setForm({ obligationSourceType: "REGULATION", obligationSourceId: "", obligationCode: "", obligationType: "FILING", dueDate: "", severityLevel: "HIGH", responsibleFunction: "Tax", sourceReference: "", jurisdictionId: "" }); setError(""); setOpen(true); }}>
        New obligation
      </Button>
      {open && (
        <DetailDrawer
          closeHref="#"
          icon={FilePlus}
          title="New Obligation"
          subtitle="Create a new statutory or regulatory obligation"
          actions={<Button onClick={handleSubmit} disabled={loading || !form.obligationCode || !form.dueDate || !form.sourceReference || !form.jurisdictionId}>{loading ? "Creating..." : "Create"}</Button>}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm dark:bg-rose-900/30">{error}</div>}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="obligationSourceType">Source Type</Label>
                <Select value={form.obligationSourceType} onValueChange={(v) => setForm(prev => ({ ...prev, obligationSourceType: v }))}>
                  <SelectTrigger><SelectValue placeholder="Source type" /></SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="obligationSourceId">Source ID *</Label>
                <Input id="obligationSourceId" value={form.obligationSourceId} onChange={(e) => setForm(prev => ({ ...prev, obligationSourceId: e.target.value }))} placeholder="SRC-001" required />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="obligationCode">Obligation Code *</Label>
                <Input id="obligationCode" value={form.obligationCode} onChange={(e) => setForm(prev => ({ ...prev, obligationCode: e.target.value }))} placeholder="VAT-RETURN-Q2" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="obligationType">Type</Label>
                <Select value={form.obligationType} onValueChange={(v) => setForm(prev => ({ ...prev, obligationType: v }))}>
                  <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    {OBLIGATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="jurisdictionId">Jurisdiction ID *</Label>
                <Input id="jurisdictionId" value={form.jurisdictionId} onChange={(e) => setForm(prev => ({ ...prev, jurisdictionId: e.target.value }))} placeholder="00000000-0000-4000-8000-000000000001" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dueDate">Due Date *</Label>
                <Input id="dueDate" type="date" value={form.dueDate?.split("T")[0] || ""} onChange={handleDateChange} required />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="severityLevel">Severity</Label>
                <Select value={form.severityLevel} onValueChange={(v) => setForm(prev => ({ ...prev, severityLevel: v }))}>
                  <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
                  <SelectContent>
                    {SEVERITY_LEVELS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="responsibleFunction">Function</Label>
                <Select value={form.responsibleFunction} onValueChange={(v) => setForm(prev => ({ ...prev, responsibleFunction: v }))}>
                  <SelectTrigger><SelectValue placeholder="Function" /></SelectTrigger>
                  <SelectContent>
                    {RESPONSIBLE_FUNCTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="sourceReference">Source Reference *</Label>
              <Textarea id="sourceReference" value={form.sourceReference} onChange={(e) => setForm(prev => ({ ...prev, sourceReference: e.target.value }))} rows={3} placeholder="e.g. Contract #4821 Clause 12.3" required />
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              All fields are mandatory. Jurisdiction is validated against jurisdiction-rules-svc on the write path.
              CLOSED is terminal — no further transitions are permitted.
            </p>
          </form>
        </DetailDrawer>
      )}
    </>
  );
}

interface CheckApplicabilityDialogProps {
  legalEntityId: string;
}

export function CheckApplicabilityDialog({ legalEntityId }: CheckApplicabilityDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    obligationId: "",
    jurisdictionCode: "",
    entityRef: "",
    actionType: "",
    presentArtifacts: "",
  });
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.obligationId || !form.jurisdictionCode || !form.entityRef || !form.actionType) return;
    setLoading(true);
    setError("");
    setResult(null);

    const identity: WriteIdentity = { principalId: "admin-1", tenantId: "11111111-1111-4111-8111-111111111111" };
    const artifacts = form.presentArtifacts
      ? form.presentArtifacts.split(",").map((s) => s.trim()).filter(Boolean).map((ref) => ({
          evidence_type: "SUPPORTING_DOCUMENT",
          reference_id: ref,
        }))
      : [];

    const evalResult = await evaluateEvidence({
      identity,
      legalEntityId,
      domainCode: form.jurisdictionCode,
      actionType: form.actionType,
      presentArtifacts: artifacts,
      correlationId: `e2e-check-${Date.now()}`,
    });

    if (evalResult.ok) {
      setResult(evalResult.data);
    } else {
      setError(explainObligationError(evalResult.error.message));
    }
    setLoading(false);
  };

  return (
    <>
      <Button variant="ghost" onClick={() => { setForm({ obligationId: "", jurisdictionCode: "", entityRef: "", actionType: "", presentArtifacts: "" }); setError(""); setResult(null); setOpen(true); }}>
        Check applicability
      </Button>
      {open && (
        <DetailDrawer
          closeHref="#"
          icon={Search}
          title="Check Applicability"
          subtitle="Verify if required evidence exists for an obligation/action"
          actions={<Button onClick={handleSubmit} disabled={loading || !form.obligationId || !form.jurisdictionCode || !form.entityRef || !form.actionType}>{loading ? "Checking..." : "Check"}</Button>}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm dark:bg-rose-900/30">{error}</div>}
            {result && (
              <div className="p-3 rounded bg-slate-50 text-sm dark:bg-slate-800/50">
                <p className="font-medium">Outcome: <span className={result.outcome === "SATISFIED" ? "text-green-700" : result.outcome === "MISSING" ? "text-rose-700" : "text-amber-700"}>{result.outcome}</span></p>
                {result.unmet && result.unmet.length > 0 && (
                  <ul className="mt-1 list-disc list-inside text-xs">
                    {result.unmet.map((u: any, i: number) => (
                      <li key={i}>{u.evidence_type}: {u.reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="obligationId">Obligation ID *</Label>
                <Input id="obligationId" value={form.obligationId} onChange={(e) => setForm(prev => ({ ...prev, obligationId: e.target.value }))} placeholder="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="jurisdictionCode">Jurisdiction Code *</Label>
                <Input id="jurisdictionCode" value={form.jurisdictionCode} onChange={(e) => setForm(prev => ({ ...prev, jurisdictionCode: e.target.value }))} placeholder="IN-KA" required />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="entityRef">Entity Ref *</Label>
                <Input id="entityRef" value={form.entityRef} onChange={(e) => setForm(prev => ({ ...prev, entityRef: e.target.value }))} placeholder="LE-001" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="actionType">Action Type *</Label>
                <Input id="actionType" value={form.actionType} onChange={(e) => setForm(prev => ({ ...prev, actionType: e.target.value }))} placeholder="FILING_SUBMIT" required />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="presentArtifacts">Present Artifacts (comma-separated doc IDs)</Label>
              <Input id="presentArtifacts" value={form.presentArtifacts} onChange={(e) => setForm(prev => ({ ...prev, presentArtifacts: e.target.value }))} placeholder="doc-1, doc-2" />
              <p className="text-xs text-slate-500">Optional: document IDs to check as SUPPORTING_DOCUMENT evidence.</p>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Checks whether the required evidence exists for the given obligation/action. Returns SATISFIED, MISSING, or NO_REQUIREMENTS_DEFINED.
            </p>
          </form>
        </DetailDrawer>
      )}
    </>
  );
}

interface SatisfyClockDialogProps {
  obligationId: string;
  clockId: string;
  currentVersion: number;
}

export function SatisfyClockDialog({ obligationId, clockId, currentVersion }: SatisfyClockDialogProps) {
  const [open, setOpen] = useState(false);
  const [evidenceIds, setEvidenceIds] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!evidenceIds.trim()) return;
    setLoading(true);
    setError("");

    const identity: Identity = { principalId: "admin-1", tenantId: "11111111-1111-4111-8111-111111111111" };
    const result = await satisfyClock(
      obligationId,
      clockId,
      evidenceIds.split(",").map((s) => s.trim()).filter(Boolean),
      identity,
      currentVersion,
      `e2e-satisfy-${Date.now()}`,
    );

    if (result.ok) {
      setOpen(false);
      window.location.reload();
    } else {
      setError(explainObligationError(result.error.message));
    }
    setLoading(false);
  };

  return (
    <>
      <Button onClick={() => { setEvidenceIds(""); setError(""); setOpen(true); }}>
        Satisfy clock
      </Button>
      {open && (
        <DetailDrawer
          closeHref="#"
          icon={ShieldCheck}
          title="Satisfy Clock (FULFILLED)"
          subtitle="Mark a deadline clock as satisfied with evidence"
          actions={<Button onClick={handleSubmit} disabled={loading || !evidenceIds.trim()}>{loading ? "Satisfying..." : "Satisfy"}</Button>}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm dark:bg-rose-900/30">{error}</div>}
            <div className="space-y-1">
              <Label htmlFor="evidenceIds">Evidence Evaluation IDs (comma-separated) *</Label>
              <Input id="evidenceIds" value={evidenceIds} onChange={(e) => setEvidenceIds(e.target.value)} placeholder="eval-1, eval-2" required />
              <p className="text-xs text-slate-500">Comma-separated list of evidence evaluation IDs to satisfy this clock.</p>
            </div>
          </form>
        </DetailDrawer>
      )}
    </>
  );
}

interface WaiveClockDialogProps {
  obligationId: string;
  clockId: string;
  currentVersion: number;
}

export function WaiveClockDialog({ obligationId, clockId, currentVersion }: WaiveClockDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [authorityId, setAuthorityId] = useState("");
  const [evidenceIds, setEvidenceIds] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || !authorityId.trim()) return;
    setLoading(true);
    setError("");

    const identity: Identity = { principalId: "admin-1", tenantId: "11111111-1111-4111-8111-111111111111" };
    const result = await waiveClock(
      obligationId,
      clockId,
      reason,
      authorityId,
      identity,
      currentVersion,
      evidenceIds ? evidenceIds.split(",").map((s) => s.trim()).filter(Boolean) : [],
      `e2e-waive-${Date.now()}`,
    );

    if (result.ok) {
      setOpen(false);
      window.location.reload();
    } else {
      setError(explainObligationError(result.error.message));
    }
    setLoading(false);
  };

  return (
    <>
      <Button onClick={() => { setReason(""); setAuthorityId(""); setEvidenceIds(""); setError(""); setOpen(true); }}>
        Waive clock
      </Button>
      {open && (
        <DetailDrawer
          closeHref="#"
          icon={AlertTriangle}
          title="Waive Clock (WAIVED)"
          subtitle="Waive a deadline clock with authority and reason"
          actions={<Button onClick={handleSubmit} disabled={loading || !reason.trim() || !authorityId.trim()}>{loading ? "Waiving..." : "Waive"}</Button>}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm dark:bg-rose-900/30">{error}</div>}
            <div className="space-y-1">
              <Label htmlFor="waiveReason">Reason *</Label>
              <Textarea id="waiveReason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Justification for waiving this clock" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="authorityId">Authority Principal ID *</Label>
              <Input id="authorityId" value={authorityId} onChange={(e) => setAuthorityId(e.target.value)} placeholder="principal-123" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="waiveEvidenceIds">Evidence Evaluation IDs (comma-separated, optional)</Label>
              <Input id="waiveEvidenceIds" value={evidenceIds} onChange={(e) => setEvidenceIds(e.target.value)} placeholder="eval-1, eval-2" />
              <p className="text-xs text-slate-500">Optional: evidence evaluations supporting the waiver.</p>
            </div>
          </form>
        </DetailDrawer>
      )}
    </>
  );
}

interface NotApplicableClockDialogProps {
  obligationId: string;
  clockId: string;
  currentVersion: number;
}

export function NotApplicableClockDialog({ obligationId, clockId, currentVersion }: NotApplicableClockDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [authorityId, setAuthorityId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || !authorityId.trim()) return;
    setLoading(true);
    setError("");

    const identity: Identity = { principalId: "admin-1", tenantId: "11111111-1111-4111-8111-111111111111" };
    const result = await notApplicableClock(
      obligationId,
      clockId,
      reason,
      authorityId,
      identity,
      currentVersion,
      `e2e-na-${Date.now()}`,
    );

    if (result.ok) {
      setOpen(false);
      window.location.reload();
    } else {
      setError(explainObligationError(result.error.message));
    }
    setLoading(false);
  };

  return (
    <>
      <Button onClick={() => { setReason(""); setAuthorityId(""); setError(""); setOpen(true); }}>
        Mark not applicable
      </Button>
      {open && (
        <DetailDrawer
          closeHref="#"
          icon={X}
          title="Mark Not Applicable (NOT_APPLICABLE)"
          subtitle="Mark a deadline clock as not applicable with authority and reason"
          actions={<Button onClick={handleSubmit} disabled={loading || !reason.trim() || !authorityId.trim()}>{loading ? "Marking..." : "Mark Not Applicable"}</Button>}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm dark:bg-rose-900/30">{error}</div>}
            <div className="space-y-1">
              <Label htmlFor="naReason">Reason *</Label>
              <Textarea id="naReason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Justification for marking this clock not applicable" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="naAuthorityId">Authority Principal ID *</Label>
              <Input id="naAuthorityId" value={authorityId} onChange={(e) => setAuthorityId(e.target.value)} placeholder="principal-123" required />
            </div>
          </form>
        </DetailDrawer>
      )}
    </>
  );
}

interface TransitionObligationDialogProps {
  obligationId: string;
  currentStatus: string;
}

export function TransitionObligationDialog({ obligationId, currentStatus }: TransitionObligationDialogProps) {
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const validTransitions: Record<string, string[]> = {
    OPEN: ["IN_PROGRESS", "OVERDUE", "CLOSED"],
    IN_PROGRESS: ["OVERDUE", "CLOSED"],
    OVERDUE: ["CLOSED"],
    CLOSED: [],
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newStatus) return;
    setLoading(true);
    setError("");

    const identity: Identity = { principalId: "admin-1", tenantId: "11111111-1111-4111-8111-111111111111" };
    const result = await transitionObligation({
      obligationId,
      status: newStatus,
      identity,
      correlationId: `e2e-transition-${Date.now()}`,
    });

    if (result.ok) {
      setOpen(false);
      window.location.reload();
    } else {
      setError(explainObligationError(result.error.message));
    }
    setLoading(false);
  };

  const available = validTransitions[currentStatus] || [];

  return (
    <>
      <Button onClick={() => { setNewStatus(""); setError(""); setOpen(true); }}>
        Change status
      </Button>
      {open && (
        <DetailDrawer
          closeHref="#"
          icon={GitBranch}
          title="Transition Obligation"
          subtitle="Change the status of an obligation"
          actions={<Button onClick={handleSubmit} disabled={loading || !newStatus}>{loading ? "Transitioning..." : "Transition"}</Button>}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm dark:bg-rose-900/30">{error}</div>}
            <p className="text-sm text-slate-600 dark:text-slate-400">Current status: <strong>{currentStatus}</strong></p>
            <div className="space-y-1">
              <Label htmlFor="newStatus">New Status *</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v)}>
                <SelectTrigger><SelectValue placeholder="Select new status" /></SelectTrigger>
                <SelectContent>
                  {available.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
              {available.length === 0 && <p className="text-xs text-slate-500">No valid transitions from this status.</p>}
            </div>
          </form>
        </DetailDrawer>
      )}
    </>
  );
}

interface LinkWorkflowDialogProps {
  obligationId: string;
}

export function LinkWorkflowDialog({ obligationId }: LinkWorkflowDialogProps) {
  const [open, setOpen] = useState(false);
  const [workflowId, setWorkflowId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!workflowId.trim()) return;
    setLoading(true);
    setError("");

    // This would need a proper API call to link workflow
    // For now just reload
    setTimeout(() => {
      setOpen(false);
      window.location.reload();
      setLoading(false);
    }, 500);
  };

  return (
    <>
      <Button onClick={() => { setWorkflowId(""); setError(""); setOpen(true); }}>
        Link workflow
      </Button>
      {open && (
        <DetailDrawer
          closeHref="#"
          icon={GitBranch}
          title="Link Workflow"
          subtitle="Associate a workflow instance with this obligation"
          actions={<Button onClick={handleSubmit} disabled={loading || !workflowId.trim()}>{loading ? "Linking..." : "Link"}</Button>}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm dark:bg-rose-900/30">{error}</div>}
            <div className="space-y-1">
              <Label htmlFor="workflowId">Workflow Instance ID *</Label>
              <Input id="workflowId" value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} placeholder="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" required />
            </div>
          </form>
        </DetailDrawer>
      )}
    </>
  );
}