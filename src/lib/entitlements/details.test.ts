// The "You're Pro" display details from the server entitlements doc (additive fields).
// @req PAY-002
import { describe, expect, it } from "vitest";
import { detailsFromDoc, parseDetails } from "./details";

describe("detailsFromDoc", () => {
  it("is null unless the doc grants Pro", () => {
    expect(detailsFromDoc(null)).toBeNull();
    expect(detailsFromDoc({ pro: false, source: "none", plan: "monthly" })).toBeNull();
    expect(detailsFromDoc({ pro: "true" })).toBeNull();
  });

  it("an old doc without the new fields still reads as Pro, without a plan or dates", () => {
    expect(detailsFromDoc({ pro: true, source: "subscription" })).toEqual({
      plan: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      source: "subscription",
    });
  });

  it("reads the plan, renewal date (ms or Timestamp) and cancel flag", () => {
    expect(
      detailsFromDoc({
        pro: true,
        source: "subscription",
        plan: "yearly",
        currentPeriodEnd: 1_800_000_000_000,
        cancelAtPeriodEnd: true,
      }),
    ).toEqual({
      plan: "yearly",
      currentPeriodEnd: 1_800_000_000_000,
      cancelAtPeriodEnd: true,
      source: "subscription",
    });
    const ts = { toMillis: () => 1_700_000_000_000 };
    expect(detailsFromDoc({ pro: true, plan: "monthly", currentPeriodEnd: ts })).toMatchObject({
      currentPeriodEnd: 1_700_000_000_000,
    });
    expect(
      detailsFromDoc({ pro: true, plan: "monthly", currentPeriodEnd: { seconds: 5 } }),
    ).toMatchObject({ currentPeriodEnd: 5000 });
    expect(detailsFromDoc({ pro: true, plan: "monthly", currentPeriodEnd: "soon" })).toMatchObject({
      currentPeriodEnd: null,
    });
  });

  it("derives lifetime / manual (gift) from the source; they have no dates", () => {
    expect(detailsFromDoc({ pro: true, source: "manual" })).toMatchObject({ plan: "manual" });
    expect(detailsFromDoc({ pro: true, source: "lifetime", currentPeriodEnd: 5 })).toMatchObject({
      plan: "lifetime",
      currentPeriodEnd: null,
    });
    expect(detailsFromDoc({ pro: true, source: "subscription", plan: "weekly" })).toMatchObject({
      plan: null,
    });
    expect(detailsFromDoc({ pro: true, source: 7 })).toMatchObject({ source: "none" });
  });

  it("parses cached details defensively", () => {
    expect(parseDetails(null)).toBeNull();
    expect(parseDetails("x")).toBeNull();
    expect(parseDetails({ plan: "monthly", currentPeriodEnd: 9, source: "subscription" })).toEqual({
      plan: "monthly",
      currentPeriodEnd: 9,
      cancelAtPeriodEnd: false,
      source: "subscription",
    });
  });
});
