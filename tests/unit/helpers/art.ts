/** Test helpers for the art lane (unit tests only). */
import { Dexie } from "dexie";
import { TcgDb } from "@/lib/db";

const open: TcgDb[] = [];
let n = 0;

export function freshArtDb(): TcgDb {
  const db = new TcgDb(`art-test-${n++}-${Math.random()}`);
  open.push(db);
  return db;
}

export async function closeArtDbs(): Promise<void> {
  for (const db of open.splice(0)) {
    db.close();
    await Dexie.delete(db.name);
  }
}

/** A small Blob with bytes (`type` defaults to image/webp). */
export function bytesBlob(size = 16, type = "image/webp"): Blob {
  return new Blob([new Uint8Array(size).fill(7)], { type });
}
