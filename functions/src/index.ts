import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onObjectDeleted, onObjectFinalized } from "firebase-functions/v2/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as functionsV1 from "firebase-functions/v1";
import { helloLogic } from "./logic/hello";
import {
  deleteUserData as deleteUserDataLogic,
  type DeleteUserDataDeps,
} from "./logic/deleteUserData";
import { syncEntitlements as syncEntitlementsLogic } from "./logic/syncEntitlements";
import { stripeFromEnv } from "./logic/stripe";
import { artOwner, recomputeArtQuota } from "./logic/artQuota";

/**
 * Lazily initialised admin dependencies (keeps cold-start and deploy analysis cheap). The Stripe
 * client exists only when the optional env STRIPE_SECRET_KEY is set (B-3, DEPLOY.md Part 7).
 */
function deps(): DeleteUserDataDeps {
  if (getApps().length === 0) initializeApp();
  return {
    firestore: getFirestore(),
    bucket: getStorage().bucket(),
    auth: getAuth(),
    stripe: stripeFromEnv(),
  };
}

export const hello = onCall((req) => ({ message: helloLogic(String(req.data?.name ?? "world")) }));

/** AUTH-005: the signed-in caller deletes their own account and all of its data. */
export const deleteUserData = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to delete your account.");
  const result = await deleteUserDataLogic(deps(), uid);
  return { ok: true, sharedPresetsDeleted: result.sharedPresetsDeleted };
});

/** Cleanup when an Auth user is deleted by any route (console, admin, the callable above). */
export const onUserDeleted = functionsV1.auth.user().onDelete(async (user) => {
  await deleteUserDataLogic(deps(), user.uid);
});

/**
 * PAY-002/PAY-003: recompute users/{uid}/private/entitlements (+ the `pro` custom claim) whenever
 * the Stripe extension mirrors a subscription or a payment. LIFETIME_PRICE_IDS (env) lists the
 * one-time price ids that grant lifetime Pro.
 */
function entitlementDeps() {
  if (getApps().length === 0) initializeApp();
  return {
    firestore: getFirestore(),
    auth: getAuth(),
    serverTimestamp: FieldValue.serverTimestamp,
  };
}

function quotaDeps() {
  if (getApps().length === 0) initializeApp();
  return { ...entitlementDeps(), bucket: getStorage().bucket() };
}

/** Recompute entitlements, then the art quota (its limit depends on pro, B-4). */
async function syncAll(uid: string) {
  const r = await syncEntitlementsLogic(entitlementDeps(), uid);
  if (!r.userDeleted && r.written) await recomputeArtQuota(quotaDeps(), uid);
}

export const syncEntitlementsOnSubscription = onDocumentWritten(
  "customers/{uid}/subscriptions/{subscriptionId}",
  async (event) => {
    await syncAll(event.params.uid);
  },
);

export const syncEntitlementsOnPayment = onDocumentWritten(
  "customers/{uid}/payments/{paymentId}",
  async (event) => {
    await syncAll(event.params.uid);
  },
);

/**
 * B-4 / ART-024: server-side cloud art quota. Recount on every art object change; the backstop
 * deletes a NEW object that went over the limit (only while config/billing.paywallEnabled).
 */
export const artQuotaOnFinalize = onObjectFinalized(async (event) => {
  const uid = artOwner(event.data.name);
  if (uid) await recomputeArtQuota(quotaDeps(), uid, { newObject: event.data.name });
});

export const artQuotaOnDelete = onObjectDeleted(async (event) => {
  const uid = artOwner(event.data.name);
  if (uid) await recomputeArtQuota(quotaDeps(), uid);
});
