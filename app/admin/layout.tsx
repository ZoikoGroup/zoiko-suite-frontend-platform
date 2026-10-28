import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth";
import { AdminShell } from "@/components/admin/layout";
import { AssistantWidget } from "@/components/admin/assistant/AssistantWidget";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(SESSION_COOKIE)?.value);

  const user = {
    name: session?.name ?? "Admin",
    email: session?.email ?? "",
    role: session?.role ?? "Platform Administrator",
  };

  return (
    <>
      <AdminShell user={user}>{children}</AdminShell>
      {/* ZoikoSuite public assistant (public-ai-svc). Anonymous: it receives no console identity. */}
      <AssistantWidget />
    </>
  );
}
