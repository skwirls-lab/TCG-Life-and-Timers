/** SET-040 "Share the app": Web Share API, falling back to copying the link. */

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

export interface ShareEnv {
  navigator: Partial<Pick<Navigator, "share" | "canShare">> & {
    clipboard?: Pick<Clipboard, "writeText">;
  };
  url: string;
}

export interface ShareText {
  title: string;
  text: string;
}

export async function shareApp(copy: ShareText, env?: ShareEnv): Promise<ShareResult> {
  const e: ShareEnv = env ?? {
    navigator: typeof navigator === "undefined" ? {} : navigator,
    url: typeof location === "undefined" ? "" : location.origin,
  };
  const data = { title: copy.title, text: copy.text, url: e.url };
  if (typeof e.navigator.share === "function" && (e.navigator.canShare?.(data) ?? true)) {
    try {
      await e.navigator.share(data);
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      // fall through to the clipboard
    }
  }
  try {
    if (!e.navigator.clipboard) return "failed";
    await e.navigator.clipboard.writeText(e.url);
    return "copied";
  } catch {
    return "failed";
  }
}
