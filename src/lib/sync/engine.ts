/**
 * Bidirectional sync engine (T4.3: ARCH-007, SYNC-002, SYNC-004).
 *
 * Per collection it keeps:
 * - a remote cache fed by a full-collection listener (initial pull + realtime updates),
 * - a persisted shadow (last agreed state per document, see ./decide.ts),
 * and globally a persisted pending-ops queue (offline writes), flushed in order while online with
 * exponential backoff on transient failures. Permanent failures (rules / validation) are dropped,
 * remembered (so they are not retried forever) and surfaced as an error status.
 *
 * Nothing is reconciled for a collection until the server has confirmed its first snapshot, so a
 * device that starts offline never overwrites newer cloud data with stale local rows.
 */
import { decide, type ShadowEntry } from "./decide";
import { stableStringify } from "./json";
import type {
  CollectionSpec,
  KvStore,
  NetworkMonitor,
  SyncItem,
  SyncStatus,
  Timers,
  Unsubscribe,
} from "./types";

export interface PendingOp extends SyncItem {
  c: string;
}

export interface SyncEngineOptions {
  /** Namespace for persisted state (the signed-in uid). */
  scope: string;
  collections: CollectionSpec[];
  kv: KvStore;
  network: NetworkMonitor;
  timers?: Timers;
  now?: () => number;
  onStatus?: (status: SyncStatus) => void;
  log?: (message: string, detail?: unknown) => void;
  /** Local-change debounce (ms). */
  debounceMs?: number;
  backoff?: { baseMs: number; maxMs: number };
}

export interface SyncEngine {
  start(): Promise<void>;
  stop(): void;
  /** Push pending ops now (no-op while offline). */
  flush(): Promise<void>;
  /** Re-run reconciliation of every ready collection. */
  reconcileAll(): Promise<void>;
  status(): SyncStatus;
  /** Resolves once no reconcile, flush or debounce is outstanding (tests and UI). */
  whenIdle(): Promise<void>;
}

const TRANSIENT = new Set([
  "unavailable",
  "deadline-exceeded",
  "resource-exhausted",
  "aborted",
  "internal",
  "unknown",
  "cancelled",
]);

/** Network-ish failures are retried; rules/validation failures are not. */
export function isTransientError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code: unknown }).code).replace(/^firestore\//, "");
    return TRANSIENT.has(code);
  }
  return err instanceof TypeError; // fetch/network errors
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export const kvKeys = {
  queue: (scope: string) => `sync:${scope}:queue`,
  shadow: (scope: string, c: string) => `sync:${scope}:shadow:${c}`,
  rejected: (scope: string, c: string) => `sync:${scope}:rejected:${c}`,
  lastSyncedAt: (scope: string) => `sync:${scope}:lastSyncedAt`,
  prefix: "sync:",
};

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function createSyncEngine(opts: SyncEngineOptions): SyncEngine {
  const { scope, kv, network } = opts;
  const timers = opts.timers ?? defaultTimers;
  const now = opts.now ?? (() => Date.now());
  const log = opts.log ?? (() => {});
  const debounceMs = opts.debounceMs ?? 250;
  const backoff = opts.backoff ?? { baseMs: 1000, maxMs: 60_000 };
  const specs = new Map(opts.collections.map((c) => [c.name, c]));

  const shadows = new Map<string, Map<string, ShadowEntry>>();
  const rejected = new Map<string, Map<string, string>>();
  const remoteCache = new Map<string, Map<string, SyncItem>>();
  const ready = new Set<string>();
  let queue = new Map<string, PendingOp>();
  const unsubs: Unsubscribe[] = [];
  const debounces = new Map<string, unknown>();
  let retryTimer: unknown = null;
  let attempt = 0;
  let running = false;
  let flushing: Promise<void> | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  let busy = 0;
  /** last write failure (cleared by a successful write) */
  let writeError: string | null = null;
  /** last listener failure (cleared by the next server snapshot) */
  let listenError: string | null = null;
  let retrying = false;
  let lastSyncedAt: number | null = null;
  let lastEmitted = "";

  const opKey = (c: string, id: string) => `${c}/${id}`;

  /** Serialise all state mutations. */
  function run<T>(fn: () => Promise<T>): Promise<T> {
    busy += 1;
    const p = chain.then(fn);
    chain = p.catch(() => {}).finally(() => (busy -= 1));
    return p;
  }

  function status(): SyncStatus {
    const pending = queue.size;
    const error = writeError ?? listenError;
    let state: SyncStatus["state"];
    if (!running) state = "idle";
    else if (!network.isOnline()) state = "offline";
    else if (retrying || (error && pending === 0)) state = "error";
    else if (flushing || pending > 0 || ready.size < specs.size) state = "syncing";
    else state = "idle";
    return { state, lastSyncedAt, pending, error };
  }

  function emit() {
    const s = status();
    const key = JSON.stringify(s);
    if (key === lastEmitted) return;
    lastEmitted = key;
    opts.onStatus?.(s);
  }

  async function markSyncedIfClean() {
    if (running && network.isOnline() && queue.size === 0 && ready.size === specs.size) {
      lastSyncedAt = now();
      await kv.set(kvKeys.lastSyncedAt(scope), lastSyncedAt);
    }
  }

  async function persistQueue() {
    await kv.set(kvKeys.queue(scope), [...queue.values()]);
  }
  async function persistShadow(c: string) {
    await kv.set(kvKeys.shadow(scope, c), Object.fromEntries(shadows.get(c) ?? new Map()));
  }
  async function persistRejected(c: string) {
    await kv.set(kvKeys.rejected(scope, c), Object.fromEntries(rejected.get(c) ?? new Map()));
  }

  const rejectKey = (item: SyncItem) =>
    stableStringify({ d: item.data, x: item.deleted, p: item.parent ?? null });

  async function reconcile(c: string): Promise<void> {
    const spec = specs.get(c);
    if (!spec || !running || !ready.has(c)) return;
    await run(async () => {
      if (!running) return;
      const localItems = await spec.local.list();
      const local = new Map(localItems.map((i) => [i.id, i]));
      const remote = remoteCache.get(c) ?? new Map<string, SyncItem>();
      const shadow = shadows.get(c)!;
      const rej = rejected.get(c)!;
      const ids = new Set<string>([...local.keys(), ...remote.keys(), ...shadow.keys()]);
      for (const op of queue.values()) if (op.c === c) ids.add(op.id);
      let shadowDirty = false;
      let queueDirty = false;
      const t = now();
      for (const id of ids) {
        const d = decide(id, local.get(id), remote.get(id), shadow.get(id), {
          writeOnce: spec.writeOnce,
          noDeletes: spec.noDeletes,
          now: t,
        });
        const k = opKey(c, id);
        if (d.kind === "push") {
          if (rej.get(id) === rejectKey(d.item)) continue; // rejected before: don't retry forever
          const prev = queue.get(k);
          const next: PendingOp = { ...d.item, c };
          if (!prev || stableStringify(prev) !== stableStringify(next)) {
            queue.delete(k);
            queue.set(k, next);
            queueDirty = true;
          }
          continue;
        }
        if (d.kind === "none") {
          if (!d.localChanged && queue.delete(k)) queueDirty = true;
          continue;
        }
        // applyRemote / adopt: the remote version is now the agreed state.
        if (queue.delete(k)) queueDirty = true;
        if (d.kind === "applyRemote") {
          try {
            await spec.local.apply(d.item);
          } catch (err) {
            log(`sync: could not apply ${c}/${id} locally`, err);
            continue;
          }
        }
        if (d.kind === "applyRemote" && d.gone) shadow.delete(id);
        else
          shadow.set(id, {
            data: d.item.data,
            deleted: d.item.deleted,
            parent: d.item.parent,
            local: d.kind === "applyRemote" ? d.item.updatedAt : (local.get(id)?.updatedAt ?? t),
            remote: d.item.updatedAt,
          });
        shadowDirty = true;
      }
      if (shadowDirty) await persistShadow(c);
      if (queueDirty) await persistQueue();
    });
    emit();
    void flush();
  }

  function scheduleReconcile(c: string) {
    if (!running) return;
    const prev = debounces.get(c);
    if (prev !== undefined) timers.clearTimeout(prev);
    debounces.set(
      c,
      timers.setTimeout(() => {
        debounces.delete(c);
        void reconcile(c);
      }, debounceMs),
    );
  }

  function scheduleRetry() {
    if (retryTimer !== null || !running) return;
    const delay = Math.min(backoff.baseMs * 2 ** attempt, backoff.maxMs);
    attempt += 1;
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      void flush();
    }, delay);
  }

  async function flushLoop(): Promise<void> {
    while (running && network.isOnline()) {
      const op = [...queue.values()].find((o) => ready.has(o.c));
      if (!op) break;
      const spec = specs.get(op.c);
      if (!spec) {
        queue.delete(opKey(op.c, op.id));
        await persistQueue();
        continue;
      }
      try {
        const { c: _c, ...item } = op;
        await spec.remote.write(item);
        attempt = 0;
        retrying = false;
        writeError = null;
        await run(async () => {
          const k = opKey(op.c, op.id);
          if (queue.get(k) === op) queue.delete(k);
          const shadow = shadows.get(op.c)!;
          const prev = shadow.get(op.id);
          shadow.set(op.id, {
            data: op.data,
            deleted: op.deleted,
            parent: op.parent,
            local: op.updatedAt,
            remote: prev?.remote ?? 0,
          });
          await persistShadow(op.c);
          await persistQueue();
        });
      } catch (err) {
        if (isTransientError(err)) {
          log(`sync: transient failure writing ${op.c}/${op.id}; will retry`, err);
          writeError = errorMessage(err);
          retrying = true;
          scheduleRetry();
          break;
        }
        log(`sync: ${op.c}/${op.id} was rejected`, err);
        writeError = errorMessage(err);
        await run(async () => {
          const k = opKey(op.c, op.id);
          if (queue.get(k) === op) queue.delete(k);
          rejected.get(op.c)!.set(op.id, rejectKey(op));
          await persistRejected(op.c);
          await persistQueue();
        });
      }
      emit();
    }
  }

  function flush(): Promise<void> {
    if (!running) return Promise.resolve();
    if (flushing) return flushing;
    busy += 1;
    flushing = flushLoop()
      .then(markSyncedIfClean)
      .catch((err: unknown) => log("sync: flush failed", err))
      .finally(() => {
        flushing = null;
        busy -= 1;
        emit();
      });
    emit();
    return flushing;
  }

  function subscribeRemote(spec: CollectionSpec, tries = 0) {
    let unsub: Unsubscribe | null = null;
    unsub = spec.remote.subscribe(
      (snap) => {
        if (!running) return;
        remoteCache.set(spec.name, new Map(snap.items.map((i) => [i.id, i])));
        if (snap.fromServer) {
          tries = 0;
          listenError = null;
          const first = !ready.has(spec.name);
          ready.add(spec.name);
          if (first) emit();
          void reconcile(spec.name).then(markSyncedIfClean).then(emit);
        }
      },
      (err) => {
        log(`sync: listener for ${spec.name} failed`, err);
        listenError = errorMessage(err);
        emit();
        unsub?.();
        if (!running) return;
        const delay = Math.min(backoff.baseMs * 2 ** tries, backoff.maxMs);
        const h = timers.setTimeout(() => {
          if (running) subscribeRemote(spec, tries + 1);
        }, delay);
        unsubs.push(() => timers.clearTimeout(h));
      },
    );
    unsubs.push(() => unsub?.());
  }

  async function loadState() {
    const q = await kv.get(kvKeys.queue(scope));
    queue = new Map(
      (Array.isArray(q) ? (q as PendingOp[]) : [])
        .filter((o) => o && typeof o.id === "string" && specs.has(o.c))
        .map((o) => [opKey(o.c, o.id), o]),
    );
    for (const c of specs.keys()) {
      const s = await kv.get(kvKeys.shadow(scope, c));
      shadows.set(
        c,
        new Map(
          Object.entries((s && typeof s === "object" ? s : {}) as Record<string, ShadowEntry>),
        ),
      );
      const r = await kv.get(kvKeys.rejected(scope, c));
      rejected.set(
        c,
        new Map(Object.entries((r && typeof r === "object" ? r : {}) as Record<string, string>)),
      );
    }
    const last = await kv.get(kvKeys.lastSyncedAt(scope));
    lastSyncedAt = typeof last === "number" ? last : null;
  }

  return {
    async start() {
      if (running) return;
      running = true;
      await loadState();
      emit();
      unsubs.push(
        network.subscribe((online) => {
          if (online) {
            attempt = 0;
            if (retryTimer !== null) timers.clearTimeout(retryTimer);
            retryTimer = null;
            void flush();
          }
          emit();
        }),
      );
      for (const spec of specs.values()) {
        unsubs.push(spec.local.subscribe(() => scheduleReconcile(spec.name)));
        subscribeRemote(spec);
      }
    },
    stop() {
      running = false;
      for (const u of unsubs.splice(0)) u();
      for (const h of debounces.values()) timers.clearTimeout(h);
      debounces.clear();
      if (retryTimer !== null) timers.clearTimeout(retryTimer);
      retryTimer = null;
      ready.clear();
      remoteCache.clear();
      retrying = false;
      emit();
    },
    flush,
    async reconcileAll() {
      for (const c of specs.keys()) await reconcile(c);
    },
    status,
    async whenIdle() {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        await chain;
        if (flushing) await flushing;
        await new Promise((r) => setTimeout(r, 2));
        if (busy === 0 && !flushing && debounces.size === 0) return;
      }
    },
  };
}
