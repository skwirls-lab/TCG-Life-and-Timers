// The Stripe port (D-082): pinned API version, id guards, object mapping, webhook signature
// verification with the real SDK, and the SDK adapter against a local HTTP stand-in for
// api.stripe.com (no network).
// @req PAY-002 @req PAY-003 @req AUTH-005 @req SEC-002
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SDK_API_VERSION,
  STRIPE_API_VERSION,
  constructWebhookEvent,
  isBillableSubscription,
  isStripeId,
  isSubscriptionId,
  mapSubscription,
  parseIdList,
  signWebhookPayload,
  stripeErrorText,
  stripeSdkPort,
  type StripePort,
} from "../../functions/src/logic/stripe";

describe("stripe port helpers", () => {
  it("pins the API version the installed SDK ships with", () => {
    expect(STRIPE_API_VERSION).toBe(SDK_API_VERSION);
  });

  it("billable = any non-terminal status", () => {
    for (const s of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"])
      expect(isBillableSubscription(s)).toBe(true);
    for (const s of ["canceled", "incomplete_expired", undefined, 3])
      expect(isBillableSubscription(s)).toBe(false);
  });

  it("only well-formed Stripe ids pass", () => {
    expect(isSubscriptionId("sub_AbC123")).toBe(true);
    expect(isSubscriptionId("sub_1/../customers")).toBe(false);
    expect(isStripeId("cus_1", "cus")).toBe(true);
    expect(isStripeId("cus_1", "sub")).toBe(false);
    expect(isStripeId(undefined, "cus")).toBe(false);
    expect(isStripeId("cus_", "cus")).toBe(false);
  });

  it("parses id lists", () => {
    expect([...parseIdList(" price_a, price_b\nprice_c ,")]).toEqual([
      "price_a",
      "price_b",
      "price_c",
    ]);
    expect(parseIdList("").size).toBe(0);
    expect(parseIdList(undefined).size).toBe(0);
  });

  it("maps a subscription's plan details (period on the items, or legacy on the subscription)", () => {
    const base = { id: "sub_x", status: "active", customer: { id: "cus_x" }, metadata: {} };
    const modern = mapSubscription({
      ...base,
      cancel_at_period_end: false,
      cancel_at: 1_900_000_000,
      items: {
        data: [
          { current_period_end: 1_700_000_000, price: { id: "p1", recurring: null } },
          {
            current_period_end: 1_800_000_000,
            price: { id: "p2", recurring: { interval: "year" } },
          },
        ],
      },
    } as unknown as Parameters<typeof mapSubscription>[0]);
    expect(modern).toMatchObject({
      customer: "cus_x",
      priceIds: ["p1", "p2"],
      interval: "year",
      currentPeriodEnd: 1_800_000_000_000,
      cancelAtPeriodEnd: false,
      cancelAt: 1_900_000_000_000,
    });
    const legacy = mapSubscription({
      ...base,
      current_period_end: 1_750_000_000,
      items: { data: [{ price: { id: "p1" } }] },
    } as unknown as Parameters<typeof mapSubscription>[0]);
    expect(legacy).toMatchObject({
      interval: null,
      currentPeriodEnd: 1_750_000_000_000,
      cancelAtPeriodEnd: false,
      cancelAt: null,
    });
  });

  it("error text never carries the message (keys, request details)", () => {
    expect(
      stripeErrorText({ type: "StripeAuthenticationError", statusCode: 401, message: "sk_live_x" }),
    ).toBe("StripeAuthenticationError/401");
    expect(stripeErrorText(new Error("sk_live_secret"))).toBe("stripe error");
  });
});

describe("webhook signatures (real SDK)", () => {
  const secret = "whsec_unit";
  const payload = JSON.stringify({
    id: "evt_1",
    object: "event",
    type: "invoice.paid",
    data: { object: {} },
  });

  it("accepts a correctly signed payload", () => {
    const e = constructWebhookEvent(
      Buffer.from(payload),
      signWebhookPayload(payload, secret),
      secret,
    );
    expect(e).toMatchObject({ id: "evt_1", type: "invoice.paid" });
  });

  it("rejects missing, wrong, tampered and stale signatures and an empty secret", () => {
    const header = signWebhookPayload(payload, secret);
    expect(() => constructWebhookEvent(payload, undefined, secret)).toThrow(/missing/);
    expect(() => constructWebhookEvent(payload, header, "")).toThrow(/not configured/);
    expect(() => constructWebhookEvent(payload, header, "whsec_other")).toThrow();
    expect(() => constructWebhookEvent(payload.replace("paid", "void"), header, secret)).toThrow();
    const stale = signWebhookPayload(payload, secret, Math.floor(Date.now() / 1000) - 3600);
    expect(() => constructWebhookEvent(payload, stale, secret)).toThrow();
  });
});

describe("stripeSdkPort (SDK against a local stand-in)", () => {
  let server: Server;
  let port: StripePort;
  const seen: Array<{
    method: string;
    path: string;
    body: string;
    headers: IncomingMessage["headers"];
  }> = [];
  const routes: Record<string, (body: string) => [number, unknown]> = {
    "POST /v1/customers": () => [200, { id: "cus_new", object: "customer" }],
    "GET /v1/customers/cus_gone": () => [
      200,
      { id: "cus_gone", object: "customer", deleted: true },
    ],
    "GET /v1/customers/cus_missing": () => [
      404,
      {
        error: {
          type: "invalid_request_error",
          code: "resource_missing",
          message: "No such customer",
        },
      },
    ],
    "DELETE /v1/customers/cus_missing": () => [
      404,
      {
        error: {
          type: "invalid_request_error",
          code: "resource_missing",
          message: "No such customer",
        },
      },
    ],
    "GET /v1/prices/price_m": () => [
      200,
      { id: "price_m", object: "price", active: true, type: "recurring" },
    ],
    "POST /v1/checkout/sessions": () => [
      200,
      { id: "cs_1", object: "checkout.session", url: "https://checkout.stripe.com/c/cs_1" },
    ],
    "GET /v1/subscriptions": () => [
      200,
      {
        object: "list",
        has_more: false,
        url: "/v1/subscriptions",
        data: [
          {
            id: "sub_1",
            object: "subscription",
            status: "past_due",
            customer: "cus_1",
            metadata: { firebaseUID: "u1" },
            cancel_at_period_end: true,
            cancel_at: null,
            items: {
              object: "list",
              data: [
                {
                  id: "si_1",
                  current_period_end: 1_800_000_000,
                  price: { id: "price_m", recurring: { interval: "month", interval_count: 1 } },
                },
              ],
            },
          },
        ],
      },
    ],
    "DELETE /v1/subscriptions/sub_done": () => [
      400,
      {
        error: { type: "invalid_request_error", message: "This subscription is already canceled." },
      },
    ],
    "GET /v1/payment_intents": () => [
      200,
      {
        object: "list",
        has_more: false,
        url: "/v1/payment_intents",
        data: [
          {
            id: "pi_1",
            object: "payment_intent",
            status: "succeeded",
            amount: 2999,
            amount_received: 2999,
            metadata: { priceId: "price_l", firebaseUID: "u1" },
            latest_charge: {
              id: "ch_1",
              object: "charge",
              amount_refunded: 2999,
              refunded: true,
              disputed: false,
            },
          },
        ],
      },
    ],
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString()));
      req.on("end", () => {
        const path = (req.url ?? "").split("?")[0]!;
        seen.push({ method: req.method ?? "", path: req.url ?? "", body, headers: req.headers });
        const route = routes[`${req.method} ${path}`];
        const [status, json] = route
          ? route(body)
          : [500, { error: { type: "api_error", message: "no route" } }];
        res.writeHead(status, { "Content-Type": "application/json", "Request-Id": "req_test" });
        res.end(JSON.stringify(json));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port: p } = server.address() as AddressInfo;
    port = stripeSdkPort("sk_test_local", {
      host: "127.0.0.1",
      port: p,
      protocol: "http",
      maxNetworkRetries: 0,
    });
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });
  const last = () => seen.at(-1)!;

  it("creates customers with metadata.firebaseUID and the idempotency key, pinned version", async () => {
    expect(
      await port.createCustomer({ uid: "u1", email: "a@b.c" }, "tcgtempo-customer-u1"),
    ).toEqual({ id: "cus_new" });
    const body = new URLSearchParams(last().body);
    expect(body.get("metadata[firebaseUID]")).toBe("u1");
    expect(body.get("email")).toBe("a@b.c");
    expect(last().headers["idempotency-key"]).toBe("tcgtempo-customer-u1");
    expect(last().headers["stripe-version"]).toBe(STRIPE_API_VERSION);
    expect(last().headers.authorization).toBe("Bearer sk_test_local");
  });

  it("maps customers, prices, subscriptions and payments", async () => {
    expect(await port.retrieveCustomer("cus_gone")).toMatchObject({ deleted: true });
    expect(await port.retrieveCustomer("cus_missing")).toBeNull();
    await expect(port.deleteCustomer("cus_missing")).resolves.toBeUndefined();
    expect(await port.retrievePrice("price_m")).toEqual({
      id: "price_m",
      active: true,
      recurring: true,
    });
    expect(await port.listSubscriptions("cus_1")).toEqual([
      {
        id: "sub_1",
        status: "past_due",
        customer: "cus_1",
        priceIds: ["price_m"],
        metadata: { firebaseUID: "u1" },
        interval: "month",
        currentPeriodEnd: 1_800_000_000_000,
        cancelAtPeriodEnd: true,
        cancelAt: null,
      },
    ]);
    expect(last().path).toContain("status=all");
    expect(await port.listPayments("cus_1")).toEqual([
      {
        id: "pi_1",
        status: "succeeded",
        amount: 2999,
        amountReceived: 2999,
        amountRefunded: 2999,
        refunded: true,
        disputed: false,
        priceId: "price_l",
        metadata: { priceId: "price_l", firebaseUID: "u1" },
      },
    ]);
    expect(decodeURIComponent(last().path)).toContain("expand[0]=data.latest_charge");
  });

  it("builds the Checkout session the handlers ask for", async () => {
    const r = await port.createCheckoutSession({
      mode: "subscription",
      customer: "cus_1",
      priceId: "price_m",
      uid: "u1",
      successUrl:
        "https://tcgtempo.skwirls.com/pro?checkout=success&session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://tcgtempo.skwirls.com/pro?checkout=cancel",
      automaticTax: true,
    });
    expect(r).toEqual({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" });
    const b = new URLSearchParams(last().body);
    expect(Object.fromEntries(b)).toMatchObject({
      mode: "subscription",
      customer: "cus_1",
      client_reference_id: "u1",
      "line_items[0][price]": "price_m",
      "line_items[0][quantity]": "1",
      allow_promotion_codes: "true",
      success_url:
        "https://tcgtempo.skwirls.com/pro?checkout=success&session_id={CHECKOUT_SESSION_ID}",
      "metadata[firebaseUID]": "u1",
      "subscription_data[metadata][firebaseUID]": "u1",
      "automatic_tax[enabled]": "true",
      "customer_update[address]": "auto",
    });
    await port.createCheckoutSession({
      mode: "payment",
      customer: "cus_1",
      priceId: "price_l",
      uid: "u1",
      successUrl: "https://x/s",
      cancelUrl: "https://x/c",
      automaticTax: false,
    });
    const p = Object.fromEntries(new URLSearchParams(last().body));
    expect(p).toMatchObject({
      mode: "payment",
      "payment_intent_data[metadata][priceId]": "price_l",
      "payment_intent_data[metadata][firebaseUID]": "u1",
    });
    expect(p).not.toHaveProperty("automatic_tax[enabled]");
    expect(p).not.toHaveProperty("subscription_data[metadata][firebaseUID]");
  });

  it("cancel tolerates already-canceled, refuses malformed ids, surfaces other errors", async () => {
    await expect(port.cancelSubscription("sub_done")).resolves.toBeUndefined();
    await expect(port.cancelSubscription("sub_1/../x")).rejects.toThrow(/invalid subscription id/);
    await expect(port.cancelSubscription("sub_err")).rejects.toMatchObject({ statusCode: 500 });
  });
});
