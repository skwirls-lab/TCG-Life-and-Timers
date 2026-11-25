import { describe, expect, it } from "vitest";
import {
  entitlementDetails,
  entitlementsFromSubscriptions,
  isLifetimePayment,
  isRevokedPayment,
  parseLifetimePriceIds,
  paymentPriceIds,
  planOfSubscription,
} from "../../functions/src/logic/entitlements";

const none = new Set<string>();

describe("entitlementsFromSubscriptions (SEC-002)", () => {
  // @req SEC-002
  it("is not pro with no subscriptions or payments", () => {
    expect(entitlementsFromSubscriptions([], [], none)).toEqual({ pro: false, source: "none" });
  });

  // @req SEC-002
  it.each(["active", "trialing"])("a %s subscription grants pro", (status) => {
    expect(entitlementsFromSubscriptions([{ status }], [], none)).toEqual({
      pro: true,
      source: "subscription",
    });
  });

  // @req SEC-002
  it.each(["canceled", "past_due", "unpaid", "incomplete", "incomplete_expired", undefined, 3])(
    "a %s subscription does not grant pro",
    (status) => {
      expect(entitlementsFromSubscriptions([{ status }], [], none).pro).toBe(false);
    },
  );

  // @req SEC-002
  it("client-settable metadata never grants lifetime (D-062); only LIFETIME_PRICE_IDS do", () => {
    const forged = { status: "succeeded", metadata: { lifetime: "true" }, price: "price_monthly" };
    expect(entitlementsFromSubscriptions([], [forged], none)).toEqual({
      pro: false,
      source: "none",
    });
    const ids = parseLifetimePriceIds("price_life");
    const real = { status: "succeeded", price: "price_life" };
    expect(entitlementsFromSubscriptions([{ status: "active" }], [real], ids)).toEqual({
      pro: true,
      source: "lifetime",
    });
  });

  // @req SEC-002
  it("a payment for a LIFETIME_PRICE_IDS price grants lifetime", () => {
    const ids = parseLifetimePriceIds("price_life, price_other");
    expect(
      entitlementsFromSubscriptions([], [{ status: "succeeded", price: "price_life" }], ids),
    ).toEqual({ pro: true, source: "lifetime" });
    expect(
      isLifetimePayment({ status: "succeeded", items: [{ price: { id: "price_other" } }] }, ids),
    ).toBe(true);
    expect(isLifetimePayment({ status: "succeeded", prices: [{ id: "price_x" }] }, ids)).toBe(
      false,
    );
  });

  // @req SEC-002
  it("ignores payments that did not succeed or are not lifetime", () => {
    const ids = parseLifetimePriceIds("price_life");
    const pays = [
      { status: "requires_payment_method", metadata: { lifetime: "true" } },
      { status: "succeeded", metadata: { lifetime: "false" }, price: "price_monthly" },
      { status: "canceled", price: "price_life" },
    ];
    expect(entitlementsFromSubscriptions([], pays, ids)).toEqual({ pro: false, source: "none" });
  });

  // @req SEC-002
  it("reads LIFETIME_PRICE_IDS from the environment by default", () => {
    const prev = process.env.LIFETIME_PRICE_IDS;
    process.env.LIFETIME_PRICE_IDS = "price_env";
    try {
      expect(
        entitlementsFromSubscriptions([], [{ status: "succeeded", price: "price_env" }]).pro,
      ).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.LIFETIME_PRICE_IDS;
      else process.env.LIFETIME_PRICE_IDS = prev;
    }
  });

  it("collects price ids across payment shapes and parses id lists", () => {
    expect(
      paymentPriceIds({
        price: "a",
        prices: ["b", { id: "c" }, null, { id: 4 }],
        items: [{ price: { id: "d" } }, null, {}],
      }),
    ).toEqual(["a", "b", "c", "d"]);
    expect([...parseLifetimePriceIds(undefined)]).toEqual([]);
    expect([...parseLifetimePriceIds(" x,,y \n z ")]).toEqual(["x", "y", "z"]);
  });

  // @req PAY-003
  it("B-8: refunded, disputed or revoked lifetime payments stop granting pro", () => {
    const ids = new Set(["price_life"]);
    const ok = { status: "succeeded", price: "price_life", amount: 2999, amount_received: 2999 };
    expect(entitlementsFromSubscriptions([], [ok], ids)).toEqual({ pro: true, source: "lifetime" });
    for (const p of [
      { ...ok, status: "refunded" },
      { ...ok, status: "canceled" },
      { ...ok, status: "disputed" },
      { ...ok, refunded: true },
      { ...ok, amount_refunded: 2999 },
      { ...ok, dispute: { id: "dp_1" } },
      { ...ok, disputed: true },
      { ...ok, revoked: true },
      { status: "succeeded", price: "price_life", amount_refunded: 5 },
    ]) {
      expect(isRevokedPayment(p) || p.status !== "succeeded").toBe(true);
      expect(entitlementsFromSubscriptions([], [p], ids)).toEqual({ pro: false, source: "none" });
    }
    // A partial goodwill refund keeps lifetime; another valid grant keeps pro.
    expect(isRevokedPayment({ ...ok, amount_refunded: 500 })).toBe(false);
    expect(isRevokedPayment({ ...ok, dispute: null })).toBe(false);
    expect(
      entitlementsFromSubscriptions([{ status: "active" }], [{ ...ok, refunded: true }], ids),
    ).toEqual({ pro: true, source: "subscription" });
  });
});

describe("entitlementDetails (plan, period end, cancel at period end)", () => {
  const month = 30 * 24 * 60 * 60 * 1000;
  it("lifetime and manual carry only the plan; none carries nothing", () => {
    expect(entitlementDetails("lifetime", [])).toEqual({ plan: "lifetime" });
    expect(entitlementDetails("manual", [])).toEqual({ plan: "manual" });
    expect(entitlementDetails("none", [{ status: "past_due", interval: "month" }])).toEqual({});
  });

  it("a subscription: plan from the interval, renewal date, status", () => {
    expect(
      entitlementDetails("subscription", [
        { status: "canceled", interval: "year", currentPeriodEnd: 9 * month },
        { status: "active", interval: "month", currentPeriodEnd: month, cancelAtPeriodEnd: false },
      ]),
    ).toEqual({
      plan: "monthly",
      currentPeriodEnd: month,
      cancelAtPeriodEnd: false,
      status: "active",
    });
  });

  it("picks the granting subscription that runs longest; yearly from the interval", () => {
    expect(
      entitlementDetails("subscription", [
        { status: "trialing", interval: "month", currentPeriodEnd: month },
        { status: "active", interval: "year", currentPeriodEnd: 12 * month },
      ]),
    ).toMatchObject({ plan: "yearly", currentPeriodEnd: 12 * month, status: "active" });
  });

  it("cancel at period end (the flag, or a scheduled cancel_at, which is the end date)", () => {
    expect(
      entitlementDetails("subscription", [
        { status: "active", interval: "month", currentPeriodEnd: month, cancelAtPeriodEnd: true },
      ]),
    ).toMatchObject({ cancelAtPeriodEnd: true, currentPeriodEnd: month });
    expect(
      entitlementDetails("subscription", [
        { status: "active", interval: "month", currentPeriodEnd: 2 * month, cancelAt: month },
      ]),
    ).toMatchObject({ cancelAtPeriodEnd: true, currentPeriodEnd: month });
  });

  it("falls back to the price-id config, and omits what it doesn't know", () => {
    const byPrice = new Map([["price_y", "yearly" as const]]);
    expect(planOfSubscription({ priceIds: ["price_x", "price_y"] }, byPrice)).toBe("yearly");
    expect(planOfSubscription({ interval: "week", priceIds: [3] }, byPrice)).toBeUndefined();
    expect(entitlementDetails("subscription", [{ status: "active" }])).toEqual({
      status: "active",
      cancelAtPeriodEnd: false,
    });
    expect(entitlementDetails("subscription", [{ status: "past_due" }])).toEqual({});
  });
});
