"use server";

// Server Actions for governance-decision-log-svc (:8083).
//
// The console is read-only (decision D-DL-2, 25 Nov 2026): decisions are
// recorded by the governance services that make them, resolved through
// Workflows & Approvals, and sealed hourly by the ledger itself. What is left
// re-computes and writes nothing: verify the chain, verify a package.
//
// Server Actions are reachable by direct POST, not only through this UI, so
// the session is verified inside every action. The service authorizes every
// read itself (GOVERNANCE_DECISION_READ) and fails closed; the console only
// relays its answer, in words.
//
// Every action returns the AuthzResult shape so the shared ActionDialog can
// show it (done / refused / error / signin).

import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession, toIdentity, type SessionIdentity } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import type { ApiError } from "@/lib/api/client";
import { explainDecisionError, verifyChain, verifyPackage } from "@/lib/api/governance";
import type { AuthzResult } from "@/app/admin/authorization/state";

const EXPIRED: AuthzResult = { status: "signin", message: "Your session has expired — sign in again." };

async function requireIdentity(): Promise<SessionIdentity | null> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session?.email || !session.principalId || !session.tenantId) return null;
  return toIdentity(session);
}

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function fail(error: ApiError): AuthzResult {
  if (error.status === 401) return { status: "signin", message: "The ledger did not recognise your session — sign in again." };
  const refused = error.status === 403 || error.status === 404 || error.status === 409 || error.status === 400 || error.status === 501;
  return { status: refused ? "refused" : "error", message: explainDecisionError(error) };
}

function short(hash: string | undefined): string {
  return hash ? `${hash.slice(0, 12)}…${hash.slice(-6)}` : "—";
}

/** Re-compute every link and every package of the tenant's chain. */
export async function verifyChainAction(_prev: AuthzResult, _fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const result = await verifyChain(identity);
  if (!result.ok) return fail(result.error);
  const v = result.data;
  const brokenPackages = v.packages.filter((p) => !p.valid);
  return {
    status: v.valid ? "done" : "refused",
    message: v.valid
      ? `All ${v.decisions_checked} decisions and ${v.packages_checked} sealed package(s) re-compute. The ledger is intact.`
      : v.first_break
        ? `The chain breaks at decision #${v.first_break.chain_seq} (${v.first_break.reason.replaceAll("_", " ").toLowerCase()}). Treat everything from there as unverified.`
        : `Every link re-computes, but ${brokenPackages.length} sealed package(s) do not: decisions were rewritten after they were sealed.`,
    details: [
      { label: "Decisions checked", value: String(v.decisions_checked) },
      { label: "Head", value: v.head_seq ? `#${v.head_seq}` : "—" },
      { label: "Head hash", value: short(v.head_hash) },
      { label: "Packages checked", value: String(v.packages_checked) },
      { label: "Verified", value: formatDateTime(v.verified_at) },
    ],
    table: v.packages.length
      ? {
          headers: ["Package", "Sealed through", "Result"],
          rows: v.packages.map((p) => [`#${p.package_seq}`, `#${p.to_seq}`, p.valid ? "Verifies" : (p.reason ?? "Fails")]),
        }
      : undefined,
  };
}

/** Re-compute one sealed package. */
export async function verifyPackageAction(_prev: AuthzResult, fd: FormData): Promise<AuthzResult> {
  const identity = await requireIdentity();
  if (!identity) return EXPIRED;
  const packageId = text(fd, "package_id");
  const result = await verifyPackage(packageId, identity);
  if (!result.ok) return fail(result.error);
  const c = result.data;
  return {
    status: c.valid ? "done" : "refused",
    message: c.valid
      ? `Package #${c.package_seq} verifies: decisions 1–${c.to_seq} are exactly as they were when sealed.`
      : `Package #${c.package_seq} does NOT verify (${(c.reason ?? "").replaceAll("_", " ").toLowerCase()}): the sealed decisions were changed.`,
    details: [
      { label: "Sealed through", value: `#${c.to_seq}` },
      { label: "Recomputed root", value: short(c.recomputed_root) },
    ],
  };
}
