import type { Metadata } from "next";
import { DomainPlaceholder } from "@/components/admin/shared";
import { DOMAINS } from "@/lib/constants";

export const metadata: Metadata = { title: "Payroll" };

async function getDomain() {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return DOMAINS.find((d) => d.key === "payroll")!;
}

export default async function PayrollPage() {
  const domain = await getDomain();
  return <DomainPlaceholder domain={domain} />;
}
