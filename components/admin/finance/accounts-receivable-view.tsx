"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import {
  listInvoices,
  createInvoice,
  transitionInvoice,
  CustomerInvoice,
  InvoiceStatus,
} from "@/lib/services/accounts-receivable";
import { checkServiceHealth } from "@/lib/api-client";
import {
  RefreshCw,
  Plus,
  Server,
  Building2,
} from "lucide-react";

export function AccountsReceivableView() {
  const [tenantID, setTenantID] = useState<string>("tenant-zoiko-dev-01");
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [isLiveBackend, setIsLiveBackend] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // New Invoice Form state
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [customerID, setCustomerID] = useState<string>("cust-global-tech");
  const [amount, setAmount] = useState<number>(5000);
  const [currency, setCurrency] = useState<string>("USD");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    // Check if backend service is reachable locally via proxy (to avoid CORS browser blocks)
    const healthy = await checkServiceHealth("/api/backend/ar");
    setIsLiveBackend(healthy);

    const res = await listInvoices(tenantID);
    if (res.data) {
      const rawObj = res.data as unknown as Record<string, unknown>;
      const list = Array.isArray(res.data)
        ? res.data
        : Array.isArray(rawObj?.invoices)
        ? (rawObj.invoices as CustomerInvoice[])
        : [];
      setInvoices(list);
    }
    setStatusMessage(res.error || (healthy ? "Connected to local Go microservice (http://localhost:8101)" : "Local microservice offline. Using mock fallback."));
    setIsLoading(false);
  }, [tenantID]);

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      // Yield to let the render cycle complete and avoid synchronous state updates in the effect path
      await Promise.resolve();
      if (!active) return;
      await loadData();
    };
    fetch();
    return () => {
      active = false;
    };
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const res = await createInvoice(
      {
        customer_id: customerID,
        amount: Number(amount),
        currency_code: currency,
        legal_entity_id: "le-singapore-01",
      },
      tenantID
    );

    if (res.data) {
      setInvoices((prev) => [res.data!, ...prev]);
      setStatusMessage(
        res.isMock
          ? "Invoice generated in mock store (start backend service to save to Postgres)."
          : `Invoice ${res.data.invoice_number} created in Postgres via accounts-receivable-svc!`
      );
      setIsCreating(false);
    }
    setIsLoading(false);
  };

  const handleTransition = async (inv: CustomerInvoice, nextStatus: InvoiceStatus) => {
    startTransition(async () => {
      const res = await transitionInvoice(inv.invoice_id, inv.status, nextStatus, tenantID);
      if (res.data?.success) {
        setInvoices((prev) =>
          prev.map((i) => (i.invoice_id === inv.invoice_id ? { ...i, status: nextStatus } : i))
        );
        setStatusMessage(`Invoice ${inv.invoice_number} transitioned to ${nextStatus}.`);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Local Connection Status Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-lg ${
              isLiveBackend
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
            }`}
          >
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Accounts Receivable Service
              </h3>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  isLiveBackend
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                }`}
              >
                {isLiveBackend ? "Live Local Backend (Port 8101)" : "Mock Fallback Mode"}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {statusMessage}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tenant Selector */}
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs">
            <Building2 className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-500">Tenant:</span>
            <select
              value={tenantID}
              onChange={(e) => setTenantID(e.target.value)}
              className="bg-transparent font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none cursor-pointer"
            >
              <option value="tenant-zoiko-dev-01">tenant-zoiko-dev-01 (SG)</option>
              <option value="tenant-zoiko-us-02">tenant-zoiko-us-02 (US)</option>
              <option value="tenant-zoiko-uk-03">tenant-zoiko-uk-03 (UK)</option>
            </select>
          </div>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2 rounded-lg text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
            title="Refresh from backend"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Main Action Bar & Invoices List */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Customer Invoices & Receivables
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Isolated under current tenant context header (<code className="font-mono text-zinc-700 dark:text-zinc-300">X-Tenant-ID: {tenantID}</code>)
          </p>
        </div>

        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Create Invoice
        </button>
      </div>

      {/* Create Invoice Drawer/Form */}
      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-4"
        >
          <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">
            Issue New Customer Receivable Invoice
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Customer Identifier
              </label>
              <input
                type="text"
                value={customerID}
                onChange={(e) => setCustomerID(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Amount
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-indigo-500"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="SGD">SGD (S$)</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
            >
              {isLoading ? "Saving..." : "Submit to Backend"}
            </button>
          </div>
        </form>
      )}

      {/* Invoices Table */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
              {!Array.isArray(invoices) || invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    No invoices found for tenant {tenantID}.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.invoice_id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                      {inv.invoice_number}
                    </td>
                    <td className="py-3 px-4 text-zinc-600 dark:text-zinc-300">
                      {inv.customer_id}
                    </td>
                    <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                      {inv.currency_code} {inv.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          inv.status === "ISSUED"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            : inv.status === "SENT"
                            ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                            : inv.status === "PAID"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-500 dark:text-zinc-400">
                      {inv.due_date && !isNaN(Date.parse(inv.due_date))
                        ? new Date(inv.due_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        {inv.status === "ISSUED" && (
                          <button
                            onClick={() => handleTransition(inv, "SENT")}
                            disabled={isPending}
                            className="px-2.5 py-1 text-[11px] font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 hover:bg-purple-100 rounded-md border border-purple-200 dark:border-purple-800 transition-colors"
                          >
                            Mark Sent
                          </button>
                        )}
                        {inv.status === "SENT" && (
                          <button
                            onClick={() => handleTransition(inv, "PAID")}
                            disabled={isPending}
                            className="px-2.5 py-1 text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100 rounded-md border border-emerald-200 dark:border-emerald-800 transition-colors"
                          >
                            Record Payment
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
