"use client";
import { useEffect, useRef } from "react";
import { overlayStack } from "./overlayStack";

/**
 * While `open`, the overlay owns a history entry so Android/browser Back closes it instead of
 * leaving the page (SEAT-005). Stack-aware (D-043): Back closes only the top overlay, and closing
 * one overlay while opening another in the same tick keeps the new one open (see overlayStack).
 */
export function useBackClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const stack = overlayStack();
    const id = stack.push(() => closeRef.current());
    return () => stack.release(id);
  }, [open]);
}
