// @req AUTH-001 sign-in first on the launcher, through the one existing sign-in path
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth/store";
import { WELCOME_KEY, readWelcomeChoice } from "./welcomeChoice";

const signIn = vi.fn(async () => {});
vi.mock("@/lib/account/cloud", async () => {
  const { create } = await import("zustand");
  return {
    startCloud: vi.fn(async () => {}),
    resolveMerge: vi.fn(),
    useCloud: create(() => ({ phase: "idle", mergePrompt: null })),
  };
});
vi.mock("@/lib/auth/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/store")>()),
  signInWithGoogle: () => signIn(),
}));
vi.mock("@/lib/firebase/config", async (orig) => ({
  ...(await orig<typeof import("@/lib/firebase/config")>()),
  isCloudConfigured: () => true,
}));

const { default: LauncherAccount } = await import("./LauncherAccount");

const google = {
  uid: "u1",
  email: "a@example.com",
  displayName: "A",
  photoURL: null,
  isAnonymous: false,
};

beforeEach(() => {
  localStorage.removeItem(WELCOME_KEY);
  useAuth.setState({ status: "signedOut", user: null, error: null, initialized: true });
});
afterEach(() => {
  signIn.mockClear();
  localStorage.removeItem(WELCOME_KEY);
});

describe("LauncherAccount", () => {
  it("shows the welcome on first visit; Continue with Google uses the auth store", () => {
    render(<LauncherAccount />);
    expect(screen.getByTestId("welcome")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-guest-note").textContent).toContain("don't sync");
    fireEvent.click(screen.getByTestId("welcome-google"));
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("remembers Continue without an account and then offers Sign in to sync", () => {
    render(<LauncherAccount />);
    fireEvent.click(screen.getByTestId("welcome-guest"));
    expect(screen.queryByTestId("welcome")).toBeNull();
    expect(readWelcomeChoice()).toBe("guest");
    fireEvent.click(screen.getByTestId("launcher-signin"));
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("waits for auth, never shows the welcome to a signed-in user, and records the sign-in", () => {
    useAuth.setState({ initialized: false });
    render(<LauncherAccount />);
    expect(screen.getByTestId("launcher-account").dataset.view).toBe("loading");
    expect(screen.queryByTestId("welcome")).toBeNull();
    act(() => useAuth.setState({ initialized: true, status: "signedIn", user: google }));
    expect(screen.queryByTestId("welcome")).toBeNull();
    expect(screen.getByTestId("launcher-account-link")).toBeInTheDocument();
    expect(readWelcomeChoice()).toBe("google");
  });

  it("shows a sign-in error next to the entry", () => {
    localStorage.setItem(WELCOME_KEY, JSON.stringify({ v: 1, choice: "guest", at: 1 }));
    useAuth.setState({ error: "auth/network-request-failed" });
    render(<LauncherAccount />);
    expect(screen.getByTestId("launcher-signin-error").textContent).toContain(
      "auth/network-request-failed",
    );
  });
});
