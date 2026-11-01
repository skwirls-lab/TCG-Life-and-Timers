"use client";
import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";
import { SnackbarHost } from "@/components/ui/Snackbar";
import { UpdatePrompt } from "./UpdatePrompt";
import { AppEffects } from "@/features/app-effects/AppEffects";
import { WhoWonHost } from "@/features/history-past/WhoWonPrompt";

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
    </SerwistProvider>
  );
}
