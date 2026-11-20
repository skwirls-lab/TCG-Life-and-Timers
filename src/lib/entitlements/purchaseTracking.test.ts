// @req LEG-004
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_PLAN_KEY, rememberCheckoutPlan, trackPurchaseReturn } from "./purchaseTracking";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/telemetry", () => ({ track }));

beforeEach(() => {
  track.mockClear();
  sessionStorage.clear();
});

describe("purchase event (§19.5)", () => {
  it("tracks the remembered plan once on the success return", () => {
    rememberCheckoutPlan("yearly");
    expect(sessionStorage.getItem(CHECKOUT_PLAN_KEY)).toBe("yearly");
    expect(trackPurchaseReturn()).toBe("yearly");
    expect(track).toHaveBeenCalledWith("purchase", { plan: "yearly" });
    // A refresh of /pro?checkout=success does not count it again.
    expect(trackPurchaseReturn()).toBeNull();
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("ignores unknown plans and broken storage", () => {
    sessionStorage.setItem(CHECKOUT_PLAN_KEY, "forged");
    expect(trackPurchaseReturn()).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => undefined,
    };
    expect(() => rememberCheckoutPlan("monthly", broken)).not.toThrow();
    expect(trackPurchaseReturn(broken)).toBeNull();
    expect(trackPurchaseReturn(null)).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
});
