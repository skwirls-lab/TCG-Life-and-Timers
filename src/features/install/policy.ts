/**
 * Install-offer policy (PWA-003). Pure functions + a tiny localStorage record:
 * offer only after the first completed game, never when already installed, never again after the
 * user dismissed it.
 */
import type { StorageLike } from "@/lib/analytics/consent";

export const INSTALL_KEY = "tcg.install.v1";

export interface InstallRecord {
  completedGame: boolean;
  dismissedAt: number | null;
}

export const EMPTY_INSTALL_RECORD: InstallRecord = { completedGame: false, dismissedAt: null };

export function readInstallRecord(storage: StorageLike | null): InstallRecord {
  try {
    const raw = storage?.getItem(INSTALL_KEY);
    if (!raw) return EMPTY_INSTALL_RECORD;
    const p = JSON.parse(raw) as Partial<InstallRecord>;
    return {
      completedGame: p.completedGame === true,
      dismissedAt: typeof p.dismissedAt === "number" ? p.dismissedAt : null,
    };
  } catch {
    return EMPTY_INSTALL_RECORD;
  }
}

export function writeInstallRecord(storage: StorageLike | null, rec: InstallRecord): void {
  try {
    storage?.setItem(INSTALL_KEY, JSON.stringify(rec));
  } catch {
    // Storage unavailable: the offer simply won't be remembered.
  }
}

/** iOS / iPadOS Safari (the only iOS browser with a reliable "Add to Home Screen" flow). */
export function isIosSafari(ua: string, maxTouchPoints = 0): boolean {
  const iosDevice = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|DuckDuckGo/.test(ua);
  return iosDevice && /Safari\//.test(ua) && !otherBrowser;
}

export interface OfferInput {
  record: InstallRecord;
  standalone: boolean;
  installed: boolean;
  hasPrompt: boolean;
  iosSafari: boolean;
}

export type InstallOffer = "prompt" | "ios" | null;

export function installOffer(i: OfferInput): InstallOffer {
  if (!i.record.completedGame || i.record.dismissedAt !== null) return null;
  if (i.standalone || i.installed) return null;
  if (i.iosSafari) return "ios";
  return i.hasPrompt ? "prompt" : null;
}

/** True when a game-store transition shows a game that has just been completed. */
export function justCompleted(
  game: { id: string; status: string } | undefined,
  prev: { id: string; status: string } | undefined,
): boolean {
  return game?.status === "ended" && (prev?.id !== game.id || prev.status !== "ended");
}
