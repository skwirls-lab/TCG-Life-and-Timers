import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SeatMenuHarnessFromUrl } from "./SeatMenuHarness";

/**
 * Test harness for the seat menu (e2e only): /dev/seat-menu?quick=mtg.commander&players=4&rot=90
 * The query is read in the browser (static export), hence the Suspense boundary.
 */
export default function SeatMenuHarnessPage() {
  if (process.env.NEXT_PUBLIC_TEST_HOOKS !== "1" && process.env.NODE_ENV === "production")
    notFound();
  return (
    <Suspense>
      <SeatMenuHarnessFromUrl />
    </Suspense>
  );
}
