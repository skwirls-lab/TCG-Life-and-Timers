// @req PAY-001 @req PAY-004
import { afterEach, describe, expect, it } from "vitest";
import { applyPaywallTestHook, parsePw } from "./testHook";
import { useEntitlements } from "./store";

afterEach(() => {
  window.sessionStorage.clear();
  useEntitlements.getState().setPolicy("ALL_FREE");
  useEntitlements.getState().setPro(false);
});

describe("pw= paywall test hook", () => {
  it("is a no-op unless the test hooks are enabled", () => {
    expect(applyPaywallTestHook(new URLSearchParams("pw=1"), false)).toBeNull();
    expect(useEntitlements.getState().policy).toBe("ALL_FREE");
  });

  // @req PAY-004
  it("pw=1 turns on the tiered policy and is remembered for the tab", () => {
    expect(applyPaywallTestHook(new URLSearchParams("pw=1"), true)).toBe("1");
    expect(useEntitlements.getState()).toMatchObject({ policy: "TIERED", pro: false });
    expect(window.__tcgPay?.state().policy).toBe("TIERED");
    useEntitlements.getState().setPolicy("ALL_FREE");
    expect(applyPaywallTestHook(new URLSearchParams(""), true)).toBe("1");
    expect(useEntitlements.getState().policy).toBe("TIERED");
  });

  it("pw=pro grants Pro and pw=0 restores the build default", () => {
    applyPaywallTestHook(new URLSearchParams("pw=pro"), true);
    expect(useEntitlements.getState()).toMatchObject({ policy: "TIERED", pro: true });
    applyPaywallTestHook(new URLSearchParams("pw=0"), true);
    expect(useEntitlements.getState()).toMatchObject({ policy: "ALL_FREE", pro: false });
  });

  it("ignores unknown values", () => {
    expect(parsePw("yes")).toBeNull();
    expect(parsePw(null)).toBeNull();
    expect(applyPaywallTestHook(new URLSearchParams("pw=maybe"), true)).toBeNull();
  });
});
