"use client";
import { useEffect, useRef } from "react";

/**
 * While `open`, pushes a history entry so Android/browser Back closes the overlay
 * instead of leaving the page (SEAT-005).
 */
export function useBackClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const marker = { overlay: Math.random().toString(36).slice(2) };
    window.history.pushState(marker, "");
    let poppedByBack = false;
    const onPop = () => {
      poppedByBack = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (
        !poppedByBack &&
        window.history.state &&
        window.history.state.overlay === marker.overlay
      ) {
        window.history.back();
      }
    };
  }, [open]);
}
