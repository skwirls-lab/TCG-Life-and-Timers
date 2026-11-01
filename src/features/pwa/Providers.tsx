"use client";
import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";
import { SnackbarHost } from "@/components/ui/Snackbar";
import { UpdatePrompt } from "./UpdatePrompt";
import { AppEffects } from "@/features/app-effects/AppEffects";
// PAY lane (T7.1): the single paywall sheet + pw= test hook + entitlement sync start-up.
import { PaywallHost } from "@/features/paywall/PaywallHost";

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
      <SnackbarHost />
      <UpdatePrompt />
      <PaywallHost />
    </SerwistProvider>
  );
}
