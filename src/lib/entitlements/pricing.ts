/**
 * Pricing config (T7.4, PAY-002, Q4). Stripe price ids come from the deployment's env; the
 * display prices are PLACEHOLDERS: the owner sets the final prices in Stripe and here (or via
 * the NEXT_PUBLIC_PRICE_DISPLAY_* env vars) before launch.
 */

export type PlanId = "monthly" | "yearly" | "lifetime";
export type CheckoutMode = "subscription" | "payment";

export interface Plan {
  id: PlanId;
  /** Stripe price id (`price_…`), or null when not configured. */
  priceId: string | null;
  /** Display price, e.g. "$1.99" (placeholder until the owner sets final prices). */
  display: string;
  mode: CheckoutMode;
}

/** Placeholder display prices (PRD §17 PAY-002). The owner sets the final values. */
export const PLACEHOLDER_PRICES: Record<PlanId, string> = {
  monthly: "$1.99",
  yearly: "$14.99",
  lifetime: "$29.99",
};

export const PLAN_IDS: readonly PlanId[] = ["monthly", "yearly", "lifetime"];

const PRICE_ID_RE = /^price_[A-Za-z0-9]+$/;

/**
 * Client env with literal `process.env.NEXT_PUBLIC_*` reads (Next inlines only those, D-050).
 */
export function pricingEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    NEXT_PUBLIC_STRIPE_PRICE_MONTHLY: process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY,
    NEXT_PUBLIC_STRIPE_PRICE_YEARLY: process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY,
    NEXT_PUBLIC_STRIPE_PRICE_LIFETIME: process.env.NEXT_PUBLIC_STRIPE_PRICE_LIFETIME,
    NEXT_PUBLIC_PRICE_DISPLAY_MONTHLY: process.env.NEXT_PUBLIC_PRICE_DISPLAY_MONTHLY,
    NEXT_PUBLIC_PRICE_DISPLAY_YEARLY: process.env.NEXT_PUBLIC_PRICE_DISPLAY_YEARLY,
    NEXT_PUBLIC_PRICE_DISPLAY_LIFETIME: process.env.NEXT_PUBLIC_PRICE_DISPLAY_LIFETIME,
  };
  const emulatorTest =
    process.env.NEXT_PUBLIC_TEST_HOOKS === "1" && process.env.NEXT_PUBLIC_USE_EMULATORS === "1";
  return emulatorTest ? withEmulatorTestPrices(env) : env;
}

/** Fake price ids for the emulator e2e build (checkout is simulated there; never in prod). */
export const EMULATOR_TEST_PRICES: Record<PlanId, string> = {
  monthly: "price_e2eMonthly",
  yearly: "price_e2eYearly",
  lifetime: "price_e2eLifetime",
};

export function withEmulatorTestPrices(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out = { ...env };
  for (const id of PLAN_IDS) {
    const key = `NEXT_PUBLIC_STRIPE_PRICE_${id.toUpperCase()}`;
    out[key] ||= EMULATOR_TEST_PRICES[id];
  }
  return out;
}

/** A valid Stripe price id, or null for missing / placeholder / malformed values. */
export function parsePriceId(raw: string | undefined): string | null {
  const v = raw?.trim() ?? "";
  return PRICE_ID_RE.test(v) ? v : null;
}

export function readPlans(env: Record<string, string | undefined> = pricingEnv()): Plan[] {
  return PLAN_IDS.map((id) => {
    const key = id.toUpperCase();
    const display = env[`NEXT_PUBLIC_PRICE_DISPLAY_${key}`]?.trim();
    return {
      id,
      priceId: parsePriceId(env[`NEXT_PUBLIC_STRIPE_PRICE_${key}`]),
      display: display || PLACEHOLDER_PRICES[id],
      mode: id === "lifetime" ? "payment" : "subscription",
    };
  });
}

/** Plans that can actually be bought (have a price id). */
export function purchasablePlans(plans: readonly Plan[] = readPlans()): Plan[] {
  return plans.filter((p) => p.priceId !== null);
}

export type SalesStatus = "ready" | "pricesMissing" | "cloudMissing";

/** Can this deployment sell Pro? (cloud config first: checkout needs an account). */
export function salesStatus(
  cloudConfigured: boolean,
  plans: readonly Plan[] = readPlans(),
): SalesStatus {
  if (!cloudConfigured) return "cloudMissing";
  if (purchasablePlans(plans).length === 0) return "pricesMissing";
  return "ready";
}
