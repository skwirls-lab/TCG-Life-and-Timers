// @req PAY-004
import { afterEach, describe, expect, it } from "vitest";
import { TcgDb } from "@/lib/db";
import { saveDeck, saveProfile } from "@/lib/profiles/repo";
import { usePaywall } from "./paywall";
import { canCreateDeck, canCreateProfile } from "./quota";
import { FREE_LIMITS } from "./features";
import { useEntitlements } from "./store";

const open: TcgDb[] = [];
function freshDb(): TcgDb {
  const db = new TcgDb(`quota-test-${Date.now()}-${open.length}`);
  open.push(db);
  return db;
}

afterEach(async () => {
  usePaywall.getState().close();
  useEntitlements.getState().setPolicy("ALL_FREE");
  useEntitlements.getState().setPro(false);
  for (const db of open.splice(0)) {
    db.close();
    await db.delete();
  }
});

describe("profile / deck quotas (§17.2)", () => {
  // @req PAY-004
  it("free tiered users get 4 profiles and 1 deck per profile", async () => {
    const db = freshDb();
    useEntitlements.getState().setPolicy("TIERED");
    for (let i = 0; i < 4; i++) {
      expect(await canCreateProfile(db)).toBe(true);
      await saveProfile({ name: `P${i}`, color: "#fff", contrast: false }, db);
    }
    expect(await canCreateProfile(db)).toBe(false);
    expect(usePaywall.getState()).toMatchObject({ isOpen: true, feature: "profilesUnlimited" });
    usePaywall.getState().close();

    const [p] = await db.profiles.toArray();
    for (let i = 0; i < FREE_LIMITS.decksPerProfile; i++) {
      expect(await canCreateDeck(p!.id, db)).toBe(true);
      await saveDeck({ profileId: p!.id, name: `D${i}` }, db);
    }
    expect(await canCreateDeck(p!.id, db)).toBe(false);
    expect(usePaywall.getState().isOpen).toBe(true);
  });

  it("is unlimited when the paywall is off or the user is Pro", async () => {
    const db = freshDb();
    for (let i = 0; i < 5; i++)
      await saveProfile({ name: `P${i}`, color: "#fff", contrast: false }, db);
    expect(await canCreateProfile(db)).toBe(true);
    useEntitlements.getState().setPolicy("TIERED");
    useEntitlements.getState().setPro(true);
    expect(await canCreateProfile(db)).toBe(true);
    expect(usePaywall.getState().isOpen).toBe(false);
  });
});
