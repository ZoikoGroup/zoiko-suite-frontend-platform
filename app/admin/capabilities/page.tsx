import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/admin/shared";
import { CapabilityWorkbench } from "@/components/admin/capabilities/CapabilityWorkbench";
import { KillSwitchRegistryPanel } from "@/components/admin/capabilities/KillSwitchRegistryPanel";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Capability, Module & Release Registry | Zoiko Suite",
};

export default async function CapabilitiesPage() {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  const principalId = session?.principalId ?? "33333333-3333-3333-3333-333333333333";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader
        title="Capability, Module & Release Registry"
        description="Plane 1 (doc7 §7): Authoritative capability identity, jurisdictional market release gates, connector certification, operational kill-switch states, and public marketing claim governance."
      />

      <KillSwitchRegistryPanel initialPrincipalId={principalId} />

      <CapabilityWorkbench
        initialPrincipalId={principalId}
        initialIdempotencyKeys={{
          createCapability: randomUUID(),
          createMarketRelease: randomUUID(),
          createIntegrationCapability: randomUUID(),
          updateIntegrationHealth: randomUUID(),
          setReleaseState: randomUUID(),
          createCapabilityClaim: randomUUID(),
        }}
      />
    </div>
  );
}
