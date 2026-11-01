import type { Metadata } from "next";
import { PlayScreen } from "@/features/board/PlayScreen";

export const metadata: Metadata = { title: "Board · TCG Life & Timers" };

export default function PlayPage() {
  return <PlayScreen />;
}
