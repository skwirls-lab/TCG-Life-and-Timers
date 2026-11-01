import type { Metadata } from "next";
import { LegalDocument } from "@/features/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of use · TCG Life & Timers",
  description: "Terms of use for TCG Life & Timers, an unofficial life counter and game clock.",
};

export default function TermsPage() {
  return <LegalDocument kind="terms" />;
}
