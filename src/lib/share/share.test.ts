// @req CUS-007 @req SEC-005
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Preset } from "@/engine";
import type { AuthUser } from "@/lib/auth/types";
import { exportPreset, getCustomPreset, isCustomPresetId, toCustom } from "@/lib/customPresets";
import { getDb } from "@/lib/db";
import { getBuiltInPreset } from "@/presets";
import { fakeRemote } from "../../../tests/unit/support/fakeRemote";
import { SHARE_ALPHABET, generateShareCode, isShareCode } from "./code";
import {
  MAX_CODE_ATTEMPTS,
  createShareLink,
  deleteShare,
  deliverShareLink,
  fetchSharedPreset,
  importShared,
  listMyShares,
  shareData,
  shareUrl,
} from "./share";

const user: AuthUser = {
  uid: "owner1",
  email: null,
  displayName: null,
  photoURL: null,
  isAnonymous: true,
};

/** A custom preset the owner made from a built-in. */
function ownPreset(name = "Lore Race"): Preset {
  return toCustom({ ...getBuiltInPreset("mtg.commander")!, name }, "custom.abc123");
}

/** Bytes from a fixed list (then zeros = 'A'). */
function bytes(...list: number[]) {
  const queue = [...list];
  return (n: number) => Uint8Array.from({ length: n }, () => queue.shift() ?? 0);
}

afterEach(async () => {
  await getDb().presets.clear();
});

describe("share codes", () => {
  // @req CUS-007
  it("are 8 chars from [A-Za-z0-9] using crypto randomness", () => {
    for (let i = 0; i < 50; i++) {
      const c = generateShareCode();
      expect(c).toMatch(/^[A-Za-z0-9]{8}$/);
      expect(isShareCode(c)).toBe(true);
    }
    expect(SHARE_ALPHABET).toHaveLength(62);
    expect(isShareCode("short")).toBe(false);
    expect(isShareCode("Ab3d-f7h")).toBe(false);
  });

  // @req SEC-005
  it("rejection-samples bytes ≥ 248 (no modulo bias)", () => {
    // 255 and 248 are rejected; 0 → 'A', 61 → '9', 62 → 'A' again.
    expect(generateShareCode(bytes(255, 248, 0, 61, 62, 1, 2, 3, 4, 5))).toBe("A9ABCDEF");
    // a source that only returns rejected bytes first still terminates once valid bytes come
    let calls = 0;
    const flaky = (n: number) => Uint8Array.from({ length: n }, () => (calls++ < 16 ? 250 : 27));
    expect(generateShareCode(flaky)).toBe("bbbbbbbb");
  });
});

describe("createShareLink (T7.3)", () => {
  // @req CUS-007 @req SEC-005
  it("stores {code, ownerUid, name, game, payload} with a server createdAt", async () => {
    const remote = fakeRemote();
    const p = ownPreset();
    const code = await createShareLink(p, {
      remote,
      ensureUser: async () => user,
      random: bytes(0, 1, 2, 3, 4, 5, 6, 7),
    });
    expect(code).toBe("ABCDEFGH");
    expect(remote.docs.get("sharedPresets/ABCDEFGH")).toEqual({
      code: "ABCDEFGH",
      ownerUid: "owner1",
      name: "Lore Race",
      game: p.game,
      payload: exportPreset(p),
      createdAt: "SERVER_TIME",
    });
    expect(shareUrl("https://app.test", code)).toBe("https://app.test/p/ABCDEFGH");
  });

  // @req SEC-005
  it("retries on a code collision and never overwrites an existing share", async () => {
    const remote = fakeRemote();
    remote.docs.set("sharedPresets/AAAAAAAA", { ownerUid: "someone-else" });
    // first code AAAAAAAA (taken) → second code BBBBBBBB
    const random = bytes(...Array<number>(16).fill(0), ...Array<number>(8).fill(1));
    const code = await createShareLink(ownPreset(), {
      remote,
      ensureUser: async () => user,
      random,
    });
    expect(code).toBe("BBBBBBBB");
    expect(remote.docs.get("sharedPresets/AAAAAAAA")).toEqual({ ownerUid: "someone-else" });
  });

  it("retries when a write loses a race (permission-denied) and gives up after N attempts", async () => {
    const remote = fakeRemote();
    remote.failNext.setDoc = { code: "permission-denied" };
    const code = await createShareLink(ownPreset(), { remote, ensureUser: async () => user });
    expect(isShareCode(code)).toBe(true);

    const always = fakeRemote();
    always.setDoc = vi.fn(async () => {
      throw { code: "permission-denied" };
    });
    await expect(
      createShareLink(ownPreset(), { remote: always, ensureUser: async () => user }),
    ).rejects.toEqual({ code: "permission-denied" });
    expect(always.setDoc).toHaveBeenCalledTimes(MAX_CODE_ATTEMPTS);

    const taken = fakeRemote();
    taken.getDoc = async () => ({ exists: true, data: {}, fromCache: false });
    await expect(
      createShareLink(ownPreset(), { remote: taken, ensureUser: async () => user }),
    ).rejects.toThrow("could not allocate");
  });

  it("propagates other errors and needs a cloud user", async () => {
    const remote = fakeRemote();
    remote.failNext.setDoc = new Error("unavailable");
    await expect(
      createShareLink(ownPreset(), { remote, ensureUser: async () => user }),
    ).rejects.toThrow("unavailable");
    await expect(
      createShareLink(ownPreset(), { remote, ensureUser: async () => null }),
    ).rejects.toThrow("cloud not configured");
  });

  // @req SEC-005
  it("rejects payloads with embedded images (LEG-005)", () => {
    const p = { ...ownPreset(), description: "art: data:image/png;base64,AAAA" };
    expect(() => shareData(p, "ABCDEFGH", "u")).toThrow();
  });
});

describe("opening and importing a share", () => {
  // @req CUS-007
  it("maps the payload to a fresh custom copy owned by the importer", async () => {
    const remote = fakeRemote();
    const original = ownPreset("Shared Thing");
    remote.docs.set("sharedPresets/ABCDEFGH", shareData(original, "ABCDEFGH", "owner1"));
    const r = await fetchSharedPreset("ABCDEFGH", remote);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.shared.ownerUid).toBe("owner1");
    expect(r.shared.preset.name).toBe("Shared Thing");
    expect(r.shared.preset.id).not.toBe(original.id);
    expect(isCustomPresetId(r.shared.preset.id)).toBe(true);
    expect(r.shared.preset.builtIn).toBe(false);
    expect(r.shared.preset.version).toBe(1);
    expect(r.shared.preset.counters).toEqual(original.counters);

    const saved = await importShared(r.shared);
    expect(await getCustomPreset(saved.id)).toMatchObject({ name: "Shared Thing" });
    // editing the copy never touches the share
    expect(JSON.parse(String(remote.docs.get("sharedPresets/ABCDEFGH")!.payload)).preset.id).toBe(
      original.id,
    );
  });

  it("reports missing and invalid shares", async () => {
    const remote = fakeRemote();
    expect(await fetchSharedPreset("nope", remote)).toEqual({ status: "notFound" });
    expect(await fetchSharedPreset("ZZZZZZZZ", remote)).toEqual({ status: "notFound" });
    remote.docs.set("sharedPresets/BADBADBA", { payload: "{" });
    expect((await fetchSharedPreset("BADBADBA", remote)).status).toBe("invalid");
    remote.docs.set("sharedPresets/NOPAYLOA", { name: "x" });
    expect(await fetchSharedPreset("NOPAYLOA", remote)).toEqual({
      status: "invalid",
      errors: ["missing payload"],
    });
  });

  it("lists and deletes the owner's shares", async () => {
    const remote = fakeRemote();
    remote.docs.set("sharedPresets/BBBBBBBB", { code: "BBBBBBBB", ownerUid: "u", name: "Zed" });
    remote.docs.set("sharedPresets/AAAAAAAA", {
      code: "AAAAAAAA",
      ownerUid: "u",
      name: "Alpha",
      game: "G",
    });
    remote.docs.set("sharedPresets/CCCCCCCC", { ownerUid: "other", name: "Other" });
    expect(await listMyShares("u", remote)).toEqual([
      { code: "AAAAAAAA", name: "Alpha", game: "G" },
      { code: "BBBBBBBB", name: "Zed", game: "" },
    ]);
    await deleteShare("AAAAAAAA", remote);
    expect((await listMyShares("u", remote)).map((s) => s.code)).toEqual(["BBBBBBBB"]);
  });
});

describe("deliverShareLink", () => {
  it("prefers the Web Share API, falling back to the clipboard", async () => {
    const share = vi.fn(async () => {});
    const writeText = vi.fn(async () => {});
    expect(await deliverShareLink("u", "t", { share, clipboard: { writeText } })).toBe("shared");
    expect(share).toHaveBeenCalledWith({ url: "u", title: "t" });
    expect(await deliverShareLink("u", "t", { clipboard: { writeText } })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("u");
  });

  it("handles cancel, failures and missing APIs", async () => {
    const abort = Object.assign(new Error("x"), { name: "AbortError" });
    const denied = Object.assign(new Error("x"), { name: "NotAllowedError" });
    const writeText = vi.fn(async () => {});
    expect(await deliverShareLink("u", "t", { share: () => Promise.reject(abort) })).toBe(
      "cancelled",
    );
    expect(
      await deliverShareLink("u", "t", {
        share: () => Promise.reject(denied),
        clipboard: { writeText },
      }),
    ).toBe("copied");
    expect(
      await deliverShareLink("u", "t", { clipboard: { writeText: () => Promise.reject(denied) } }),
    ).toBe("none");
    expect(await deliverShareLink("u", "t", {})).toBe("none");
  });
});
