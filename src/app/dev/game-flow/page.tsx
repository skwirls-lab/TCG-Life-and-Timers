import { notFound } from "next/navigation";
import { GameFlowHarness } from "./GameFlowHarness";

export default function GameFlowHarnessPage() {
  if (process.env.NEXT_PUBLIC_TEST_HOOKS !== "1" && process.env.NODE_ENV === "production")
    notFound();
  return <GameFlowHarness />;
}
