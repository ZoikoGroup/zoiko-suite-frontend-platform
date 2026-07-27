import type { Metadata } from "next";
import { cookies } from "next/headers";
import { KeyRound, ShieldCheck, Building2, Fingerprint } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from "@/components/ui";
import { PageHeader } from "@/components/admin/shared";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

const UPCOMING = [
  {
    icon: Fingerprint,
    title: "SSO & MFA",
    body: "SAML 2.0 / OIDC identity provider connection and enforced multi-factor authentication for privileged roles.",
  },
  {
    icon: Building2,
    title: "Entities & jurisdictions",
    body: "Manage the legal-entity hierarchy and jurisdiction packs that drive tax, payroll, and approval logic.",
  },
  {
    icon: ShieldCheck,
    title: "Policy & approval matrices",
    body: "Configure spend limits, signatory authority, and segregation-of-duties rules per entity.",
  },
  {
    icon: KeyRound,
    title: "API & service accounts",
    body: "Scoped, audited credentials for integrations that pass through the Governance Control Plane.",
  },
];

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Session, identity, and platform configuration."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <div>
              <CardTitle>Current session</CardTitle>
              <CardDescription>Issued to this device</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Name</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{session?.name ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Email</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{session?.email ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Role</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{session?.role ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Status</span>
              <Badge tone="success" dot>
                Active
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Platform configuration</CardTitle>
              <CardDescription>Wired to the Governance Control Plane as it comes online</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {UPCOMING.map((item) => (
                <div
                  key={item.title}
                  className="flex gap-3 rounded-lg border border-slate-200 p-3.5 transition-colors duration-150 hover:border-navy-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-navy-500 dark:hover:bg-slate-800/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 dark:bg-navy-500/10">
                    <item.icon className="h-4.5 w-4.5 text-navy-700 dark:text-navy-300" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
