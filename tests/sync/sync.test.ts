// Sync engine against the Firestore + Auth emulators (T4.3, T4.4).
// @req ARCH-007 @req SYNC-002 @req SYNC-003 @req PROF-003 @req SET-014 @req AUTH-003 @req SEC-001
import { afterEach, describe, expect, it } from "vitest";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import * as fs from "firebase/firestore";
import { deleteProfile, saveDeck, saveProfile } from "@/lib/profiles/repo";
import { setSetting } from "@/lib/db";
import { snapshotLocal } from "@/lib/account/localData";
import { executeMerge, planMerge } from "@/lib/account/merge";
import { fetchRemoteItems } from "@/lib/sync/firestoreRemote";
import { device, uniqueEmail, until, type Device } from "./clients";

const open: Device[] = [];
async function dev(email: string) {
  const d = await device(email);
  open.push(d);
  return d;
}
afterEach(async () => {
  for (const d of open.splice(0)) await d.close();
});

describe("sync across two devices of the same user (emulator)", () => {
  // @req ARCH-007 @req SYNC-002
  it("a profile created on A appears on B; edits and deletes propagate", async () => {
    const email = uniqueEmail("two");
    const a = await dev(email);
    const b = await dev(email);
    expect(a.uid).toBe(b.uid);
    await a.startSync();
    await b.startSync();

    const p = await saveProfile({ name: "Jean-Paul", color: "#34d399", contrast: false }, a.db);
    await saveDeck(
      {
        profileId: p.id,
        name: "Toxrill",
        presetId: "mtg.commander",
        commanders: ["Toxrill, the Corrosive"],
        colorIdentity: "UB",
      },
      a.db,
    );
    const onB = await until(
      () => b.db.profiles.get(p.id),
      (r) => r !== undefined,
    );
    expect(onB).toMatchObject({ name: "Jean-Paul", color: "#34d399", normalizedName: "jean-paul" });
    const deckB = await until(
      () => b.db.decks.where("profileId").equals(p.id).toArray(),
      (r) => r.length === 1,
    );
    expect(deckB[0]).toMatchObject({
      name: "Toxrill",
      colorIdentity: "UB",
      presetId: "mtg.commander",
    });

    // Edit on B wins (newer) and reaches A.
    await saveProfile(
      { ...onB!, id: p.id, name: "JP", color: "#ff0000", contrast: true } as never,
      b.db,
      Date.now() + 1000,
    );
    await until(
      () => a.db.profiles.get(p.id),
      (r) => r?.name === "JP",
    );

    // Delete on A → tombstone in the cloud → gone on B.
    await deleteProfile(p.id, a.db);
    await until(
      () => b.db.profiles.get(p.id),
      (r) => r === undefined,
    );
    await until(
      () => b.db.decks.count(),
      (n) => n === 0,
    );
    const remote = await getDoc(doc(a.firestore, `users/${a.uid}/profiles/${p.id}`));
    expect(remote.data()).toMatchObject({ deleted: true, name: "JP" });
  });

  // @req SET-014 @req PROF-003
  it("settings and the me profile sync; device-only settings stay local", async () => {
    const email = uniqueEmail("settings");
    const a = await dev(email);
    const b = await dev(email);
    await b.db.settings.put({ key: "app", value: { theme: "dark", haptics: true }, updatedAt: 1 });
    await a.startSync();
    await b.startSync();
    const me = await saveProfile({ name: "Me", color: "#fff", contrast: false, isMe: true }, a.db);
    await setSetting(
      "app",
      { theme: "light", haptics: false, keepAwake: false },
      a.db,
      Date.now() + 5000,
    );
    await setSetting("presetDefaults:mtg.commander", { players: 3 }, a.db, Date.now() + 5000);
    const app = await until(
      () => b.db.settings.get("app"),
      (r) => (r?.value as { theme?: string })?.theme === "light",
    );
    expect(app!.value).toEqual({ theme: "light", haptics: true });
    await until(
      () => b.db.settings.get("presetDefaults:mtg.commander"),
      (r) => r !== undefined,
    );
    await until(
      () => b.db.profiles.get(me.id),
      (r) => r?.isMe === true,
    );
    const userDoc = await getDoc(doc(a.firestore, `users/${a.uid}`));
    expect(userDoc.data()).toMatchObject({
      meProfileId: me.id,
      settings: { app: { theme: "light" } },
    });
    expect(JSON.stringify(userDoc.data())).not.toContain("haptics");
  });

  // @req SYNC-003
  it("game records sync write-once when history sync is on", async () => {
    const email = uniqueEmail("records");
    const a = await dev(email);
    const b = await dev(email);
    await a.startSync({ historySync: true });
    await b.startSync({ historySync: false });
    await a.db.records.put({
      id: "g1",
      schemaVersion: 1,
      presetId: "mtg.commander",
      game: "Magic",
      startedAt: 1000,
      endedAt: 2000,
      durationMs: 1000,
      seats: [
        { name: "A", winner: true },
        { name: "B", winner: false },
      ],
    });
    await until(
      async () => (await getDoc(doc(a.firestore, `users/${a.uid}/games/g1`))).exists(),
      (x) => x,
    );
    await new Promise((r) => setTimeout(r, 300));
    expect(await b.db.records.count()).toBe(0); // history sync off on B
  });
});

describe("isolation (emulator)", () => {
  // @req SEC-001
  it("another user never sees or reaches the first user's data", async () => {
    const a = await dev(uniqueEmail("iso-a"));
    const c = await dev(uniqueEmail("iso-c"));
    expect(a.uid).not.toBe(c.uid);
    await a.startSync();
    await c.startSync();
    const p = await saveProfile({ name: "Secret", color: "#000", contrast: false }, a.db);
    await until(
      async () => (await getDoc(doc(a.firestore, `users/${a.uid}/profiles/${p.id}`))).exists(),
      (x) => x,
    );
    await new Promise((r) => setTimeout(r, 300));
    expect(await c.db.profiles.count()).toBe(0);
    await expect(getDocs(collection(c.firestore, `users/${a.uid}/profiles`))).rejects.toMatchObject(
      { code: "permission-denied" },
    );
  });
});

describe("guest → account merge (emulator)", () => {
  // @req AUTH-003
  it("merging local guest data into an account with cloud data loses nothing", async () => {
    const email = uniqueEmail("merge");
    // Device 1 already synced some cloud data.
    const cloud = await dev(email);
    await cloud.startSync();
    const alice = await saveProfile(
      { name: "Alice", color: "#111111", contrast: false },
      cloud.db,
      1000,
    );
    await cloud.db.presets.put({
      id: "custom-1",
      schemaVersion: 1,
      preset: { name: "Cloud preset", game: "Magic" },
      updatedAt: 1000,
    });
    await until(
      async () => (await getDocs(collection(cloud.firestore, `users/${cloud.uid}/presets`))).size,
      (n) => n === 1,
    );
    await until(
      async () => (await getDocs(collection(cloud.firestore, `users/${cloud.uid}/profiles`))).size,
      (n) => n === 1,
    );
    cloud.engine!.stop();

    // A guest device with overlapping (by name) and unique data signs in.
    const guest = await dev(email);
    const localAlice = await saveProfile(
      { name: "  alice ", color: "#222222", contrast: true },
      guest.db,
      Date.now() + 10_000,
    );
    await saveDeck({ profileId: localAlice.id, name: "Deck A", commanders: [] }, guest.db);
    const bob = await saveProfile({ name: "Bob", color: "#333333", contrast: false }, guest.db);
    const plan = planMerge(
      await snapshotLocal(guest.db),
      await fetchRemoteItems({ fs, db: guest.firestore, uid: guest.uid }),
    );
    expect(plan.needsChoice).toBe(true);
    expect(plan.profileRenames).toEqual([{ from: localAlice.id, to: alice.id }]);
    await executeMerge(plan, "merge", { includeRecords: true, db: guest.db });
    await guest.startSync();

    const profiles = await until(
      async () => (await getDocs(collection(guest.firestore, `users/${guest.uid}/profiles`))).docs,
      (d) => d.length === 2 && d.some((x) => x.data().color === "#222222"),
    );
    expect(profiles.map((d) => d.id).sort()).toEqual([alice.id, bob.id].sort());
    // Newer local edit of Alice won; the deck moved under the cloud profile id.
    expect(profiles.find((d) => d.id === alice.id)!.data()).toMatchObject({
      name: "alice",
      color: "#222222",
    });
    await until(
      async () =>
        (
          await getDocs(
            collection(guest.firestore, `users/${guest.uid}/profiles/${alice.id}/decks`),
          )
        ).size,
      (n) => n === 1,
    );
    // Cloud-only data arrived locally.
    await until(
      () => guest.db.presets.get("custom-1"),
      (r) => r !== undefined,
    );
    expect((await guest.db.profiles.toArray()).map((p) => p.id).sort()).toEqual(
      [alice.id, bob.id].sort(),
    );
    expect((await guest.db.decks.toArray())[0]).toMatchObject({
      profileId: alice.id,
      name: "Deck A",
    });
  });
});
