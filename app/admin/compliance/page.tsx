import type { Metadata } from "next";
import { DomainPlaceholder } from "@/components/admin/shared";
import { DOMAINS } from "@/lib/constants";

export const metadata: Metadata = { title: "Compliance" };

async function getDomain() {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return DOMAINS.find((d) => d.key === "compliance")!;
}

export default async function CompliancePage() {
  const domain = await getDomain();
  return <DomainPlaceholder domain={domain} />;
}
