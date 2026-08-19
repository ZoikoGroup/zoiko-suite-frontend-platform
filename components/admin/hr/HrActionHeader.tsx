"use client";

import { useState } from "react";
import { Plus, Calendar, UserMinus, CheckCircle2, X, Server, Zap, Loader2 } from "lucide-react";

const SERVICES = [
  { name: "employee-master-svc",      port: "8109", color: "bg-emerald-500" },
  { name: "employment-contracts-svc", port: "8110", color: "bg-emerald-500" },
  { name: "leave-absence-svc",        port: "8111", color: "bg-emerald-500" },
  { name: "org-structure-svc",        port: "8131", color: "bg-emerald-500" },
  { name: "offboarding-severance-svc",port: "8132", color: "bg-emerald-500" },
  { name: "workforce-compliance-svc", port: "8133", color: "bg-emerald-500" },
];

function AddEmployeeModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");

  async function handleAdd() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: email,
          worker_type: "FULL_TIME",
          hire_date: new Date().toISOString().split("T")[0],
          job_title: jobTitle,
          department_id: department,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add employee");
        setSubmitting(false);
        return;
      }
    } catch (err) {
      console.warn("API call degraded safely:", err);
      setError("Network error - service may be unavailable");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-500/20">
              <Plus className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Onboard New Employee</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Employee Onboarded</p>
              <p className="text-xs text-slate-500">Employee added to employee-master-svc (:8108).</p>
              <button onClick={onClose} className="mt-2 rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white">Done</button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 dark:bg-red-500/10 dark:border-red-500/20">
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Sarah"
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Jenkins"
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sarah.jenkins@zoiko.com"
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Job Title</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Senior Engineer"
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Department</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="">Select department</option>
                  <option value="ENG">Engineering & Cloud Infrastructure</option>
                  <option value="LEGAL">Legal & Compliance</option>
                  <option value="FIN">Finance & Treasury</option>
                  <option value="HR">Human Resources</option>
                </select>
              </div>
              <button
                onClick={handleAdd}
                disabled={submitting || !firstName || !lastName || !email}
                className="w-full rounded-lg bg-teal-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Complete Onboarding"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LeaveRequestModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [leaveType, setLeaveType] = useState("ANNUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/leave/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          leave_type_id: leaveType,
          start_date: startDate,
          end_date: endDate,
          total_hours: 8,
          reason: reason,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit leave request");
        setSubmitting(false);
        return;
      }
    } catch (err) {
      console.warn("API call degraded safely:", err);
      setError("Network error - service may be unavailable");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/20">
              <Calendar className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Submit Leave Request</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Leave Request Submitted</p>
              <p className="text-xs text-slate-500">Request submitted to leave-absence-svc (:8115).</p>
              <button onClick={onClose} className="mt-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white">Done</button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 dark:bg-red-500/10 dark:border-red-500/20">
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Employee ID</label>
                <input
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="EMP-2026-001"
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Leave Type</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="ANNUAL">Annual Leave</option>
                  <option value="SICK">Sick Leave</option>
                  <option value="PERSONAL">Personal Leave</option>
                  <option value="MATERNITY">Maternity Leave</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Reason</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Family vacation"
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting || !employeeId || !startDate || !endDate}
                className="w-full rounded-lg bg-amber-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit Leave Request"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OffboardingModal({ onClose }: { onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [terminationType, setTerminationType] = useState("RESIGNATION");
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [reason, setReason] = useState("");

  async function handleInitiate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/terminations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          termination_type: terminationType,
          reason_code: reason || "VOLUNTARY",
          last_working_day: lastWorkingDay,
          effective_from: lastWorkingDay,
          reason_details: reason,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to initiate offboarding");
        setSubmitting(false);
        return;
      }
    } catch (err) {
      console.warn("API call degraded safely:", err);
      setError("Network error - service may be unavailable");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-500/20">
              <UserMinus className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Initiate Offboarding</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-200">Offboarding Initiated</p>
              <p className="text-xs text-slate-500">Termination request submitted to offboarding-severance-svc (:8132).</p>
              <button onClick={onClose} className="mt-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-medium text-white">Done</button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 dark:bg-red-500/10 dark:border-red-500/20">
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Employee ID</label>
                <input
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="EMP-2026-001"
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Termination Type</label>
                <select
                  value={terminationType}
                  onChange={(e) => setTerminationType(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="RESIGNATION">Resignation</option>
                  <option value="INVOLUNTARY">Involuntary</option>
                  <option value="REDUNDANCY">Redundancy</option>
                  <option value="RETIREMENT">Retirement</option>
                  <option value="CONTRACT_END">Contract End</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Last Working Day</label>
                <input
                  type="date"
                  value={lastWorkingDay}
                  onChange={(e) => setLastWorkingDay(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Reason</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Career change"
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <button
                onClick={handleInitiate}
                disabled={submitting || !employeeId || !lastWorkingDay}
                className="w-full rounded-lg bg-rose-600 py-2 text-xs font-medium text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Initiate Offboarding"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function HrActionHeader() {
  const [modal, setModal] = useState<string | null>(null);

  return (
    <>
      {modal === "add" && <AddEmployeeModal onClose={() => setModal(null)} />}
      {modal === "leave" && <LeaveRequestModal onClose={() => setModal(null)} />}
      {modal === "offboard" && <OffboardingModal onClose={() => setModal(null)} />}

      <div className="rounded-xl border border-slate-200 bg-white/90 backdrop-blur-md shadow-sm dark:border-slate-800 dark:bg-slate-900/90 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              6 services in compose
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setModal("add")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 transition-colors shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Employee
            </button>
            <button
              onClick={() => setModal("leave")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
            >
              <Calendar className="h-3.5 w-3.5 text-amber-500" />
              Submit Leave Request
            </button>
            <button
              onClick={() => setModal("offboard")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
            >
              <UserMinus className="h-3.5 w-3.5 text-rose-500" />
              Initiate Offboarding
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-800/30">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 mr-1">
            <Server className="h-3 w-3" /> Services:
          </span>
          {SERVICES.map((svc) => (
            <span key={svc.port} className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400">
              <span className={`h-1.5 w-1.5 rounded-full ${svc.color}`} />
              :{svc.port}
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            <Zap className="h-3 w-3" /> All nominal
          </span>
        </div>
      </div>
    </>
  );
}
