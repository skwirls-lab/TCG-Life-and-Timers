import type { Metadata } from "next";
import { MyImagesScreen } from "@/features/art/MyImagesScreen";

export const metadata: Metadata = { title: "My images" };

export default function ImagesPage() {
  return <MyImagesScreen />;
}
