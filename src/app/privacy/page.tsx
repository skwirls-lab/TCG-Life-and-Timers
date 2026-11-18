import type { Metadata } from "next";
import { ConsentControls } from "@/features/consent/ConsentControls";
import { LegalDocument } from "@/features/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What data TCGTempo stores, where, for how long, and how to export or delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument kind="privacy">
      <ConsentControls />
    </LegalDocument>
  );
}
