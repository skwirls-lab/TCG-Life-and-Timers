import { notFound } from "next/navigation";
import { SeatMenuHarness } from "./SeatMenuHarness";

/** Test harness for the seat menu (e2e only): /dev/seat-menu?quick=mtg.commander&players=4&rot=90 */
export default async function SeatMenuHarnessPage({
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
  return <SeatMenuHarness query={query.toString()} />;
}
