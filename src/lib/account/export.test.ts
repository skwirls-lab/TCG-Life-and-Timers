// @req AUTH-005 @req AUTH-006
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TcgDb } from "@/lib/db";
import {
  buildExport,
  deleteAccount,
  downloadExport,
  EXPORT_FORMAT,
  exportFilename,
} from "./export";

let db: TcgDb;
let n = 0;
beforeEach(async () => {
  db = new TcgDb(`export-${++n}`);
  await db.open();
  await db.profiles.put({ id: "p1", schemaVersion: 1, name: "A", normalizedName: "a" });
});
afterEach(async () => {
  db.close();
  await db.delete();
});

describe("export", () => {
  // @req AUTH-006
  it("includes every local table and art metadata without blobs", async () => {
    // fake-indexeddb can't structured-clone jsdom Blobs: serve the art rows directly.
    vi.spyOn(db.art, "toArray").mockResolvedValue([
      { id: "a1", blob: new Blob(["12345"], { type: "image/webp" }), meta: { name: "x" } },
      { id: "a2", blob: undefined as never, meta: undefined as never },
    ]);
    const out = await buildExport(db, Date.UTC(2026, 10, 1));
    expect(out).toMatchObject({
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: "2026-11-01T00:00:00.000Z",
      profiles: [{ id: "p1" }],
      decks: [],
      presets: [],
      settings: [],
      records: [],
    });
    expect(out.appVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(out.art).toEqual([
      { id: "a1", meta: { name: "x" }, bytes: 5, type: "image/webp" },
      { id: "a2", meta: {}, bytes: 0, type: "" },
    ]);
    expect(JSON.stringify(out)).not.toContain("blob");
  });

  it("downloads a dated JSON file", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const click = vi.fn();
    const anchor = { click, remove: vi.fn(), href: "", download: "", rel: "" };
    const env = {
      document: { createElement: () => anchor, body: { appendChild: vi.fn() } } as never,
      url: { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() },
    };
    const name = await downloadExport(db, env, Date.UTC(2026, 0, 2));
    expect(name).toBe("tcgtempo-export-2026-01-02.json");
    expect(anchor).toMatchObject({ href: "blob:x", download: name });
    expect(click).toHaveBeenCalled();
    vi.runAllTimers();
    expect(env.url.revokeObjectURL).toHaveBeenCalledWith("blob:x");
    vi.useRealTimers();
    expect(exportFilename(0)).toBe("tcgtempo-export-1970-01-01.json");
  });
});

describe("deleteAccount", () => {
  // @req AUTH-005
  it("stops sync, calls the callable, then signs out and clears", async () => {
    const order: string[] = [];
    await deleteAccount({
      stopSync: async () => void order.push("stop"),
      callDelete: async () => void order.push("call"),
      signOutAndClear: async () => void order.push("signOut"),
    });
    expect(order).toEqual(["stop", "call", "signOut"]);
  });

  it("does not sign out when the server call fails", async () => {
    const signOutAndClear = vi.fn();
    await expect(
      deleteAccount({
        stopSync: async () => {},
        callDelete: () => Promise.reject(new Error("x")),
        signOutAndClear,
      }),
    ).rejects.toThrow("x");
    expect(signOutAndClear).not.toHaveBeenCalled();
  });
});
