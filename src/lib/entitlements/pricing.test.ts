// @req PAY-002
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMULATOR_TEST_PRICES,
  PLACEHOLDER_PRICES,
  parsePriceId,
  plansToShow,
  pricingEnv,
  purchasablePlans,
  readPlans,
  salesStatus,
  withEmulatorTestPrices,
} from "./pricing";

afterEach(() => vi.unstubAllEnvs());

describe("pricing config (T7.4)", () => {
  // @req PAY-002
  it("uses placeholder display prices and no price ids by default", () => {
    const plans = readPlans({});
    expect(plans.map((p) => [p.id, p.display, p.priceId, p.mode])).toEqual([
      ["monthly", "$1.99", null, "subscription"],
      ["yearly", "$14.99", null, "subscription"],
      ["lifetime", "$29.99", null, "payment"],
    ]);
    expect(PLACEHOLDER_PRICES).toEqual({ monthly: "$1.99", yearly: "$14.99", lifetime: "$29.99" });
    expect(purchasablePlans(plans)).toEqual([]);
  });

  // @req PAY-002
  it("reads price ids and display overrides from env, rejecting malformed ids", () => {
    const plans = readPlans({
      NEXT_PUBLIC_STRIPE_PRICE_MONTHLY: " price_1AbC ",
      NEXT_PUBLIC_STRIPE_PRICE_YEARLY: "REPLACE_ME",
      NEXT_PUBLIC_STRIPE_PRICE_LIFETIME: "price_life9",
      NEXT_PUBLIC_PRICE_DISPLAY_LIFETIME: "€24,99",
      NEXT_PUBLIC_PRICE_DISPLAY_MONTHLY: "  ",
    });
    expect(plans.map((p) => p.priceId)).toEqual(["price_1AbC", null, "price_life9"]);
    expect(plans.map((p) => p.display)).toEqual(["$1.99", "$14.99", "€24,99"]);
    expect(purchasablePlans(plans).map((p) => p.id)).toEqual(["monthly", "lifetime"]);
    expect(parsePriceId(undefined)).toBeNull();
    expect(parsePriceId("price_")).toBeNull();
    expect(parsePriceId("price_a-b")).toBeNull();
  });

  // @req PAY-002
  it("reports whether Pro can be sold", () => {
    const priced = readPlans({ NEXT_PUBLIC_STRIPE_PRICE_YEARLY: "price_y" });
    expect(salesStatus(false, priced)).toBe("cloudMissing");
    expect(salesStatus(true, readPlans({}))).toBe("pricesMissing");
    expect(salesStatus(true, priced)).toBe("ready");
  });

  it("reads the literal NEXT_PUBLIC env vars (D-050)", () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PRICE_MONTHLY", "price_env1");
    vi.stubEnv("NEXT_PUBLIC_TEST_HOOKS", "");
    expect(pricingEnv().NEXT_PUBLIC_STRIPE_PRICE_MONTHLY).toBe("price_env1");
    expect(pricingEnv().NEXT_PUBLIC_STRIPE_PRICE_YEARLY).toBeUndefined();
  });

  it("fills fake price ids only in emulator test builds", () => {
    vi.stubEnv("NEXT_PUBLIC_TEST_HOOKS", "1");
    vi.stubEnv("NEXT_PUBLIC_USE_EMULATORS", "1");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PRICE_MONTHLY", "price_real");
    const env = pricingEnv();
    expect(env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY).toBe("price_real");
    expect(env.NEXT_PUBLIC_STRIPE_PRICE_LIFETIME).toBe(EMULATOR_TEST_PRICES.lifetime);
    expect(withEmulatorTestPrices({}).NEXT_PUBLIC_STRIPE_PRICE_YEARLY).toBe("price_e2eYearly");
  });
});

describe("plansToShow", () => {
  it("shows only buyable plans once any price is set, else all as a preview", () => {
    const two = readPlans({
      NEXT_PUBLIC_STRIPE_PRICE_MONTHLY: "price_abc",
      NEXT_PUBLIC_STRIPE_PRICE_YEARLY: "price_def",
      NEXT_PUBLIC_PRICE_DISPLAY_YEARLY: "$19.99",
    });
    expect(plansToShow(two).map((p) => [p.id, p.display])).toEqual([
      ["monthly", "$1.99"],
      ["yearly", "$19.99"],
    ]);
    expect(plansToShow(readPlans({})).map((p) => p.id)).toEqual(["monthly", "yearly", "lifetime"]);
  });
});
