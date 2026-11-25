import { initializeApp, getApps } from "firebase-admin/app";
import { ensureDefaultApp } from "./logic/adminApp";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onObjectDeleted, onObjectFinalized } from "firebase-functions/v2/storage";
import { HttpsError, onCall, onRequest, type CallableRequest } from "firebase-functions/v2/https";
import { defineBoolean, defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import { helloLogic } from "./logic/hello";
import { deleteUserData as deleteUserDataLogic, StripeCleanupError } from "./logic/deleteUserData";
import { artOwner, recomputeArtQuota } from "./logic/artQuota";
import {
  BillingError,
  DEFAULT_APP_BASE_URL,
  DEFAULT_PRICE_IDS,
  DEFAULT_RETURN_ORIGINS,
  createCheckoutSession as createCheckoutSessionLogic,
  createPortalSession as createPortalSessionLogic,
  handleStripeWebhook,
  refreshEntitlements as refreshEntitlementsLogic,
  type BillingDeps,
  type Caller,
} from "./logic/billing";
import { parseIdList, stripeErrorText, stripeSdkPort, type StripePort } from "./logic/stripe";

// ---------- params (DEPLOY.md Part 7; non-secret values live in functions/.env) ----------
// Secrets come from Secret Manager (`firebase functions:secrets:set …`); a deploy fails with a
// clear "no value for the secret" message until both exist. Their values are never logged.
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
/** Recurring prices that may be bought (server allowlist). */
const STRIPE_PRICE_IDS = defineString("STRIPE_PRICE_IDS", {
  default: DEFAULT_PRICE_IDS.join(","),
});
/** One-time prices that grant lifetime Pro (none sold today; may be empty). */
const LIFETIME_PRICE_IDS = defineString("LIFETIME_PRICE_IDS", { default: "" });
/** Default origin of the success / cancel / portal-return URLs. */
const APP_BASE_URL = defineString("APP_BASE_URL", { default: DEFAULT_APP_BASE_URL });
/** Client-supplied return origins that are accepted (others fall back to APP_BASE_URL). */
const APP_RETURN_ORIGINS = defineString("APP_RETURN_ORIGINS", {
  default: DEFAULT_RETURN_ORIGINS.join(","),
});
/** Stripe Tax on Checkout (owner decision; needs Stripe Tax set up in the dashboard). */
const STRIPE_AUTOMATIC_TAX = defineBoolean("STRIPE_AUTOMATIC_TAX", { default: false });

const isEmulator = () => process.env.FUNCTIONS_EMULATOR === "true";

function admin() {
  ensureDefaultApp(getApps, initializeApp);
  return { firestore: getFirestore(), auth: getAuth(), bucket: getStorage().bucket() };
}

/**
 * The Stripe client. In the Functions emulator without a real key (the @emu e2e run), a
 * Firestore-backed simulation (logic/emulatorStripe.ts, never deployed: firebase.json ignore).
 */
async function stripe(): Promise<StripePort> {
  const key = STRIPE_SECRET_KEY.value()?.trim() ?? "";
  if (isEmulator() && !/^(sk|rk)_/.test(key)) {
    const { emulatorStripe } = await import("./logic/emulatorStripe");
    return emulatorStripe(admin().firestore);
  }
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return stripeSdkPort(key);
}

function quotaDeps() {
  const a = admin();
  return { ...a, serverTimestamp: FieldValue.serverTimestamp };
}

async function billingDeps(): Promise<BillingDeps> {
  const a = admin();
  return {
    firestore: a.firestore,
    auth: a.auth,
    stripe: await stripe(),
    serverTimestamp: FieldValue.serverTimestamp,
    now: () => Date.now(),
    config: {
      priceIds: parseIdList(STRIPE_PRICE_IDS.value()),
      lifetimePriceIds: parseIdList(LIFETIME_PRICE_IDS.value()),
      baseUrl: APP_BASE_URL.value(),
      returnOrigins: parseIdList(APP_RETURN_ORIGINS.value()),
      allowLocalOrigins: isEmulator(),
      automaticTax: STRIPE_AUTOMATIC_TAX.value(),
    },
    // The art quota limit depends on pro (B-4).
    onEntitlementsChanged: (uid) => recomputeArtQuota(quotaDeps(), uid),
  };
}

function callerOf(req: CallableRequest): Caller | null {
  if (!req.auth) return null;
  const token = req.auth.token;
  return {
    uid: req.auth.uid,
    anonymous: token.firebase?.sign_in_provider === "anonymous",
    email: typeof token.email === "string" ? token.email : null,
  };
}

/**
 * Where a non-Stripe failure came from (message + top stack frames). Stripe SDK errors are left
 * at type/code/status (their messages can echo request details); nothing here contains secrets.
 */
function diagnostics(err: unknown): Record<string, string> {
  const e = err as { type?: unknown; message?: unknown; stack?: unknown } | null;
  if (!e || (typeof e.type === "string" && e.type.startsWith("Stripe"))) return {};
  const out: Record<string, string> = {};
  if (typeof e.message === "string") out.message = e.message.slice(0, 300);
  if (typeof e.stack === "string") out.stack = e.stack.split("\n").slice(0, 8).join(" | ");
  return out;
}

/** BillingError → HttpsError with a stable `reason`; Stripe errors are logged without secrets. */
async function billingCall<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof BillingError)
      throw new HttpsError(err.code, err.message, { reason: err.reason });
    logger.error(`${name} failed`, { error: stripeErrorText(err), ...diagnostics(err) });
    throw new HttpsError("unavailable", "Payments are unavailable right now. Try again soon.", {
      reason: "stripe-unavailable",
    });
  }
}

const withStripe = { secrets: [STRIPE_SECRET_KEY] };

export const hello = onCall((req) => ({ message: helloLogic(String(req.data?.name ?? "world")) }));

// ---------- payments (PAY-002, PAY-003) ----------

/** Signed-in, non-anonymous caller → Stripe Checkout URL (or `alreadyPro`). */
export const createCheckoutSession = onCall(withStripe, (req) =>
  billingCall("createCheckoutSession", async () =>
    createCheckoutSessionLogic(await billingDeps(), callerOf(req), req.data),
  ),
);

/** Signed-in caller with a Stripe customer → Billing Portal URL ("Manage subscription"). */
export const createPortalSession = onCall(withStripe, (req) =>
  billingCall("createPortalSession", async () =>
    createPortalSessionLogic(await billingDeps(), callerOf(req), req.data),
  ),
);

/** "Restore purchases": re-fetch from Stripe and recompute (once per 30 s per uid). */
export const refreshEntitlements = onCall(withStripe, (req) =>
  billingCall("refreshEntitlements", async () =>
    refreshEntitlementsLogic(await billingDeps(), callerOf(req)),
  ),
);

/** Stripe → signed events (DEPLOY.md Part 7 lists the subscribed event types). */
export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    try {
      const r = await handleStripeWebhook(
        await billingDeps(),
        { method: req.method, rawBody: req.rawBody, signature: req.headers["stripe-signature"] },
        STRIPE_WEBHOOK_SECRET.value()?.trim() ?? "",
      );
      if (r.status === 400) logger.warn("stripeWebhook: rejected an unsigned or invalid request");
      res.status(r.status).json(r.body);
    } catch (err) {
      logger.error("stripeWebhook: processing failed (Stripe will retry)", {
        error: stripeErrorText(err),
        ...diagnostics(err),
      });
      res.status(500).json({ error: "processing failed" });
    }
  },
);

// ---------- account deletion (AUTH-005, B-3) ----------

/** The signed-in caller deletes their own account and all of its data (Stripe first). */
export const deleteUserData = onCall(withStripe, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to delete your account.");
  try {
    const a = admin();
    // Without a Stripe client, a user who has a Stripe customer gets StripeCleanupError below.
    const port = await stripe().catch(() => null);
    const result = await deleteUserDataLogic<DocumentReference>({ ...a, stripe: port }, uid);
    return { ok: true, sharedPresetsDeleted: result.sharedPresetsDeleted };
  } catch (err) {
    if (err instanceof StripeCleanupError) {
      logger.error("deleteUserData: Stripe cleanup failed; nothing deleted", {
        customerId: err.customerId,
        error: err.detail,
      });
      throw new HttpsError(
        "unavailable",
        "Couldn't cancel your subscription with Stripe, so nothing was deleted. Try again.",
        { reason: "stripe-cleanup-failed" },
      );
    }
    throw err;
  }
});

/** Cleanup when an Auth user is deleted by any route (console, admin, the callable above). */
export const onUserDeleted = functionsV1
  .runWith({ secrets: [STRIPE_SECRET_KEY] })
  .auth.user()
  .onDelete(async (user) => {
    const a = admin();
    const port = await stripe().catch(() => null); // "stripe not configured" if it was needed
    // Best effort: the Auth user is already gone, so the data is deleted even if Stripe refuses.
    const r = await deleteUserDataLogic<DocumentReference>(
      { ...a, stripe: port, stripeFailure: "continue" },
      user.uid,
    );
    if (r.stripeError)
      logger.error("onUserDeleted: Stripe cleanup failed; cancel this customer by hand", {
        uid: user.uid,
        error: r.stripeError,
      });
  });

// ---------- cloud art quota (B-4, ART-024) ----------
// Recount on every art object change; the backstop deletes a NEW object that went over the limit
// (only while config/billing.paywallEnabled).

export const artQuotaOnFinalize = onObjectFinalized(async (event) => {
  const uid = artOwner(event.data.name);
  if (uid) await recomputeArtQuota(quotaDeps(), uid, { newObject: event.data.name });
});

export const artQuotaOnDelete = onObjectDeleted(async (event) => {
  const uid = artOwner(event.data.name);
  if (uid) await recomputeArtQuota(quotaDeps(), uid);
});
