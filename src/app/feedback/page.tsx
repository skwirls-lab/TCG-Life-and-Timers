import type { Metadata } from "next";
import { FeedbackScreen } from "@/features/account/FeedbackScreen";

export const metadata: Metadata = { title: "Feedback · TCG Life & Timers" };

export default function FeedbackPage() {
  return <FeedbackScreen />;
}
