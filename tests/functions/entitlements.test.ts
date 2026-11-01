import { describe, expect, it } from "vitest";
import {
  entitlementsFromSubscriptions,
  isLifetimePayment,
  parseLifetimePriceIds,
  paymentPriceIds,
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
});
