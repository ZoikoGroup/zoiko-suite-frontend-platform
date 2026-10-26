import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/shared";

export const metadata: Metadata = {
  title: "Exceptions | Zoiko Suite",
};

export default function ExceptionsPage() {
  return (
    <ComingSoon
      title="Exceptions"
      description="Governance exceptions raised to you for a decision."
    />
  );
}
