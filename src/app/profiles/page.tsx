import type { Metadata } from "next";
import { ProfilesScreen } from "@/features/profiles/ProfilesScreen";

export const metadata: Metadata = { title: "Profiles · TCG Life & Timers" };

export default function ProfilesPage() {
  return <ProfilesScreen />;
}
