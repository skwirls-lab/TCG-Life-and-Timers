"use client";
import { useEffect, useState } from "react";
import type { ArtRef } from "@/engine";
import { cacheRemoteArt } from "@/lib/art/repo";
import { resolveArtUrl, type ArtUrlSource } from "@/lib/art/resolve";

// The cloud runtime (auth / entitlements / Storage) loads only when a remote-only upload must be
// downloaded, keeping it out of the board's initial chunks (PERF-003).
const downloadArt = (id: string): Promise<boolean> =>
  import("@/lib/art/cloudRuntime").then((m) => m.downloadArt(id));
const online = () => typeof navigator === "undefined" || navigator.onLine !== false;

export interface ArtUrlState {
  url: string | undefined;
  source: ArtUrlSource;
}

const EMPTY: ArtUrlState = { url: undefined, source: "none" };

/**
 * Displayable URL for an ArtRef (see resolveArtUrl): object URLs are revoked on unmount / change.
 * A remote Scryfall image that has no offline copy yet gets one in the background (ART-009).
 */
export function useArtUrl(art: ArtRef | undefined): ArtUrlState {
  const kind = art?.kind;
  const value = art?.value;
  const [state, setState] = useState<{ key: string; v: ArtUrlState }>({ key: "", v: EMPTY });
  const key = `${kind ?? ""}\u0000${value ?? ""}`;

  useEffect(() => {
    if (!kind || !value || (kind !== "scryfall" && kind !== "upload")) return;
    let live = true;
    let revoke = () => {};
    void resolveArtUrl({ kind, value }, { download: downloadArt })
      .then((r) => {
        revoke = r.revoke;
        if (!live) return r.revoke();
        setState({ key, v: { url: r.url, source: r.source } });
        if (r.source === "remote" && r.url && online()) void cacheRemoteArt(r.url);
      })
      .catch(() => {
        if (live) setState({ key, v: EMPTY });
      });
    return () => {
      live = false;
      revoke();
    };
  }, [key, kind, value]);

  return state.key === key ? state.v : EMPTY;
}
