/**
 * Minimal Stripe REST client for account deletion (B-3, AUTH-005). Used only when the optional
 * functions env `STRIPE_SECRET_KEY` is set (a restricted key with "Subscriptions: write" is
 * enough); without it account deletion relies on the Stripe extension's "Automatically delete
 * Stripe customer objects" option (DEPLOY.md). No SDK: one form-encoded DELETE per subscription.
 */

export interface StripeLike {
  /** Cancel a subscription immediately. Resolves when it is canceled or no longer exists. */
  cancelSubscription(subscriptionId: string): Promise<void>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Subscription statuses that can still bill (everything but the terminal ones). */
const TERMINAL = new Set(["canceled", "incomplete_expired"]);

export function isBillableSubscription(status: unknown): boolean {
  return typeof status === "string" && !TERMINAL.has(status);
}

/** Stripe ids are `sub_` + alphanumerics; anything else is never sent to the API. */
export function isSubscriptionId(id: string): boolean {
  return /^sub_[A-Za-z0-9]{1,250}$/.test(id);
}

export function stripeRestClient(
  secretKey: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  apiBase = "https://api.stripe.com",
): StripeLike {
  return {
    async cancelSubscription(id) {
      if (!isSubscriptionId(id)) throw new Error(`invalid subscription id: ${JSON.stringify(id)}`);
      const res = await fetchImpl(`${apiBase}/v1/subscriptions/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      if (res.ok || res.status === 404) return; // 404: already gone (resource_missing)
      const body = await res.text().catch(() => "");
      // Already canceled subscriptions answer 400 with this message; that is the goal state.
      if (res.status === 400 && /cancel/i.test(body)) return;
      throw new Error(`stripe cancel ${id} failed: ${res.status}`);
    },
  };
}

/** The Stripe client from the functions environment, or null when not configured. */
export function stripeFromEnv(
  env: Record<string, string | undefined> = process.env,
): StripeLike | null {
  const key = env.STRIPE_SECRET_KEY?.trim();
  return key ? stripeRestClient(key) : null;
}
