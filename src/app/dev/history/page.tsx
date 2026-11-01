import { notFound } from "next/navigation";
import { HistoryHarness } from "./HistoryHarness";

export default function HistoryHarnessPage() {
  if (process.env.NEXT_PUBLIC_TEST_HOOKS !== "1" && process.env.NODE_ENV === "production")
    notFound();
  return <HistoryHarness />;
}
