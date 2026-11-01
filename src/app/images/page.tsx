import type { Metadata } from "next";
import { MyImagesScreen } from "@/features/art/MyImagesScreen";

export const metadata: Metadata = { title: "My images · TCG Life & Timers" };

export default function ImagesPage() {
  return <MyImagesScreen />;
}
