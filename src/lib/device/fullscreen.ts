/** Fullscreen on the first in-game gesture (PWA-006). iOS Safari doesn't support it for pages. */
export interface FullscreenEnv {
  documentElement: { requestFullscreen?: (opts?: FullscreenOptions) => Promise<void> };
  fullscreenElement: Element | null;
  exitFullscreen?: () => Promise<void>;
}

export function fullscreenSupported(env: FullscreenEnv): boolean {
  return typeof env.documentElement.requestFullscreen === "function";
}

export async function enterFullscreen(env: FullscreenEnv): Promise<boolean> {
  if (!fullscreenSupported(env) || env.fullscreenElement) return !!env.fullscreenElement;
  try {
    await env.documentElement.requestFullscreen!({ navigationUI: "hide" });
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(env: FullscreenEnv): Promise<void> {
  if (env.fullscreenElement && env.exitFullscreen) await env.exitFullscreen().catch(() => {});
}

/** True when running as an installed PWA (standalone / fullscreen display mode). */
export function isStandalone(
  matchMedia: (q: string) => { matches: boolean },
  nav?: { standalone?: boolean },
): boolean {
  return (
    matchMedia("(display-mode: standalone)").matches ||
    matchMedia("(display-mode: fullscreen)").matches ||
    nav?.standalone === true
  );
}
