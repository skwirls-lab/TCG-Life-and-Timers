/**
 * Lazy Firebase client. Never import firebase/* statically from board code:
 * call these async getters so the SDK lands in its own chunk (PERF-003).
 */
import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";
import type { Functions } from "firebase/functions";
import { readFirebaseConfig, emulatorsEnabled } from "./config";

let appPromise: Promise<FirebaseApp | null> | null = null;

export function getFirebaseApp(): Promise<FirebaseApp | null> {
  if (!appPromise) {
    appPromise = (async () => {
      const cfg = readFirebaseConfig();
      if (!cfg) return null;
      const { initializeApp, getApps } = await import("firebase/app");
      return getApps()[0] ?? initializeApp(cfg);
    })();
  }
  return appPromise;
}

let authPromise: Promise<Auth | null> | null = null;
export function getFirebaseAuth(): Promise<Auth | null> {
  if (!authPromise) {
    authPromise = (async () => {
      const app = await getFirebaseApp();
      if (!app) return null;
      const { getAuth, connectAuthEmulator } = await import("firebase/auth");
      const auth = getAuth(app);
      if (emulatorsEnabled())
        connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      return auth;
    })();
  }
  return authPromise;
}

let dbPromise: Promise<Firestore | null> | null = null;
export function getDb(): Promise<Firestore | null> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const app = await getFirebaseApp();
      if (!app) return null;
      const fs = await import("firebase/firestore");
      const db = emulatorsEnabled()
        ? fs.getFirestore(app)
        : fs.initializeFirestore(app, {
            localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
          });
      if (emulatorsEnabled()) fs.connectFirestoreEmulator(db, "127.0.0.1", 8080);
      return db;
    })();
  }
  return dbPromise;
}

let storagePromise: Promise<FirebaseStorage | null> | null = null;
export function getStorageClient(): Promise<FirebaseStorage | null> {
  if (!storagePromise) {
    storagePromise = (async () => {
      const app = await getFirebaseApp();
      if (!app) return null;
      const { getStorage, connectStorageEmulator } = await import("firebase/storage");
      const storage = getStorage(app);
      if (emulatorsEnabled()) connectStorageEmulator(storage, "127.0.0.1", 9199);
      return storage;
    })();
  }
  return storagePromise;
}

let fnPromise: Promise<Functions | null> | null = null;
export function getFunctionsClient(): Promise<Functions | null> {
  if (!fnPromise) {
    fnPromise = (async () => {
      const app = await getFirebaseApp();
      if (!app) return null;
      const { getFunctions, connectFunctionsEmulator } = await import("firebase/functions");
      const fns = getFunctions(app);
      if (emulatorsEnabled()) connectFunctionsEmulator(fns, "127.0.0.1", 5001);
      return fns;
    })();
  }
  return fnPromise;
}
