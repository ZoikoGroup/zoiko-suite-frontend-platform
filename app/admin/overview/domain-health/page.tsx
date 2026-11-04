import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/shared";

export const metadata: Metadata = {
  title: "Domain Health | Zoiko Suite",
};

export default function DomainHealthPage() {
  return (
    <ComingSoon
      title="Domain Health"
      description="Readiness and health of every domain's services."
    />
  );
}
