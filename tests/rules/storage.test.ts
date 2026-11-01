// Cloud Storage rules for uploaded art (SEC-004, ART-022, ART-025, LEG-005).
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { ALICE, BOB, makeEnv } from "./helpers";

let env: RulesTestEnvironment;
const storageOf = (uid: string | null) =>
  (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage();

const small = new Uint8Array(1024);
const webp = { contentType: "image/webp" };
const path = "users/alice/art/a1.webp";

async function seedObject(p: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), p), small, webp);
  });
}

beforeAll(async () => {
  env = await makeEnv();
});
beforeEach(async () => env.clearStorage());
afterAll(async () => env?.cleanup());

describe("storage: users/{uid}/art (SEC-004)", () => {
  // @req SEC-004
  // @req ART-022
  it("owner can upload, read and delete an image", async () => {
    const s = storageOf(ALICE);
    await assertSucceeds(uploadBytes(ref(s, path), small, webp));
    await assertSucceeds(getBytes(ref(s, path)));
    await assertSucceeds(deleteObject(ref(s, path)));
  });

  // @req SEC-004
  // @req SEC-006
  it("another user cannot upload into alice's folder", async () => {
    await assertFails(uploadBytes(ref(storageOf(BOB), path), small, webp));
  });

  // @req SEC-004
  // @req LEG-005
  it("uploaded images are private: other users and guests cannot read them", async () => {
    await seedObject(path);
    await assertFails(getBytes(ref(storageOf(BOB), path)));
    await assertFails(getBytes(ref(storageOf(null), path)));
  });

  // @req SEC-004
  it("another user cannot delete alice's image", async () => {
    await seedObject(path);
    await assertFails(deleteObject(ref(storageOf(BOB), path)));
  });

  // @req SEC-004
  // @req ART-025
  it("rejects non-image content types", async () => {
    const s = storageOf(ALICE);
    await assertFails(
      uploadBytes(ref(s, "users/alice/art/a1.html"), small, { contentType: "text/html" }),
    );
    await assertFails(
      uploadBytes(ref(s, "users/alice/art/a1.bin"), small, {
        contentType: "application/octet-stream",
      }),
    );
  });

  // @req SEC-004
  // @req ART-025
  it("rejects files of 2 MB or more", async () => {
    const s = storageOf(ALICE);
    await assertSucceeds(uploadBytes(ref(s, path), new Uint8Array(2 * 1024 * 1024 - 1), webp));
    await assertFails(uploadBytes(ref(s, path), new Uint8Array(2 * 1024 * 1024), webp));
  });

  // @req SEC-004
  it("everything outside users/{uid}/art is denied", async () => {
    const s = storageOf(ALICE);
    await assertFails(uploadBytes(ref(s, "users/alice/other/x.webp"), small, webp));
    await assertFails(uploadBytes(ref(s, "public/x.webp"), small, webp));
    await assertFails(uploadBytes(ref(storageOf(null), path), small, webp));
  });
});
