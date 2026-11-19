import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PresetsHarnessFromUrl } from "./PresetsHarness";

/**
 * Test harness for presets, the preset picker and the calculator (e2e only):
 *   /dev/presets                      the PresetPicker
 *   /dev/presets?quick=ygo.advanced   a minimal seat table driving every enabled counter
 * The query is read in the browser (static export), hence the Suspense boundary.
 */
export default function PresetsHarnessPage() {
  if (process.env.NEXT_PUBLIC_TEST_HOOKS !== "1" && process.env.NODE_ENV === "production")
    notFound();
  return (
    <Suspense>
      <PresetsHarnessFromUrl />
    </Suspense>
  );
}
