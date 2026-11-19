/**
 * AUTH-006 data export (JSON of all the user's local data; images are referenced, not embedded)
 * and AUTH-005 account deletion (client side: the `deleteUserData` callable does the work).
 */
import { getDb, type TcgDb } from "@/lib/db";
import { appVersion } from "@/lib/feedback/version";

export const EXPORT_FORMAT = "tcg-life-export";
export const EXPORT_VERSION = 1;

export interface ExportPayload {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  appVersion: string;
  exportedAt: string;
  profiles: unknown[];
  decks: unknown[];
  presets: unknown[];
  /** Saved setups ("Presets"). */
  setups: unknown[];
  settings: unknown[];
  records: unknown[];
  /** Art metadata only; image binaries are not included. */
  art: { id: string; meta: Record<string, unknown>; bytes: number; type: string }[];
}

export async function buildExport(
  db: TcgDb = getDb(),
  now: number = Date.now(),
): Promise<ExportPayload> {
  const art = await db.art.toArray();
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    appVersion: appVersion(),
    exportedAt: new Date(now).toISOString(),
    profiles: await db.profiles.toArray(),
    decks: await db.decks.toArray(),
    presets: await db.presets.toArray(),
    setups: await db.setups.toArray(),
    settings: await db.settings.toArray(),
    records: await db.records.toArray(),
    art: art.map((a) => ({
      id: a.id,
      meta: a.meta ?? {},
      bytes: typeof a.blob?.size === "number" ? a.blob.size : 0,
      type: typeof a.blob?.type === "string" ? a.blob.type : "",
    })),
  };
}

export function exportFilename(now: number = Date.now()): string {
  return `tcgtempo-export-${new Date(now).toISOString().slice(0, 10)}.json`;
}

interface DownloadEnv {
  document: Pick<Document, "createElement" | "body">;
  url: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
}

/** Build the export and trigger a JSON download. Returns the file name. */
export async function downloadExport(
  db: TcgDb = getDb(),
  env: DownloadEnv = { document, url: URL },
  now: number = Date.now(),
): Promise<string> {
  const payload = await buildExport(db, now);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const href = env.url.createObjectURL(blob);
  const name = exportFilename(now);
  const a = env.document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener";
  env.document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => env.url.revokeObjectURL(href), 1000);
  return name;
}

export interface DeleteAccountDeps {
  /** Calls the `deleteUserData` callable (Firestore subtree, Storage prefix, Auth user). */
  callDelete: () => Promise<unknown>;
  /** Stop sync before the server deletes data so nothing is re-uploaded. */
  stopSync: () => Promise<void>;
  /** Sign out and clear local synced data. */
  signOutAndClear: () => Promise<void>;
}

/** AUTH-005: delete the account and everything in it, then sign out and clear the device. */
export async function deleteAccount(deps: DeleteAccountDeps): Promise<void> {
  await deps.stopSync();
  await deps.callDelete();
  await deps.signOutAndClear();
}
