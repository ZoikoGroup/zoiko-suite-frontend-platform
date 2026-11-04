import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/shared";

export const metadata: Metadata = {
  title: "Executive Dashboard | Zoiko Suite",
};

export default function ExecutiveDashboardPage() {
  return (
    <ComingSoon
      title="Executive Dashboard"
      description="Platform governance status across all legal entities, jurisdictions and domains."
    />
  );
}
