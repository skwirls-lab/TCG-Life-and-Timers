// The Firebase-backed RemotePort against a mocked SDK (the real SDK runs in the @emu e2e).
// @req PAY-002 @req CUS-007
import { beforeEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({
  addDoc: vi.fn(async () => ({ id: "new1" })),
  setDoc: vi.fn(async () => {}),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(async () => {}),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  collection: vi.fn((_db: unknown, p: string) => ({ col: p })),
  doc: vi.fn((_db: unknown, p: string) => ({ doc: p })),
  query: vi.fn((c: unknown, w: unknown) => ({ c, w })),
  where: vi.fn((f: string, op: string, v: string) => ({ f, op, v })),
  serverTimestamp: vi.fn(() => "TS"),
}));
const client = vi.hoisted(() => ({
  db: { name: "db" } as unknown,
  fns: { name: "fns" } as unknown,
}));
const callable = vi.hoisted(() => vi.fn());

vi.mock("firebase/firestore", () => fs);
vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => callable),
}));
vi.mock("@/lib/firebase/client", () => ({
  getDb: async () => client.db,
  getFunctionsClient: async () => client.fns,
}));

import { CloudUnavailableError, firebaseRemote } from "./remote";

const snapOf = (data: Record<string, unknown> | null, fromCache = false) => ({
  exists: () => data !== null,
  data: () => data ?? undefined,
  metadata: { fromCache },
});

beforeEach(() => {
  client.db = { name: "db" };
  client.fns = { name: "fns" };
  vi.clearAllMocks();
});

describe("firebaseRemote", () => {
  it("adds, sets (with server timestamps), gets and deletes docs", async () => {
    const r = firebaseRemote();
    expect(await r.addDoc("feedback", { price: "p" })).toBe("new1");
    expect(fs.collection).toHaveBeenCalledWith(client.db, "feedback");

    await r.setDoc("sharedPresets/AAAAAAAA", { code: "AAAAAAAA" }, ["createdAt"]);
    expect(fs.setDoc).toHaveBeenCalledWith(
      { doc: "sharedPresets/AAAAAAAA" },
      { code: "AAAAAAAA", createdAt: "TS" },
    );
    await r.setDoc("x/y", { a: 1 });
    expect(fs.setDoc).toHaveBeenLastCalledWith({ doc: "x/y" }, { a: 1 });

    fs.getDoc.mockResolvedValueOnce(snapOf({ a: 1 }, true));
    expect(await r.getDoc("x/y")).toEqual({ exists: true, data: { a: 1 }, fromCache: true });
    fs.getDoc.mockResolvedValueOnce(snapOf(null));
    expect(await r.getDoc("x/z")).toEqual({ exists: false, data: null, fromCache: false });

    await r.deleteDoc("x/y");
    expect(fs.deleteDoc).toHaveBeenCalledWith({ doc: "x/y" });
  });

  it("queries by equality", async () => {
    fs.getDocs.mockResolvedValueOnce({ docs: [{ id: "c1", data: () => ({ ownerUid: "u" }) }] });
    expect(await firebaseRemote().queryEq("sharedPresets", "ownerUid", "u")).toEqual([
      { id: "c1", data: { ownerUid: "u" } },
    ]);
    expect(fs.where).toHaveBeenCalledWith("ownerUid", "==", "u");
  });

  it("listens with metadata changes and unsubscribes", async () => {
    const unsub = vi.fn();
    let next: ((s: unknown) => void) | undefined;
    fs.onSnapshot.mockImplementationOnce((_ref, _opts, n: (s: unknown) => void) => {
      next = n;
      return unsub;
    });
    const seen: unknown[] = [];
    const stop = firebaseRemote().onDoc("a/b", (s) => seen.push(s), vi.fn());
    await vi.waitFor(() => expect(next).toBeDefined());
    expect(fs.onSnapshot.mock.calls[0]![1]).toEqual({ includeMetadataChanges: true });
    next!(snapOf({ url: "u" }));
    next!(snapOf(null, true));
    expect(seen).toEqual([
      { exists: true, data: { url: "u" }, fromCache: false },
      { exists: false, data: null, fromCache: true },
    ]);
    stop();
    expect(unsub).toHaveBeenCalled();
  });

  it("does not subscribe when stopped before the SDK loaded", async () => {
    const stop = firebaseRemote().onDoc("a/b", vi.fn(), vi.fn());
    stop();
    await new Promise((r) => setTimeout(r, 0));
    expect(fs.onSnapshot).not.toHaveBeenCalled();
  });

  it("calls callables and reports missing cloud config", async () => {
    callable.mockResolvedValueOnce({ data: { url: "https://portal" } });
    expect(await firebaseRemote().call("fn", { a: 1 })).toEqual({ url: "https://portal" });
    expect(callable).toHaveBeenCalledWith({ a: 1 });

    client.fns = null;
    await expect(firebaseRemote().call("fn", {})).rejects.toBeInstanceOf(CloudUnavailableError);
    client.db = null;
    await expect(firebaseRemote().getDoc("a/b")).rejects.toBeInstanceOf(CloudUnavailableError);
    const error = vi.fn();
    firebaseRemote().onDoc("a/b", vi.fn(), error);
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
  });
});
