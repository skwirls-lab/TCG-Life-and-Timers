"use client";
/**
 * Preset share links (T7.3, CUS-007, SEC-005).
 *   create: `sharedPresets/{code}` = {code, ownerUid, name, game, payload: exportPreset JSON,
 *           createdAt: serverTime}. Signed-out users get an anonymous uid (AUTH-002). Codes that
 *           already exist are skipped (the rules make shares immutable, so a collision can never
 *           overwrite someone else's share).
 *   open:   anyone can `get` a share by code (rules); the payload is imported as a NEW custom
 *           preset owned by the importer (fresh id), so editing the copy never affects the owner.
 *   manage: the owner lists (`ownerUid == uid`) and deletes their shares.
 */
import type { Preset } from "@/engine";
import { ensureAnonymous } from "@/lib/auth/store";
import type { AuthUser } from "@/lib/auth/types";
import { exportPreset, importPresetJson, saveCustomPreset } from "@/lib/customPresets";
import { paths, sharedPresetDataSchema } from "@/lib/firebase/docs";
import { CloudUnavailableError, firebaseRemote, type RemotePort } from "@/lib/entitlements/remote";
import { cryptoBytes, generateShareCode, isShareCode, type RandomBytes } from "./code";

export const MAX_CODE_ATTEMPTS = 5;

export interface ShareDeps {
  remote: RemotePort;
  ensureUser: () => Promise<AuthUser | null>;
  random: RandomBytes;
}

const defaultDeps = (): ShareDeps => ({
  remote: firebaseRemote(),
  ensureUser: ensureAnonymous,
  random: cryptoBytes,
});

export function shareUrl(origin: string, code: string): string {
  return `${origin}/p/${code}`;
}

function isPermissionDenied(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "permission-denied" || code === "firestore/permission-denied";
}

/** The share document for `preset` (validated with the same schema the rules mirror). */
export function shareData(preset: Preset, code: string, ownerUid: string) {
  return sharedPresetDataSchema.parse({
    code,
    ownerUid,
    name: preset.name,
    game: preset.game,
    payload: exportPreset(preset),
  });
}

/** Create a share link; resolves to its code. */
export async function createShareLink(
  preset: Preset,
  overrides: Partial<ShareDeps> = {},
): Promise<string> {
  const deps = { ...defaultDeps(), ...overrides };
  const user = await deps.ensureUser();
  if (!user) throw new CloudUnavailableError();
  let lastErr: unknown = new Error("could not allocate a share code");
  for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
    const code = generateShareCode(deps.random);
    const data = shareData(preset, code, user.uid);
    const path = paths.sharedPreset(code);
    if ((await deps.remote.getDoc(path)).exists) continue; // collision: try another code
    try {
      await deps.remote.setDoc(path, data, ["createdAt"]);
      return code;
    } catch (err) {
      // Lost a race for the same code (an existing doc makes the write an update → denied).
      if (!isPermissionDenied(err)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

export interface SharedPresetView {
  code: string;
  ownerUid: string;
  /** A validated copy with a fresh custom id, ready to save (not stored yet). */
  preset: Preset;
}

export type FetchSharedResult =
  | { status: "ok"; shared: SharedPresetView }
  | { status: "notFound" }
  | { status: "invalid"; errors: string[] };

/** Read a share by code and validate its payload as an importable preset. */
export async function fetchSharedPreset(
  code: string,
  remote: RemotePort = firebaseRemote(),
): Promise<FetchSharedResult> {
  if (!isShareCode(code)) return { status: "notFound" };
  const snap = await remote.getDoc(paths.sharedPreset(code));
  if (!snap.exists || !snap.data) return { status: "notFound" };
  const payload = snap.data.payload;
  if (typeof payload !== "string") return { status: "invalid", errors: ["missing payload"] };
  const r = importPresetJson(payload);
  if (!r.ok) return { status: "invalid", errors: r.errors };
  return {
    status: "ok",
    shared: { code, ownerUid: String(snap.data.ownerUid ?? ""), preset: r.preset },
  };
}

/** Store the shared preset as the importer's own custom preset. */
export async function importShared(shared: SharedPresetView): Promise<Preset> {
  return saveCustomPreset(shared.preset);
}

export interface MyShare {
  code: string;
  name: string;
  game: string;
}

export async function listMyShares(
  uid: string,
  remote: RemotePort = firebaseRemote(),
): Promise<MyShare[]> {
  const rows = await remote.queryEq(paths.sharedPresets(), "ownerUid", uid);
  return rows
    .map((r) => ({
      code: String(r.data.code ?? r.id),
      name: String(r.data.name ?? ""),
      game: String(r.data.game ?? ""),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
}

export async function deleteShare(
  code: string,
  remote: RemotePort = firebaseRemote(),
): Promise<void> {
  await remote.deleteDoc(paths.sharedPreset(code));
}

export type DeliverResult = "shared" | "copied" | "cancelled" | "none";

interface NavigatorLike {
  share?: (data: { url: string; title?: string; text?: string }) => Promise<void>;
  clipboard?: { writeText(text: string): Promise<void> };
}

/** Web Share API when available, otherwise copy to the clipboard. */
export async function deliverShareLink(
  url: string,
  title: string,
  nav: NavigatorLike = typeof navigator === "undefined" ? {} : navigator,
): Promise<DeliverResult> {
  if (typeof nav.share === "function") {
    try {
      await nav.share({ url, title });
      return "shared";
    } catch (err) {
      if ((err as { name?: unknown } | null)?.name === "AbortError") return "cancelled";
      // fall through to the clipboard (e.g. NotAllowedError without a user gesture)
    }
  }
  if (nav.clipboard) {
    try {
      await nav.clipboard.writeText(url);
      return "copied";
    } catch {
      return "none";
    }
  }
  return "none";
}
