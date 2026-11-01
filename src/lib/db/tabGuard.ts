/**
 * Cross-tab guard for the active game (B-2). The tab that starts, loads or takes over a game
 * announces it on `BroadcastChannel('tcg-life-active')`; every other tab then knows its copy is
 * stale, stops autosaving (so it can never overwrite the newer tab's progress) and shows a
 * non-destructive "This game is open in another tab" notice with "Use here" (re-load from
 * IndexedDB and take over). Without BroadcastChannel the guard is a no-op and the repo-level
 * ownership rules (gameRepo.saveActive) still prevent one tab from deleting another tab's game.
 */

export const TAB_CHANNEL = "tcg-life-active";

export interface TabClaim {
  type: "claim";
  /** The announcing tab. */
  tabId: string;
  /** The game it now owns. */
  gameId: string;
}

/** The subset of BroadcastChannel the guard uses (a fake in tests). */
export interface ChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export interface TabGuard {
  /** Announce that this tab now owns `gameId`. */
  claim(gameId: string): void;
  close(): void;
}

function isClaim(x: unknown): x is TabClaim {
  if (typeof x !== "object" || x === null) return false;
  const m = x as Record<string, unknown>;
  return m.type === "claim" && typeof m.tabId === "string" && typeof m.gameId === "string";
}

export function createTabGuard(opts: {
  /** Called when another tab claims a game (this tab's copy is stale). */
  onStale: (claim: TabClaim) => void;
  tabId?: string;
  channel?: () => ChannelLike | null;
}): TabGuard {
  const tabId = opts.tabId ?? Math.random().toString(36).slice(2);
  const make =
    opts.channel ??
    (() =>
      typeof BroadcastChannel === "undefined"
        ? null
        : (new BroadcastChannel(TAB_CHANNEL) as unknown as ChannelLike));
  let ch: ChannelLike | null = null;
  try {
    ch = make();
  } catch {
    ch = null;
  }
  if (ch) {
    ch.onmessage = (ev) => {
      if (isClaim(ev.data) && ev.data.tabId !== tabId) opts.onStale(ev.data);
    };
  }
  return {
    claim(gameId) {
      const msg: TabClaim = { type: "claim", tabId, gameId };
      try {
        ch?.postMessage(msg);
      } catch {
        // A closed channel: nothing to tell.
      }
    },
    close() {
      if (!ch) return;
      ch.onmessage = null;
      ch.close();
      ch = null;
    },
  };
}
