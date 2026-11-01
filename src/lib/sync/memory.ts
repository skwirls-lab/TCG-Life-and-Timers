/**
 * In-memory adapters for the sync engine (unit tests and emulator-free experiments).
 * `MemoryRemote` imitates Firestore: it stamps a server clock on writes and notifies listeners.
 */
import type {
  KvStore,
  LocalAdapter,
  NetworkMonitor,
  RemoteAdapter,
  RemoteSnapshot,
  SyncItem,
  Unsubscribe,
} from "./types";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class MemoryLocal implements LocalAdapter {
  readonly rows = new Map<string, SyncItem>();
  private listeners = new Set<() => void>();
  applied: SyncItem[] = [];

  async list(): Promise<SyncItem[]> {
    return [...this.rows.values()].map(clone);
  }
  async apply(item: SyncItem): Promise<void> {
    this.applied.push(clone(item));
    if (item.deleted) this.rows.delete(item.id);
    else this.rows.set(item.id, { ...clone(item), deleted: false });
  }
  subscribe(onChange: () => void): Unsubscribe {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }
  /** Simulate a user edit. */
  put(item: Omit<SyncItem, "deleted">): void {
    this.rows.set(item.id, { ...clone(item), deleted: false });
    this.changed();
  }
  remove(id: string): void {
    this.rows.delete(id);
    this.changed();
  }
  changed(): void {
    for (const l of this.listeners) l();
  }
}

export class MemoryRemote implements RemoteAdapter {
  readonly docs = new Map<string, SyncItem>();
  clock = 1_000_000;
  writes: SyncItem[] = [];
  /** Throw this from the next `failCount` writes (null = healthy). */
  failWith: unknown = null;
  failCount = Number.POSITIVE_INFINITY;
  fromServer = true;
  private listeners = new Set<(s: RemoteSnapshot) => void>();
  private errorListeners = new Set<(e: unknown) => void>();

  subscribe(onSnapshot: (s: RemoteSnapshot) => void, onError: (e: unknown) => void): Unsubscribe {
    this.listeners.add(onSnapshot);
    this.errorListeners.add(onError);
    queueMicrotask(() => {
      if (this.listeners.has(onSnapshot)) onSnapshot(this.snapshot());
    });
    return () => {
      this.listeners.delete(onSnapshot);
      this.errorListeners.delete(onError);
    };
  }
  async write(item: SyncItem): Promise<void> {
    if (this.failWith !== null && this.failCount > 0) {
      this.failCount -= 1;
      throw this.failWith;
    }
    this.clock += 1000;
    const stored = { ...clone(item), updatedAt: this.clock };
    this.docs.set(item.id, stored);
    this.writes.push(stored);
    this.emit();
  }
  /** Another device writes directly (server time `updatedAt`, default: the next tick). */
  serverWrite(item: Omit<SyncItem, "updatedAt"> & { updatedAt?: number }): void {
    this.clock = Math.max(this.clock + 1000, item.updatedAt ?? 0);
    this.docs.set(item.id, { ...clone(item), updatedAt: item.updatedAt ?? this.clock });
    this.emit();
  }
  hardDelete(id: string): void {
    this.docs.delete(id);
    this.emit();
  }
  /** Break every listener (like a Firestore listener error). */
  fail(err: unknown): void {
    for (const l of [...this.errorListeners]) l(err);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
  snapshot(): RemoteSnapshot {
    return { items: [...this.docs.values()].map(clone), fromServer: this.fromServer };
  }
  emit(): void {
    const s = this.snapshot();
    for (const l of [...this.listeners]) l(s);
  }
}

export class MemoryKv implements KvStore {
  readonly map = new Map<string, unknown>();
  async get(key: string): Promise<unknown> {
    const v = this.map.get(key);
    return v === undefined ? undefined : clone(v);
  }
  async set(key: string, value: unknown): Promise<void> {
    this.map.set(key, clone(value));
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

export class MemoryNetwork implements NetworkMonitor {
  online = true;
  private listeners = new Set<(o: boolean) => void>();
  isOnline(): boolean {
    return this.online;
  }
  subscribe(onChange: (o: boolean) => void): Unsubscribe {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }
  set(online: boolean): void {
    this.online = online;
    for (const l of [...this.listeners]) l(online);
  }
}
