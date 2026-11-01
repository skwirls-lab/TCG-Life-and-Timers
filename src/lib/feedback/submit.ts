/**
 * Feedback (SET-041/042): one create-only document in `feedback/{id}`. Works for guests: an
 * anonymous auth user is created lazily first (AUTH-002); App Check guards it in production.
 * Offline there is no queue: the caller keeps the draft and shows "You're offline".
 */
import { feedbackDataSchema, paths, type FeedbackData } from "@/lib/firebase/docs";
import type { AuthUser } from "@/lib/auth/types";
import { appVersion } from "./version";

export class OfflineError extends Error {
  constructor() {
    super("offline");
    this.name = "OfflineError";
  }
}

export class CloudUnavailableError extends Error {
  constructor() {
    super("cloud not configured");
    this.name = "CloudUnavailableError";
  }
}

export interface FeedbackInput {
  category: FeedbackData["category"];
  text: string;
  email?: string;
  /** JSON string previewed by the user (SET-042). */
  diagnostics?: string;
}

export interface FeedbackDeps {
  isOnline: () => boolean;
  ensureUser: () => Promise<AuthUser | null>;
  write: (data: FeedbackData) => Promise<string>;
  appVersion: () => string;
}

export const WRITE_TIMEOUT_MS = 15_000;

export function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const h = setTimeout(() => reject(onTimeout()), ms);
    p.then(
      (v) => {
        clearTimeout(h);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(h);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** Validate the form fields; returns the document data (throws ZodError when invalid). */
export function feedbackData(input: FeedbackInput, version: string, uid?: string): FeedbackData {
  const email = input.email?.trim();
  return feedbackDataSchema.parse({
    category: input.category,
    text: input.text.trim(),
    ...(email ? { email } : {}),
    appVersion: version,
    ...(uid ? { uid } : {}),
    ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
  });
}

async function firestoreWrite(data: FeedbackData): Promise<string> {
  const { getDb } = await import("@/lib/firebase/client");
  const db = await getDb();
  if (!db) throw new CloudUnavailableError();
  const fs = await import("firebase/firestore");
  const ref = await withTimeout(
    fs.addDoc(fs.collection(db, paths.feedback()), { ...data, createdAt: fs.serverTimestamp() }),
    WRITE_TIMEOUT_MS,
    () => new OfflineError(),
  );
  return ref.id;
}

const defaultDeps = (): FeedbackDeps => ({
  isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
  ensureUser: async () => (await import("@/lib/auth/store")).ensureAnonymous(),
  write: firestoreWrite,
  appVersion: () => appVersion(),
});

/** Send feedback; resolves with the new document id. */
export async function submitFeedback(
  input: FeedbackInput,
  overrides: Partial<FeedbackDeps> = {},
): Promise<string> {
  const deps = { ...defaultDeps(), ...overrides };
  const version = deps.appVersion();
  feedbackData(input, version); // validate before touching the network
  if (!deps.isOnline()) throw new OfflineError();
  const user = await deps.ensureUser();
  if (!user) throw new CloudUnavailableError();
  return deps.write(feedbackData(input, version, user.uid));
}
