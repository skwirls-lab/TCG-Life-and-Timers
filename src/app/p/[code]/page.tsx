import type { Metadata } from "next";
import { SharedPresetScreen } from "@/features/paywall/SharedPresetScreen";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: t("pay.shared.title"),
  // Share codes are unguessable links, not public content (LEG-005).
  robots: { index: false, follow: false },
};

/**
 * Share link `/p/{code}` (T7.3). A dynamic segment rendered on demand by App Hosting; the page
 * itself is a thin shell and the client component reads the code with `useParams()` and fetches
 * `sharedPresets/{code}` from Firestore in the browser (works signed out). Nothing is read on
 * the server, so no params are awaited here and there is no generateStaticParams.
 */
export default function SharedPresetPage() {
  return <SharedPresetScreen />;
}
