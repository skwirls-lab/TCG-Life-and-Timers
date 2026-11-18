import type { Metadata } from "next";
import { ProfilesScreen } from "@/features/profiles/ProfilesScreen";

export const metadata: Metadata = { title: "Profiles" };

export default function ProfilesPage() {
  return <ProfilesScreen />;
}
