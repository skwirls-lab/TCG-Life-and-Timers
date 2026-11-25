import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_NAME, ensureDefaultApp } from "../../functions/src/logic/adminApp";

afterEach(async () => {
  await Promise.all(getApps().map((a) => deleteApp(a)));
});

describe("ensureDefaultApp (the app/no-app bug)", () => {
  it("creates the default app even when the functions SDK's named app already exists", () => {
    // What firebase-functions does before a callable runs: its own named app for token checks.
    initializeApp({ projectId: "demo-tcg-life" }, "__FIREBASE_FUNCTIONS_SDK__");
    expect(getApps()).toHaveLength(1);
    expect(() => getFirestore()).toThrow(/does not exist|no-app/i);
    ensureDefaultApp(getApps, () => initializeApp({ projectId: "demo-tcg-life" }));
    expect(getApps().map((a) => a.name)).toContain(DEFAULT_APP_NAME);
    expect(() => getFirestore()).not.toThrow();
  });

  it("doesn't initialize twice", () => {
    initializeApp({ projectId: "demo-tcg-life" });
    const init = vi.fn();
    ensureDefaultApp(getApps, init);
    expect(init).not.toHaveBeenCalled();
  });
});
