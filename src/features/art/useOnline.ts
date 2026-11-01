"use client";
import { useSyncExternalStore } from "react";
import { navigatorOnline } from "@/lib/art/scryfall";

function subscribe(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** navigator.onLine as React state (ART-009 offline search message). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, navigatorOnline, () => true);
}
