import type { Metadata } from "next";
import { AboutScreen } from "@/features/art/AboutScreen";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return <AboutScreen />;
}
