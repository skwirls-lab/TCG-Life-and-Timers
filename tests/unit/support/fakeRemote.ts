/** In-memory RemotePort fake for the PAY unit tests (checkout, entitlement sync, share links). */
import type { RemotePort, RemoteSnap } from "@/lib/entitlements/remote";

type Listener = { path: string; next: (s: RemoteSnap) => void; error: (e: unknown) => void };

export interface FakeRemote extends RemotePort {
  docs: Map<string, Record<string, unknown>>;
  listeners: Listener[];
  calls: { name: string; data: unknown }[];
  /** Write a doc and notify listeners (as the server / an extension would). */
  serverWrite(path: string, data: Record<string, unknown> | null, fromCache?: boolean): void;
  failNext: { setDoc?: unknown; addDoc?: unknown; call?: unknown; getDoc?: unknown };
  callResult: unknown;
}

export function fakeRemote(): FakeRemote {
  const docs = new Map<string, Record<string, unknown>>();
  const listeners: Listener[] = [];
  let seq = 0;
  const snap = (path: string, fromCache = false): RemoteSnap => {
    const d = docs.get(path);
    return { exists: d !== undefined, data: d ?? null, fromCache };
  };
  const take = (k: keyof FakeRemote["failNext"]) => {
    const e = remote.failNext[k];
    remote.failNext[k] = undefined;
    if (e !== undefined) throw e;
  };
  const remote: FakeRemote = {
    docs,
    listeners,
    calls: [],
    failNext: {},
    callResult: undefined,
    async addDoc(col, data) {
      take("addDoc");
      const id = `doc${++seq}`;
      docs.set(`${col}/${id}`, { ...data });
      return id;
    },
    async setDoc(path, data, serverTimestamps = []) {
      take("setDoc");
      const full: Record<string, unknown> = { ...data };
      for (const k of serverTimestamps) full[k] = "SERVER_TIME";
      docs.set(path, full);
    },
    async getDoc(path) {
      take("getDoc");
      return snap(path);
    },
    async deleteDoc(path) {
      docs.delete(path);
    },
    async queryEq(col, field, value) {
      const out: { id: string; data: Record<string, unknown> }[] = [];
      for (const [path, data] of docs) {
        const rest = path.slice(col.length + 1);
        if (path.startsWith(`${col}/`) && !rest.includes("/") && data[field] === value)
          out.push({ id: rest, data });
      }
      return out;
    },
    onDoc(path, next, error) {
      const l = { path, next, error };
      listeners.push(l);
      return () => {
        const i = listeners.indexOf(l);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    async call(name, data) {
      remote.calls.push({ name, data });
      take("call");
      return remote.callResult;
    },
    serverWrite(path, data, fromCache = false) {
      if (data === null) docs.delete(path);
      else docs.set(path, { ...(docs.get(path) ?? {}), ...data });
      for (const l of [...listeners]) if (l.path === path) l.next(snap(path, fromCache));
    },
  };
  return remote;
}
