// Firestore rules for the owner-only users/{uid}/** subtree (PRD §15.2, Appendix B Scenario 8).
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { ALICE, BOB, makeEnv, userDocs, valid } from "./helpers";

let env: RulesTestEnvironment;
const alice = () => env.authenticatedContext(ALICE).firestore();
const bob = () => env.authenticatedContext(BOB).firestore();
const anon = () => env.unauthenticatedContext().firestore();

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

beforeAll(async () => {
  env = await makeEnv();
});
beforeEach(async () => env.clearFirestore());
afterAll(async () => env?.cleanup());

describe("owner access (SEC-001)", () => {
  // @req SEC-001
  it.each(userDocs(ALICE))("owner can create and read $path", async ({ path, make }) => {
    await assertSucceeds(setDoc(doc(alice(), path), make()));
    await assertSucceeds(getDoc(doc(alice(), path)));
  });

  // @req SEC-001
  it("owner can list and delete their own profiles", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users/alice/profiles/p1"), valid.profile()));
    await assertSucceeds(getDocs(collection(alice(), "users/alice/profiles")));
    await assertSucceeds(deleteDoc(doc(alice(), "users/alice/profiles/p1")));
  });

  // @req SEC-001
  it("owner can tombstone a profile with a partial update", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users/alice/profiles/p1"), valid.profile()));
    await assertSucceeds(
      updateDoc(doc(alice(), "users/alice/profiles/p1"), {
        deleted: true,
        updatedAt: valid.profile().updatedAt,
      }),
    );
  });
});

describe("cross-user denial (SEC-001, SEC-006, Scenario 8)", () => {
  // @req SEC-001
  // @req SEC-006
  it.each(userDocs(ALICE))("bob cannot read alice's $path", async ({ path, make }) => {
    await seed(path, { ...make(), updatedAt: Timestamp.now(), createdAt: Timestamp.now() });
    await assertFails(getDoc(doc(bob(), path)));
  });

  // @req SEC-001
  // @req SEC-006
  it.each(userDocs(ALICE))("bob cannot write alice's $path", async ({ path, make }) => {
    await assertFails(setDoc(doc(bob(), path), make()));
  });

  // @req SEC-001
  it.each(userDocs(ALICE))("bob cannot delete alice's $path", async ({ path, make }) => {
    await seed(path, { ...make(), updatedAt: Timestamp.now(), createdAt: Timestamp.now() });
    await assertFails(deleteDoc(doc(bob(), path)));
  });

  // @req SEC-001
  it("bob cannot list alice's profiles or games", async () => {
    await assertFails(getDocs(collection(bob(), "users/alice/profiles")));
    await assertFails(getDocs(collection(bob(), "users/alice/games")));
  });

  // @req SEC-001
  it.each(userDocs(ALICE))("unauthenticated cannot read or write $path", async ({ path, make }) => {
    await assertFails(getDoc(doc(anon(), path)));
    await assertFails(setDoc(doc(anon(), path), make()));
  });
});

describe("entitlements are read-only (SEC-002)", () => {
  const ent = "users/alice/private/entitlements";

  // @req SEC-002
  it("owner can read their entitlements", async () => {
    await seed(ent, { pro: true, source: "subscription", updatedAt: Timestamp.now() });
    await assertSucceeds(getDoc(doc(alice(), ent)));
  });

  // @req SEC-002
  // @req SEC-006
  it("owner cannot create, update or delete entitlements", async () => {
    const d = { pro: true, source: "manual", updatedAt: valid.user().updatedAt };
    await assertFails(setDoc(doc(alice(), ent), d));
    await seed(ent, { pro: false, source: "none", updatedAt: Timestamp.now() });
    await assertFails(updateDoc(doc(alice(), ent), { pro: true }));
    await assertFails(deleteDoc(doc(alice(), ent)));
  });

  // @req SEC-002
  it("other users cannot read or write entitlements", async () => {
    await seed(ent, { pro: true, source: "subscription", updatedAt: Timestamp.now() });
    await assertFails(getDoc(doc(bob(), ent)));
    await assertFails(setDoc(doc(bob(), ent), { pro: false, source: "none" }));
  });

  // @req SEC-002
  // @req SEC-006
  it("the Stripe customer mapping (private/stripe) is server-only, even for the owner", async () => {
    const path = "users/alice/private/stripe";
    await seed(path, { customerId: "cus_123" });
    await assertFails(getDoc(doc(alice(), path)));
    await assertFails(getDoc(doc(bob(), path)));
    await assertFails(setDoc(doc(alice(), path), { customerId: "cus_evil" }));
    await assertFails(updateDoc(doc(alice(), path), { refreshedAt: 0 }));
    await assertFails(deleteDoc(doc(alice(), path)));
  });

  // @req SEC-001
  it("unknown private docs and unknown subcollections are denied even to the owner", async () => {
    await assertFails(setDoc(doc(alice(), "users/alice/private/other"), { x: 1 }));
    await assertFails(setDoc(doc(alice(), "users/alice/junk/x"), { x: 1 }));
    await assertFails(getDoc(doc(alice(), "users/alice/junk/x")));
  });
});

describe("document validation (SEC-003)", () => {
  // @req SEC-003
  it("rejects extra keys", async () => {
    await assertFails(
      setDoc(doc(alice(), "users/alice/profiles/p1"), { ...valid.profile(), extra: 1 }),
    );
    await assertFails(setDoc(doc(alice(), "users/alice"), { ...valid.user(), isAdmin: true }));
  });

  // @req SEC-003
  it("rejects missing required fields", async () => {
    const { color: _c, ...noColor } = valid.profile();
    await assertFails(setDoc(doc(alice(), "users/alice/profiles/p1"), noColor));
  });

  // @req SEC-003
  it("rejects a profile name over 40 characters", async () => {
    await assertSucceeds(
      setDoc(doc(alice(), "users/alice/profiles/p1"), { ...valid.profile(), name: "x".repeat(40) }),
    );
    await assertFails(
      setDoc(doc(alice(), "users/alice/profiles/p2"), { ...valid.profile(), name: "x".repeat(41) }),
    );
  });

  // @req SEC-003
  it("rejects wrong field types", async () => {
    await assertFails(
      setDoc(doc(alice(), "users/alice/profiles/p1"), { ...valid.profile(), contrast: "yes" }),
    );
    await assertFails(
      setDoc(doc(alice(), "users/alice/presets/x"), { ...valid.preset(), schemaVersion: "1" }),
    );
    await assertFails(
      setDoc(doc(alice(), "users/alice/games/g1"), { ...valid.game(), startedAt: "yesterday" }),
    );
  });

  // @req SEC-003
  it("requires updatedAt to be the server time", async () => {
    await assertFails(
      setDoc(doc(alice(), "users/alice/profiles/p1"), {
        ...valid.profile(),
        updatedAt: Timestamp.fromMillis(0),
      }),
    );
    await assertFails(
      setDoc(doc(alice(), "users/alice/presets/x"), { ...valid.preset(), updatedAt: 123 }),
    );
  });

  // @req SEC-003
  it("rejects invalid art refs", async () => {
    const p = valid.profile();
    await assertFails(
      setDoc(doc(alice(), "users/alice/profiles/p1"), { ...p, art: { ...p.art, kind: "gif" } }),
    );
    await assertFails(
      setDoc(doc(alice(), "users/alice/profiles/p1"), {
        ...p,
        art: { ...p.art, value: "x".repeat(2049) },
      }),
    );
    await assertFails(
      setDoc(doc(alice(), "users/alice/profiles/p1"), {
        ...p,
        art: { ...p.art, focal: { x: 2, y: 0 } },
      }),
    );
    // focal zoom is allowed within 0.1–10 (D-052)
    await assertSucceeds(
      setDoc(doc(alice(), "users/alice/profiles/p1"), {
        ...p,
        art: { ...p.art, focal: { x: 0.5, y: 0.5, zoom: 1.6 } },
      }),
    );
    await assertFails(
      setDoc(doc(alice(), "users/alice/profiles/p1"), {
        ...p,
        art: { ...p.art, focal: { x: 0.5, y: 0.5, zoom: 50 } },
      }),
    );
  });

  // @req SEC-003
  it("limits deck commanders and color identity (array size limits)", async () => {
    const path = "users/alice/profiles/p1/decks/d1";
    await assertSucceeds(
      setDoc(doc(alice(), path), { ...valid.deck(), commanders: ["Thrasios", "Tymna"] }),
    );
    await assertFails(setDoc(doc(alice(), path), { ...valid.deck(), commanders: ["a", "b", "c"] }));
    await assertFails(
      setDoc(doc(alice(), path), { ...valid.deck(), commanders: ["x".repeat(121)] }),
    );
    await assertFails(setDoc(doc(alice(), path), { ...valid.deck(), commanders: [42] }));
    await assertFails(setDoc(doc(alice(), path), { ...valid.deck(), colorIdentity: ["P"] }));
    await assertFails(
      setDoc(doc(alice(), path), {
        ...valid.deck(),
        colorIdentity: ["W", "U", "B", "R", "G", "W"],
      }),
    );
  });

  // @req SEC-003
  it("caps the preset payload at 200 KB", async () => {
    const big = "x".repeat(200 * 1024 + 1);
    await assertFails(
      setDoc(doc(alice(), "users/alice/presets/x"), { ...valid.preset(), payload: big }),
    );
  });

  // @req SEC-003
  it("validates saved setups (Presets): shape, name, game type, players, 32 KB payload", async () => {
    const path = "users/alice/setups/s1";
    await assertSucceeds(setDoc(doc(alice(), path), valid.setup()));
    await assertSucceeds(
      updateDoc(doc(alice(), path), { deleted: true, updatedAt: valid.setup().updatedAt }),
    );
    const bad: Record<string, unknown>[] = [
      { ...valid.setup(), name: "" },
      { ...valid.setup(), name: "x".repeat(61) },
      { ...valid.setup(), presetId: "bad id/with slash" },
      { ...valid.setup(), players: 9 },
      { ...valid.setup(), players: 0 },
      { ...valid.setup(), players: "4" },
      { ...valid.setup(), payload: "x".repeat(32 * 1024 + 1) },
      { ...valid.setup(), payload: 42 },
      { ...valid.setup(), schemaVersion: 0 },
      { ...valid.setup(), extra: true },
      { ...valid.setup(), updatedAt: Timestamp.fromMillis(0) },
    ];
    for (const d of bad) await assertFails(setDoc(doc(alice(), "users/alice/setups/s2"), d));
    const { players: _p, ...missing } = valid.setup();
    await assertFails(setDoc(doc(alice(), "users/alice/setups/s3"), missing));
  });

  // @req SEC-003
  it("caps the game log at 500 KB and validates seats", async () => {
    const path = "users/alice/games/g1";
    await assertFails(
      setDoc(doc(alice(), path), { ...valid.game(), log: "x".repeat(500 * 1024 + 1) }),
    );
    const nine = Array.from({ length: 9 }, (_, i) => ({ name: `P${i}`, winner: false }));
    await assertFails(setDoc(doc(alice(), path), { ...valid.game(), seats: nine }));
    await assertFails(
      setDoc(doc(alice(), path), { ...valid.game(), seats: [{ name: "A", winner: "y" }] }),
    );
    await assertFails(setDoc(doc(alice(), path), { ...valid.game(), seats: [] }));
  });

  // @req SEC-003
  it("caps the user settings map at 200 keys", async () => {
    const settings = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`k${i}`, i]));
    await assertFails(setDoc(doc(alice(), "users/alice"), { ...valid.user(), settings }));
  });

  // @req SEC-003
  it("keeps createdAt immutable on the user doc", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users/alice"), valid.user()));
    await assertFails(
      setDoc(doc(alice(), "users/alice"), { ...valid.user(), createdAt: Timestamp.fromMillis(0) }),
    );
    await assertSucceeds(
      updateDoc(doc(alice(), "users/alice"), {
        displayName: "Alice B",
        updatedAt: valid.user().updatedAt,
      }),
    );
  });

  // @req SEC-003
  // @req ART-022
  it("art metadata must point inside the owner's storage prefix", async () => {
    await assertFails(
      setDoc(doc(alice(), "users/alice/art/a1"), {
        ...valid.art(ALICE),
        storagePath: "users/bob/art/a1.webp",
      }),
    );
    await assertFails(
      setDoc(doc(alice(), "users/alice/art/a1"), { ...valid.art(ALICE), contentType: "text/html" }),
    );
    await assertFails(
      setDoc(doc(alice(), "users/alice/art/a1"), { ...valid.art(ALICE), bytes: 2 * 1024 * 1024 }),
    );
  });
});

describe("game records are write-once (SYNC-003)", () => {
  const path = "users/alice/games/g1";

  // @req SYNC-003
  it("allows re-sending the same record and tombstoning it", async () => {
    await assertSucceeds(setDoc(doc(alice(), path), valid.game()));
    await assertSucceeds(setDoc(doc(alice(), path), valid.game()));
    await assertSucceeds(
      updateDoc(doc(alice(), path), { deleted: true, updatedAt: valid.game().updatedAt }),
    );
  });

  // @req SYNC-003
  it("rejects edits to a stored record", async () => {
    await assertSucceeds(setDoc(doc(alice(), path), valid.game()));
    await assertFails(setDoc(doc(alice(), path), { ...valid.game(), durationMs: 1 }));
  });
});
