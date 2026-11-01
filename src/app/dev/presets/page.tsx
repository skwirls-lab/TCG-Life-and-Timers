import { notFound } from "next/navigation";
import { PresetsHarness } from "./PresetsHarness";

/**
 * Test harness for presets, the preset picker and the calculator (e2e only):
 *   /dev/presets                      the PresetPicker
 *   /dev/presets?quick=ygo.advanced   a minimal seat table driving every enabled counter
 */
export default async function PresetsHarnessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NEXT_PUBLIC_TEST_HOOKS !== "1" && process.env.NODE_ENV === "production")
    notFound();
  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") query.set(k, v);
    else if (Array.isArray(v) && v[0] !== undefined) query.set(k, v[0]);
  }
  return <PresetsHarness query={query.toString()} />;
}
