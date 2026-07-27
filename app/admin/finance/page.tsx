import type { Metadata } from "next";
import { DomainPlaceholder } from "@/components/admin/shared";
import { DOMAINS } from "@/lib/constants";

export const metadata: Metadata = { title: "Finance" };

async function getDomain() {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return DOMAINS.find((d) => d.key === "finance")!;
}

export default async function FinancePage() {
  const domain = await getDomain();
  return <DomainPlaceholder domain={domain} />;
}
