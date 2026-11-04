import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/shared";

export const metadata: Metadata = {
  title: "Tasks & Approvals | Zoiko Suite",
};

export default function TasksPage() {
  return (
    <ComingSoon
      title="Tasks & Approvals"
      description="The tasks and approvals waiting on you."
    />
  );
}
