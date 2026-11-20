// /pro?checkout=success|cancel and Restore purchases (PAY-002, PAY-004).
// @req PAY-002 @req PAY-004
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth/store";
import type { ActivationState } from "@/lib/entitlements/activation";
import { CheckoutReturn } from "./CheckoutReturn";
import { RestorePurchases } from "./RestorePurchases";

let push: ((s: ActivationState) => void) | null = null;
const stop = vi.fn();
vi.mock("@/lib/entitlements/activation", () => ({
  watchActivation: (cb: (s: ActivationState) => void) => {
    push = cb;
    return stop;
  },
}));
const restore = vi.fn();
vi.mock("@/lib/entitlements/checkout", () => ({ restorePurchases: () => restore() }));
vi.mock("@/lib/firebase/config", async (orig) => ({
  ...(await orig<typeof import("@/lib/firebase/config")>()),
  isCloudConfigured: () => true,
}));

const google = { uid: "g", email: "g@x", displayName: null, photoURL: null, isAnonymous: false };

afterEach(() => {
  cleanup();
  push = null;
  stop.mockClear();
  restore.mockReset();
  useAuth.setState({ user: null });
});

describe("CheckoutReturn", () => {
  it("success: activating → active, and stops watching on unmount", async () => {
    const { unmount } = render(<CheckoutReturn kind="success" />);
    const box = screen.getByTestId("pro-return-success");
    expect(box.textContent).toContain("Payment received, activating Pro");
    await vi.waitFor(() => expect(push).not.toBeNull());
    act(() => push!("active"));
    expect(box.getAttribute("data-state")).toBe("active");
    expect(box.textContent).toContain("Pro is active");
    unmount();
    expect(stop).toHaveBeenCalled();
  });

  it("slow: explains and offers Restore purchases (signed-in only)", async () => {
    useAuth.setState({ user: google });
    render(<CheckoutReturn kind="success" />);
    await vi.waitFor(() => expect(push).not.toBeNull());
    act(() => push!("slow"));
    expect(screen.getByTestId("pro-return-success").textContent).toContain(
      "Taking longer than usual",
    );
    expect(screen.getByTestId("pro-return-restore")).toBeTruthy();
  });

  it("cancel: a gentle note, no watching", () => {
    render(<CheckoutReturn kind="cancel" />);
    expect(screen.getByTestId("pro-return-cancel").textContent).toContain("Checkout canceled");
    expect(push).toBeNull();
  });
});

describe("RestorePurchases", () => {
  it("is hidden for guests", () => {
    render(<RestorePurchases testId="r" />);
    expect(screen.queryByTestId("r")).toBeNull();
    useAuth.setState({ user: { ...google, isAnonymous: true } });
    cleanup();
    render(<RestorePurchases testId="r" />);
    expect(screen.queryByTestId("r")).toBeNull();
  });

  it.each([
    [{ status: "ok", pro: true }, "Pro is active on this account."],
    [{ status: "ok", pro: false }, "No active purchase found for this account."],
    [{ status: "rateLimited" }, "Try again in a few seconds"],
    [{ status: "error", error: "boom" }, "Couldn't check your purchases: boom"],
  ])("shows the result of %o", async (result, text) => {
    useAuth.setState({ user: google });
    restore.mockResolvedValue(result);
    render(<RestorePurchases testId="r" />);
    fireEvent.click(screen.getByTestId("r"));
    expect((await screen.findByTestId("r-result")).textContent).toContain(text);
    expect(restore).toHaveBeenCalledTimes(1);
  });
});
