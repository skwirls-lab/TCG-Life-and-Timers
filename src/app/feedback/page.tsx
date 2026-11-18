import type { Metadata } from "next";
import { FeedbackScreen } from "@/features/account/FeedbackScreen";

export const metadata: Metadata = { title: "Feedback" };

export default function FeedbackPage() {
  return <FeedbackScreen />;
}
