// Firestore rules outside users/**: Stripe server-only data, sharedPresets, feedback, default deny.
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ALICE, BOB, makeEnv, valid } from "./helpers";

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

describe("Stripe server-only data (SEC-002, D-082)", () => {
  // @req SEC-002
  // @req SEC-006
  it("stripeEvents/** is inaccessible to every client", async () => {
    await seed("stripeEvents/evt_1", { type: "invoice.paid" });
    for (const db of [alice(), bob(), anon()]) {
      await assertFails(getDoc(doc(db, "stripeEvents/evt_1")));
      await assertFails(getDocs(collection(db, "stripeEvents")));
      await assertFails(setDoc(doc(db, "stripeEvents/evt_2"), { type: "invoice.paid" }));
      await assertFails(deleteDoc(doc(db, "stripeEvents/evt_1")));
    }
  });

  // @req SEC-002
  // @req SEC-006
  it("the old extension paths (customers/**) are closed: no reads, no checkout writes", async () => {
    await seed("customers/alice", { stripeId: "cus_1" });
    await seed("customers/alice/subscriptions/sub1", { status: "active" });
    await assertFails(getDoc(doc(alice(), "customers/alice")));
    await assertFails(getDocs(collection(alice(), "customers/alice/subscriptions")));
    await assertFails(
      addDoc(collection(alice(), "customers/alice/checkout_sessions"), {
        price: "price_123abc",
        success_url: "https://example.com/pro",
        cancel_url: "https://example.com/pro",
      }),
    );
    await assertFails(
      setDoc(doc(alice(), "customers/alice/subscriptions/sub1"), { status: "active" }),
    );
  });
});

describe("sharedPresets/{code} (SEC-005, CUS-007)", () => {
  const code = "Ab3dEf7h";
  const path = `sharedPresets/${code}`;
  const seeded = () => ({ ...valid.share(code, ALICE), createdAt: Timestamp.now() });

  // @req SEC-005
  // @req CUS-007
  it("a signed-in user can create a share they own", async () => {
    await assertSucceeds(setDoc(doc(alice(), path), valid.share(code, ALICE)));
  });

  // @req SEC-005
  it("cannot create a share owned by someone else or while signed out", async () => {
    await assertFails(setDoc(doc(bob(), path), valid.share(code, ALICE)));
    await assertFails(setDoc(doc(anon(), path), valid.share(code, ALICE)));
  });

  // @req SEC-005
  it("validates the code, shape and payload size", async () => {
    await assertFails(setDoc(doc(alice(), "sharedPresets/short"), valid.share("short", ALICE)));
    await assertFails(
      setDoc(doc(alice(), "sharedPresets/Ab3d-f7h"), valid.share("Ab3d-f7h", ALICE)),
    );
    await assertFails(setDoc(doc(alice(), path), valid.share("Zz3dEf7h", ALICE)));
    await assertFails(setDoc(doc(alice(), path), { ...valid.share(code, ALICE), extra: true }));
    await assertFails(
      setDoc(doc(alice(), path), {
        ...valid.share(code, ALICE),
        payload: "x".repeat(200 * 1024 + 1),
      }),
    );
    await assertFails(
      setDoc(doc(alice(), path), { ...valid.share(code, ALICE), createdAt: Timestamp.now() }),
    );
  });

  // @req LEG-005
  it("share payloads cannot embed images", async () => {
    await assertFails(
      setDoc(doc(alice(), path), {
        ...valid.share(code, ALICE),
        payload: JSON.stringify({ art: "data:image/png;base64,AAAA" }),
      }),
    );
    await assertFails(
      setDoc(doc(alice(), path), {
        ...valid.share(code, ALICE),
        payload: JSON.stringify({
          art: "https://firebasestorage.googleapis.com/v0/b/x/o/users%2Falice%2Fart%2Fa1.webp",
        }),
      }),
    );
  });

  // @req SEC-005
  // @req CUS-007
  it("anyone can read a share by code", async () => {
    await seed(path, seeded());
    await assertSucceeds(getDoc(doc(anon(), path)));
    await assertSucceeds(getDoc(doc(bob(), path)));
  });

  // @req SEC-005
  it("listing is limited to the caller's own shares", async () => {
    await seed(path, seeded());
    const mine = query(collection(alice(), "sharedPresets"), where("ownerUid", "==", ALICE));
    await assertSucceeds(getDocs(mine));
    await assertFails(getDocs(collection(anon(), "sharedPresets")));
    await assertFails(getDocs(collection(bob(), "sharedPresets")));
  });

  // @req SEC-005
  it("shares are immutable, even for the owner", async () => {
    await seed(path, seeded());
    await assertFails(updateDoc(doc(alice(), path), { name: "Changed" }));
    await assertFails(setDoc(doc(alice(), path), valid.share(code, ALICE)));
  });

  // @req SEC-005
  it("only the owner can delete a share", async () => {
    await seed(path, seeded());
    await assertFails(deleteDoc(doc(bob(), path)));
    await assertFails(deleteDoc(doc(anon(), path)));
    await assertSucceeds(deleteDoc(doc(alice(), path)));
  });
});

describe("feedback/{id} (SET-041, SET-042)", () => {
  // @req SET-041
  it("guests and signed-in users can send feedback", async () => {
    await assertSucceeds(addDoc(collection(anon(), "feedback"), valid.feedback()));
    await assertSucceeds(
      addDoc(collection(alice(), "feedback"), {
        ...valid.feedback(),
        category: "idea",
        email: "a@example.com",
        uid: ALICE,
      }),
    );
  });

  // @req SET-042
  it("accepts diagnostics up to 200 KB and rejects larger", async () => {
    const diag = JSON.stringify({ events: [] });
    await assertSucceeds(
      addDoc(collection(anon(), "feedback"), { ...valid.feedback(), diagnostics: diag }),
    );
    await assertFails(
      addDoc(collection(anon(), "feedback"), {
        ...valid.feedback(),
        diagnostics: "x".repeat(200 * 1024 + 1),
      }),
    );
  });

  // @req SET-041
  it("validates category, text length, extra keys and uid spoofing", async () => {
    await assertFails(
      addDoc(collection(anon(), "feedback"), { ...valid.feedback(), category: "spam" }),
    );
    await assertFails(
      addDoc(collection(anon(), "feedback"), { ...valid.feedback(), text: "x".repeat(4001) }),
    );
    await assertFails(addDoc(collection(anon(), "feedback"), { ...valid.feedback(), text: "" }));
    await assertFails(
      addDoc(collection(anon(), "feedback"), { ...valid.feedback(), priority: "high" }),
    );
    await assertFails(addDoc(collection(anon(), "feedback"), { ...valid.feedback(), uid: ALICE }));
    await assertFails(addDoc(collection(bob(), "feedback"), { ...valid.feedback(), uid: ALICE }));
  });

  // @req SET-041
  it("feedback cannot be read, updated or deleted by clients", async () => {
    await seed("feedback/f1", { ...valid.feedback(), uid: ALICE, createdAt: Timestamp.now() });
    await assertFails(getDoc(doc(alice(), "feedback/f1")));
    await assertFails(getDocs(collection(anon(), "feedback")));
    await assertFails(updateDoc(doc(alice(), "feedback/f1"), { text: "edited" }));
    await assertFails(deleteDoc(doc(alice(), "feedback/f1")));
  });
});

describe("default deny", () => {
  // @req SEC-001
  it("unknown top-level collections are denied", async () => {
    await assertFails(setDoc(doc(alice(), "admin/config"), { x: 1 }));
    await assertFails(getDoc(doc(alice(), "admin/config")));
  });
});
