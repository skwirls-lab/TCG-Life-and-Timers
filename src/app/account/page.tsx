import type { Metadata } from "next";
import { AccountScreen } from "@/features/account/AccountScreen";

export const metadata: Metadata = { title: "Account · TCG Life & Timers" };

export default function AccountPage() {
  return <AccountScreen />;
}
