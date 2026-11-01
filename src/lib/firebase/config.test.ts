// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isCloudConfigured, readFirebaseConfig } from "./config";

describe("firebase config", () => {
  it("uses the demo project when emulators are on", () => {
    expect(readFirebaseConfig({ NEXT_PUBLIC_USE_EMULATORS: "1" })?.projectId).toBe("demo-tcg-life");
  });
  it("returns null when values are placeholders", () => {
    expect(readFirebaseConfig({ NEXT_PUBLIC_FIREBASE_API_KEY: "REPLACE_ME" })).toBeNull();
    expect(isCloudConfigured({})).toBe(false);
  });
  it("returns config when all values present", () => {
    const env = {
      NEXT_PUBLIC_FIREBASE_API_KEY: "k",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "d",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "p",
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "b",
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "m",
      NEXT_PUBLIC_FIREBASE_APP_ID: "a",
    };
    expect(readFirebaseConfig(env)?.projectId).toBe("p");
    expect(isCloudConfigured(env)).toBe(true);
  });
});
