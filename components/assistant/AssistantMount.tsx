"use client";

// Renders the ZoikoSuite Assistant only on allowlisted public paths
// (./mount.ts). Mounted from the root layout, outside the admin shell and any
// auth, user or tenant provider; it receives logo URLs and nothing else.

import { usePathname } from "next/navigation";
import { AssistantWidget } from "./AssistantWidget";
import type { AssistantLogos } from "./branding";
import { isAssistantPath, pageContextFor } from "./mount";

export function AssistantMount({ logos, launcherOffset = 0 }: { logos: AssistantLogos; launcherOffset?: number }) {
  const pathname = usePathname() ?? "";
  if (!isAssistantPath(pathname)) return null;
  return <AssistantWidget logos={logos} pageContext={pageContextFor(pathname)} launcherOffset={launcherOffset} />;
}
