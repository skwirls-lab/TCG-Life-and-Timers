"use client";
import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";
import { SnackbarHost } from "@/components/ui/Snackbar";
import { UpdatePrompt } from "./UpdatePrompt";

export function Providers({ children }: { children: ReactNode }) {
  const disableSw = process.env.NODE_ENV === "development";
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={disableSw}
      reloadOnOnline={false}
      cacheOnNavigation
    >
      {children}
      <SnackbarHost />
      <UpdatePrompt />
    </SerwistProvider>
  );
}
