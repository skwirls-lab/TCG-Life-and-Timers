import type { Metadata } from "next";
import { PlayScreen } from "@/features/board/PlayScreen";

export const metadata: Metadata = { title: "Board" };

export default function PlayPage() {
  return <PlayScreen />;
}
