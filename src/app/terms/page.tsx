import type { Metadata } from "next";
import { LegalDocument } from "@/features/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Terms of use for TCGTempo, an unofficial life counter and game clock.",
};

export default function TermsPage() {
  return <LegalDocument kind="terms" />;
}
