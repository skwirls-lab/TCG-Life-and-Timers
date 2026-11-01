/**
 * Screen Wake Lock with re-acquire on visibility change and an optional video-loop fallback
 * for browsers without the API (PWA-005, PRD §5.3).
 */
type Sentinel = {
  release: () => Promise<void>;
  addEventListener?: (t: string, cb: () => void) => void;
};
interface WakeLockApi {
  request: (type: "screen") => Promise<Sentinel>;
}

export interface WakeLockEnv {
  wakeLock?: WakeLockApi;
  document: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener" | "createElement" | "body"
  >;
}

export interface WakeLockController {
  enable: (opts?: { fallback?: boolean }) => Promise<"api" | "fallback" | "unsupported">;
  disable: () => Promise<void>;
  readonly active: boolean;
}

// 1x1 transparent silent mp4 (NoSleep technique), tiny and inlined.
const SILENT_MP4 =
  "data:video/mp4;base64,AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAAAhmcmVlAAAAG21kYXQAAAGzABAHAAABthBgUYI9t+8AAAMNbW9vdgAAAGxtdmhkAAAAAMXMvvrFzL76AAAD6AAAACoAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACGHRyYWsAAABcdGtoZAAAAAfFzL76xcy++gAAAAEAAAAAAAAAKgAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAIAAAACAAAAAAAG9tZGlhAAAAIG1kaGQAAAAAxcy++sXMvvoAAAAZAAAAAQBVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABKG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAOhzdGJsAAAAmHN0c2QAAAAAAAAAAQAAAIhtcDR2AAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAACAAIABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAMmVzZHMAAAAAA4CAgCEAAQAEgICAEyAMBAAAAAAAAAAAAAAFgICAAQAGgICAAQIAAAAYc3R0cwAAAAAAAAABAAAAAQAAAAEAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAAAEgAAAAEAAAAUc3RjbwAAAAAAAAABAAAALAAAAGB1ZHRhAAAAWG1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAAK2lsc3QAAAAjqXRvbwAAABtkYXRhAAAAAQAAAABMYXZmNTguMjkuMTAw";

export function createWakeLock(env: WakeLockEnv): WakeLockController {
  let sentinel: Sentinel | null = null;
  let video: HTMLVideoElement | null = null;
  let wanted = false;
  let useFallback = false;

  const acquire = async () => {
    if (!wanted) return;
    if (env.wakeLock && !useFallback) {
      try {
        sentinel = await env.wakeLock.request("screen");
        sentinel.addEventListener?.("release", () => {
          sentinel = null;
        });
        return;
      } catch {
        // permission denied or not visible; retried on next visibility change
      }
    }
  };

  const onVisibility = () => {
    if (env.document.visibilityState === "visible" && wanted && !sentinel && !video) void acquire();
  };

  return {
    get active() {
      return sentinel !== null || video !== null;
    },
    async enable(opts = {}) {
      wanted = true;
      env.document.addEventListener("visibilitychange", onVisibility);
      if (env.wakeLock && !opts.fallback) {
        useFallback = false;
        await acquire();
        return "api";
      }
      if (opts.fallback) {
        useFallback = true;
        const v = env.document.createElement("video") as HTMLVideoElement;
        v.setAttribute("playsinline", "");
        v.setAttribute("muted", "");
        v.muted = true;
        v.loop = true;
        v.src = SILENT_MP4;
        v.style.position = "fixed";
        v.style.width = "1px";
        v.style.height = "1px";
        v.style.opacity = "0";
        v.style.pointerEvents = "none";
        env.document.body.appendChild(v);
        video = v;
        try {
          await v.play();
        } catch {
          // autoplay blocked until a gesture; callers enable on a tap
        }
        return "fallback";
      }
      return "unsupported";
    },
    async disable() {
      wanted = false;
      env.document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel) {
        await sentinel.release().catch(() => {});
        sentinel = null;
      }
      if (video) {
        video.pause();
        video.remove();
        video = null;
      }
    },
  };
}

export function browserWakeLock(): WakeLockController {
  const nav = navigator as Navigator & { wakeLock?: WakeLockApi };
  return createWakeLock({ wakeLock: nav.wakeLock, document });
}
