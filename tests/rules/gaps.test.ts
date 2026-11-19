// Reviewer B findings, server side (B-4, B-5, B-9): Pro enforcement behind config/billing,
// anonymous / over-quota art uploads, share payload validation, final tombstones.
// @req SEC-001 @req SEC-002 @req SEC-004 @req SEC-005 @req LEG-005 @req ART-024 @req SYNC-003
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { makeEnv, sharePayload, valid } from "./helpers";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await makeEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});
afterAll(async () => env?.cleanup());

const google = { firebase: { sign_in_provider: "google.com" as const } };
const free = () => env.authenticatedContext("freeUser", google);
const pro = () => env.authenticatedContext("proUser", google);
const anonUser = () =>
  env.authenticatedContext("anonUser", { firebase: { sign_in_provider: "anonymous" } });
const full = () => env.authenticatedContext("freeUser", { ...google, artQuotaFull: true });

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngMeta = { contentType: "image/png" };

async function admin(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}
const enablePaywall = (on = true) => admin("config/billing", { paywallEnabled: on });
const grantPro = (uid: string) =>
  admin(`users/${uid}/private/entitlements`, { pro: true, source: "subscription" });

describe("B-4 paywall disabled (default: no config/billing) — everything allowed as before", () => {
  it("a free user can sync game history and create share links", async () => {
    await assertSucceeds(setDoc(doc(free().firestore(), "users/freeUser/games/g1"), valid.game()));
    await assertSucceeds(
      setDoc(
        doc(free().firestore(), "sharedPresets/Abcd1234"),
        valid.share("Abcd1234", "freeUser"),
      ),
    );
  });

  it("paywallEnabled: false behaves like no config", async () => {
    await enablePaywall(false);
    await assertSucceeds(setDoc(doc(free().firestore(), "users/freeUser/games/g1"), valid.game()));
  });

  it("config/billing is publicly readable and never client-writable", async () => {
    await enablePaywall();
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), "config/billing")));
    await assertFails(setDoc(doc(pro().firestore(), "config/billing"), { paywallEnabled: false }));
    await assertFails(setDoc(doc(free().firestore(), "config/other"), { x: 1 }));
  });
});

describe("B-4 paywall enabled — Pro-only cloud features are enforced server-side", () => {
  beforeEach(async () => {
    await enablePaywall();
    await grantPro("proUser");
  });

  it("history sync (games create) requires Pro (PRD §17.2)", async () => {
    await assertFails(setDoc(doc(free().firestore(), "users/freeUser/games/g1"), valid.game()));
    await assertSucceeds(setDoc(doc(pro().firestore(), "users/proUser/games/g1"), valid.game()));
  });

  it("a revoked entitlement (pro: false) no longer syncs history", async () => {
    await admin("users/proUser/private/entitlements", { pro: false, source: "none" });
    await assertFails(setDoc(doc(pro().firestore(), "users/proUser/games/g2"), valid.game()));
  });

  it("share links require Pro (presetShareLinks)", async () => {
    await assertFails(
      setDoc(
        doc(free().firestore(), "sharedPresets/Abcd1234"),
        valid.share("Abcd1234", "freeUser"),
      ),
    );
    await assertSucceeds(
      setDoc(doc(pro().firestore(), "sharedPresets/Abcd1235"), valid.share("Abcd1235", "proUser")),
    );
  });

  it("other owner data (profiles, game types, presets, art metadata) stays free", async () => {
    await assertSucceeds(
      setDoc(doc(free().firestore(), "users/freeUser/profiles/p1"), valid.profile()),
    );
    await assertSucceeds(
      setDoc(doc(free().firestore(), "users/freeUser/art/a1"), valid.art("freeUser")),
    );
    // Saved setups ("Presets"): the free limit of 1 is client-side, like custom game types.
    await assertSucceeds(
      setDoc(doc(free().firestore(), "users/freeUser/setups/s1"), valid.setup()),
    );
    await assertSucceeds(
      setDoc(doc(free().firestore(), "users/freeUser/setups/s2"), valid.setup()),
    );
  });

  it("the art quota counter is owner-readable and never client-writable", async () => {
    await admin("users/freeUser/private/quota", { artCount: 3, artLimit: 10 });
    await assertSucceeds(getDoc(doc(free().firestore(), "users/freeUser/private/quota")));
    await assertFails(getDoc(doc(pro().firestore(), "users/freeUser/private/quota")));
    await assertFails(
      setDoc(doc(free().firestore(), "users/freeUser/private/quota"), { artCount: 0 }),
    );
  });
});

describe("B-4 Storage art: Google accounts only, refused while the quota is full", () => {
  it("an anonymous user cannot upload cloud art (D-059)", async () => {
    await assertFails(
      uploadBytes(ref(anonUser().storage(), "users/anonUser/art/x.png"), png, pngMeta),
    );
  });

  it("a Google user under quota can upload; with artQuotaFull new objects are refused", async () => {
    await assertSucceeds(
      uploadBytes(ref(free().storage(), "users/freeUser/art/a0.png"), png, pngMeta),
    );
    await assertFails(
      uploadBytes(ref(full().storage(), "users/freeUser/art/a1.png"), png, pngMeta),
    );
    // Re-uploading an existing object never grows the count.
    await assertSucceeds(
      uploadBytes(ref(full().storage(), "users/freeUser/art/a0.png"), png, pngMeta),
    );
  });
});

describe("B-5 share payloads must be preset exports; image filter is case-insensitive", () => {
  it("rejects a share whose payload is not a preset export", async () => {
    await assertFails(
      setDoc(doc(anonUser().firestore(), "sharedPresets/Abcd1234"), {
        ...valid.share("Abcd1234", "anonUser"),
        name: "Free crypto at evil.example",
        payload: "x".repeat(200_000),
      }),
    );
    await assertFails(
      setDoc(doc(free().firestore(), "sharedPresets/Abcd1236"), {
        ...valid.share("Abcd1236", "freeUser"),
        payload: JSON.stringify({ format: "other", preset: {} }),
      }),
    );
  });

  it("accepts compact and pretty-printed export envelopes", async () => {
    await assertSucceeds(
      setDoc(doc(free().firestore(), "sharedPresets/Abcd1237"), {
        ...valid.share("Abcd1237", "freeUser"),
        payload: JSON.stringify({ format: "tcg-life-preset", version: 1, preset: { id: "x" } }),
      }),
    );
  });

  it("rejects embedded images in any letter case (LEG-005)", async () => {
    for (const [code, art] of [
      ["Abcd1238", "data:image/png;base64,AAAA"],
      ["Abcd1239", "DATA:IMAGE/png;base64,AAAA"],
      ["Abcd1240", "https://FirebaseStorage.googleapis.com/v0/b/x/o/a.webp"],
    ] as const) {
      await assertFails(
        setDoc(doc(free().firestore(), `sharedPresets/${code}`), {
          ...valid.share(code, "freeUser"),
          payload: sharePayload({ id: "x", art }),
        }),
      );
    }
  });

  it("caps the name at 60 characters", async () => {
    await assertFails(
      setDoc(doc(free().firestore(), "sharedPresets/Abcd1241"), {
        ...valid.share("Abcd1241", "freeUser"),
        name: "n".repeat(61),
      }),
    );
  });
});

describe("B-9 write-once game records (SYNC-003)", () => {
  it("a tombstoned record cannot be resurrected (deleted true -> false)", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/freeUser/games/g1"), {
        ...valid.game(),
        updatedAt: new Date(),
        deleted: true,
      });
    });
    const fs = free().firestore();
    await assertFails(
      updateDoc(doc(fs, "users/freeUser/games/g1"), {
        deleted: false,
        updatedAt: serverTimestamp(),
      }),
    );
    // Re-sending the tombstone is still fine.
    await assertSucceeds(
      updateDoc(doc(fs, "users/freeUser/games/g1"), {
        deleted: true,
        updatedAt: serverTimestamp(),
      }),
    );
  });
});
