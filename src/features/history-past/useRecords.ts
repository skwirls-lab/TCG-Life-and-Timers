"use client";
/** Live list of game records (newest first) from Dexie; enriches synced partial records. */
import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { getDb } from "@/lib/db";
import { enrichPartial, hydrateRecord, type GameRecord } from "@/lib/records";

export function useRecords(): GameRecord[] | null {
  const [records, setRecords] = useState<GameRecord[] | null>(null);
  useEffect(() => {
    const db = getDb();
    const enriching = new Set<string>();
    const sub = liveQuery(() => db.records.orderBy("endedAt").reverse().toArray()).subscribe({
      next: (rows) => {
        const list = rows.map(hydrateRecord);
        setRecords(list);
        for (const r of list) {
          if (r.partial && r.log && !enriching.has(r.id)) {
            enriching.add(r.id);
            void enrichPartial(r).catch(() => undefined);
          }
        }
      },
      error: (e: unknown) => {
        console.warn("[history] records query failed", e);
        setRecords([]);
      },
    });
    return () => sub.unsubscribe();
  }, []);
  return records;
}
