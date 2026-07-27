import type { Metadata } from "next";
import { DomainPlaceholder } from "@/components/admin/shared";
import { DOMAINS } from "@/lib/constants";

export const metadata: Metadata = { title: "Tax" };

async function getDomain() {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return DOMAINS.find((d) => d.key === "tax")!;
}

export default async function TaxPage() {
  const domain = await getDomain();
  return <DomainPlaceholder domain={domain} />;
}
