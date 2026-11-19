import type { Metadata } from "next";
import { SharedPresetScreen } from "@/features/paywall/SharedPresetScreen";
import { SHARE_PAGE_PLACEHOLDER } from "@/lib/share/sharePath";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: t("pay.shared.title"),
  // Share codes are unguessable links, not public content (LEG-005).
  robots: { index: false, follow: false },
};

/**
 * Share link `/p/{code}` (T7.3). The static export has a single page, `/p/_` (`out/p/_.html`),
 * and Firebase Hosting rewrites every `/p/**` URL to it (firebase.json). The client component
 * reads the real code from the browser URL and fetches `sharedPresets/{code}` from Firestore
 * (works signed out). Nothing is read at build time.
 */
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ code: SHARE_PAGE_PLACEHOLDER }];
}

export default function SharedPresetPage() {
  return <SharedPresetScreen />;
}
