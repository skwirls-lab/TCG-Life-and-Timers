"use client";
import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";
import { SnackbarHost } from "@/components/ui/Snackbar";
import { UpdatePrompt } from "./UpdatePrompt";
import { AppEffects } from "@/features/app-effects/AppEffects";
import { WhoWonHost } from "@/features/history-past/WhoWonPrompt";
// PAY lane (T7.1): the single paywall sheet + pw= test hook + entitlement sync start-up.
import { PaywallHost } from "@/features/paywall/PaywallHost";
// HARDEN (T8.3 / T8.7): consent banner (LEG-004) and install offer (PWA-003).
import { ConsentBanner } from "@/features/consent/ConsentBanner";
import { InstallPromptHost } from "@/features/install/InstallPromptHost";

export function Providers({ children }: { children: ReactNode }) {
  const disableSw = process.env.NODE_ENV === "development";
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={disableSw}
      reloadOnOnline={false}
      cacheOnNavigation
    >
      <AppEffects />
      {children}
      {/* HIST-031: "Who won?" for every reset / new-game path (requestReset) */}
      <WhoWonHost />
      <SnackbarHost />
      <UpdatePrompt />
      <PaywallHost />
      <ConsentBanner />
      <InstallPromptHost />
    </SerwistProvider>
  );
}
