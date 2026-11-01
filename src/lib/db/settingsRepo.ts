/** Key/value settings rows (app settings, per-preset defaults; SET-012). */
import type { z } from "zod";
import { getDb, type TcgDb } from "./db";

export const APP_SETTINGS_KEY = "app";
export const presetDefaultsKey = (presetId: string) => `presetDefaults:${presetId}`;

/** Read a setting; returns undefined when missing or when it fails `schema`. */
export async function getSetting<T>(
  key: string,
  schema: z.ZodType<T>,
  db: TcgDb = getDb(),
): Promise<T | undefined> {
  const row = await db.settings.get(key);
  if (!row) return undefined;
  const parsed = schema.safeParse(row.value);
  return parsed.success ? parsed.data : undefined;
}

export async function setSetting(
  key: string,
  value: unknown,
  db: TcgDb = getDb(),
  now: number = Date.now(),
): Promise<void> {
  await db.settings.put({ key, value, updatedAt: now });
}

export async function deleteSetting(key: string, db: TcgDb = getDb()): Promise<void> {
  await db.settings.delete(key);
}
