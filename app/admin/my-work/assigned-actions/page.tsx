import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/shared";

export const metadata: Metadata = {
  title: "Assigned Actions | Zoiko Suite",
};

export default function AssignedActionsPage() {
  return (
    <ComingSoon
      title="Assigned Actions"
      description="Follow-up actions assigned to you."
    />
  );
}
