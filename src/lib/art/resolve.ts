/**
 * Resolve a seat's ArtRef to a displayable image URL (ART-003, ART-009, ART-022).
 *
 * - scryfall: the offline copy from IndexedDB when present (object URL), else `art.value`
 *   (served cache-first by the service worker).
 * - upload: an object URL of the Dexie blob (`art.value` = art id). A remote-only row (synced from
 *   another device) is downloaded first when a `download` function is given (signed in).
 * - gradient / solid / default: no URL (rendered with CSS, see artToCss).
 *
 * Callers must call `revoke()` when done (unmount) to free object URLs.
 */
import type { ArtRef } from "@/engine";
import { getDb, type TcgDb } from "@/lib/db";
import { getArt, getRemoteCopy, isCacheableUrl } from "./repo";

export type ArtUrlSource = "none" | "remote" | "copy" | "blob";

export interface ResolvedArt {
  url: string | undefined;
  source: ArtUrlSource;
  revoke(): void;
}

export interface ResolveDeps {
  db?: TcgDb;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  /** Fetch a remote-only upload's blob (signed-in only). Resolves true when it is now local. */
  download?: (id: string) => Promise<boolean>;
}

const NONE: ResolvedArt = { url: undefined, source: "none", revoke: () => {} };

/** Art kinds that render an image (vs. CSS-only backgrounds). */
export function isImageArt(art: ArtRef | undefined): art is ArtRef {
  return !!art && (art.kind === "scryfall" || art.kind === "upload") && !!art.value;
}

export async function resolveArtUrl(
  art: ArtRef | undefined,
  deps: ResolveDeps = {},
): Promise<ResolvedArt> {
  if (!isImageArt(art)) return NONE;
  const db = deps.db ?? getDb();
  const create = deps.createObjectURL ?? ((b: Blob) => URL.createObjectURL(b));
  const revokeUrl = deps.revokeObjectURL ?? ((u: string) => URL.revokeObjectURL(u));
  const fromBlob = (blob: Blob, source: ArtUrlSource): ResolvedArt => {
    const url = create(blob);
    let done = false;
    return {
      url,
      source,
      revoke: () => {
        if (done) return;
        done = true;
        revokeUrl(url);
      },
    };
  };

  if (art.kind === "scryfall") {
    const copy = await getRemoteCopy(art.value, db).catch(() => undefined);
    if (copy) return fromBlob(copy.blob, "copy");
    return isCacheableUrl(art.value)
      ? { url: art.value, source: "remote", revoke: () => {} }
      : NONE;
  }

  let row = await getArt(art.value, db).catch(() => undefined);
  if (!row) return NONE;
  if (row.blob.size === 0 && deps.download) {
    const ok = await deps.download(art.value).catch(() => false);
    if (ok) row = await getArt(art.value, db);
  }
  if (!row || row.blob.size === 0) return NONE;
  return fromBlob(row.blob, "blob");
}
