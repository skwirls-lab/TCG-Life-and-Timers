// B-3: the optional Stripe REST client used by account deletion (no network: a fake fetch).
// @req AUTH-005 @req PAY-003
import { describe, expect, it } from "vitest";
import {
  isBillableSubscription,
  isSubscriptionId,
  stripeFromEnv,
  stripeRestClient,
  type FetchLike,
} from "../../functions/src/logic/stripe";

function fakeFetch(status: number, body = "") {
  const calls: Array<{ url: string; method: string; auth: string | undefined }> = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.Authorization });
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  return { f, calls };
}

describe("stripe REST client (B-3)", () => {
  it("cancels a subscription with one authenticated DELETE", async () => {
    const { f, calls } = fakeFetch(200);
    await stripeRestClient("rk_test_x", f, "https://stripe.test").cancelSubscription("sub_123");
    expect(calls).toEqual([
      {
        url: "https://stripe.test/v1/subscriptions/sub_123",
        method: "DELETE",
        auth: "Bearer rk_test_x",
      },
    ]);
  });

  it("treats missing / already-canceled subscriptions as done", async () => {
    await expect(
      stripeRestClient("k", fakeFetch(404).f).cancelSubscription("sub_1"),
    ).resolves.toBeUndefined();
    await expect(
      stripeRestClient(
        "k",
        fakeFetch(400, "A canceled subscription can only update…").f,
      ).cancelSubscription("sub_1"),
    ).resolves.toBeUndefined();
  });

  it("throws on other errors and never sends a malformed id", async () => {
    await expect(
      stripeRestClient("k", fakeFetch(500).f).cancelSubscription("sub_1"),
    ).rejects.toThrow("stripe cancel sub_1 failed: 500");
    await expect(
      stripeRestClient("k", fakeFetch(401, "bad key").f).cancelSubscription("sub_1"),
    ).rejects.toThrow(/401/);
    const { f, calls } = fakeFetch(200);
    await expect(stripeRestClient("k", f).cancelSubscription("sub_1/../customers")).rejects.toThrow(
      /invalid subscription id/,
    );
    expect(calls).toHaveLength(0);
    expect(isSubscriptionId("sub_AbC123")).toBe(true);
    expect(isSubscriptionId("cus_1")).toBe(false);
  });

  it("billable = any non-terminal status", () => {
    for (const s of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"])
      expect(isBillableSubscription(s)).toBe(true);
    for (const s of ["canceled", "incomplete_expired", undefined, 3])
      expect(isBillableSubscription(s)).toBe(false);
  });

  it("is configured only when STRIPE_SECRET_KEY is set", () => {
    expect(stripeFromEnv({})).toBeNull();
    expect(stripeFromEnv({ STRIPE_SECRET_KEY: "  " })).toBeNull();
    expect(stripeFromEnv({ STRIPE_SECRET_KEY: "rk_live_x" })).not.toBeNull();
  });
});
