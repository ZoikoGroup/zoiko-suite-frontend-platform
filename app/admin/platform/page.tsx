import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/shared";
import { BusinessDomainGrid } from "@/components/admin/platform";

export const metadata: Metadata = {
  title: "Business Domains | Zoiko Suite",
};

export default function PlatformPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Domains"
        description="Every Zoiko Suite business domain and the console pages that govern it. Domains without a page are marked as not yet available."
      />
      <BusinessDomainGrid />
    </div>
  );
}
