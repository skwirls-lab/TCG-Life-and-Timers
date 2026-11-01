"use client";
/**
 * A11Y-001: the board's single polite live region. Subscribes to the game store outside React
 * renders, so seats never re-render for it (PERF-002); counter changes are batched per seat
 * (≥ 1 s apart), turn passes / timeouts / eliminations are spoken at once.
 */
import { useEffect, useState } from "react";
import { createAnnouncer } from "@/lib/a11y/announcer";
import { diffAnnouncements } from "@/lib/a11y/announcements";
import { useGameStore } from "@/state/gameStore";

export function LiveAnnouncer() {
  const [text, setText] = useState("");
  useEffect(() => {
    const announcer = createAnnouncer({ emit: setText });
    const unsub = useGameStore.subscribe((state, prev) => {
      const next = state.session?.game;
      if (!next) return;
      const d = diffAnnouncements(prev.session?.game, next);
      if (prev.session?.game.id !== next.id) announcer.reset();
      for (const c of d.counters) announcer.update(c.key, c.text);
      if (d.immediate.length > 0) announcer.say(d.immediate.join(". "));
    });
    return () => {
      unsub();
      announcer.reset();
    };
  }, []);
  return (
    <div role="status" aria-live="polite" className="sr-only" data-testid="live-announcer">
      {text}
    </div>
  );
}
