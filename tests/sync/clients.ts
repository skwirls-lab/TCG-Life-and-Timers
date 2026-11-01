/** Emulator clients for the sync tests: one Firebase app + Dexie database per simulated device. */
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import * as fs from "firebase/firestore";
import { TcgDb } from "@/lib/db";
import { fakeGoogleIdToken } from "@/lib/auth/firebaseDriver";
import { startUserSync } from "@/lib/sync/cloudSync";
import type { SyncEngine } from "@/lib/sync/engine";
import type { NetworkMonitor } from "@/lib/sync/types";

export const PROJECT_ID = "demo-tcg-life";
let seq = 0;

export interface Device {
  name: string;
  app: FirebaseApp;
  firestore: fs.Firestore;
  db: TcgDb;
  uid: string;
  engine: SyncEngine | null;
  startSync(opts?: { historySync?: boolean }): Promise<SyncEngine>;
  close(): Promise<void>;
}

export const alwaysOnline: NetworkMonitor = { isOnline: () => true, subscribe: () => () => {} };

/** Unique e-mail per test run so emulator state never leaks between runs. */
export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export async function device(email: string): Promise<Device> {
  const name = `device-${++seq}`;
  const app = initializeApp(
    {
      apiKey: "demo-api-key",
      projectId: PROJECT_ID,
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      appId: "demo-app",
    },
    name,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const cred = await signInWithCredential(
    auth,
    GoogleAuthProvider.credential(fakeGoogleIdToken(email)),
  );
  const firestore = fs.getFirestore(app);
  fs.connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  const db = new TcgDb(`sync-${name}-${Date.now()}`);
  await db.open();
  const d: Device = {
    name,
    app,
    firestore,
    db,
    uid: cred.user.uid,
    engine: null,
    async startSync(opts = {}) {
      d.engine = await startUserSync(
        { uid: d.uid, displayName: cred.user.displayName },
        {
          fs,
          firestore,
          db,
          network: alwaysOnline,
          historySync: opts.historySync ?? true,
          debounceMs: 20,
        },
      );
      return d.engine;
    },
    async close() {
      d.engine?.stop();
      db.close();
      await db.delete();
      await deleteApp(app);
    },
  };
  return d;
}

export async function until<T>(
  probe: () => Promise<T> | T,
  ok: (v: T) => boolean,
  ms = 15000,
): Promise<T> {
  const end = Date.now() + ms;
  let v = await probe();
  while (!ok(v)) {
    if (Date.now() > end) throw new Error(`timed out; last value: ${JSON.stringify(v)}`);
    await new Promise((r) => setTimeout(r, 50));
    v = await probe();
  }
  return v;
}
