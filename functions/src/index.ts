import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as functionsV1 from "firebase-functions/v1";
import { helloLogic } from "./logic/hello";
import {
  deleteUserData as deleteUserDataLogic,
  type DeleteUserDataDeps,
} from "./logic/deleteUserData";
import { syncEntitlements as syncEntitlementsLogic } from "./logic/syncEntitlements";

/** Lazily initialised admin dependencies (keeps cold-start and deploy analysis cheap). */
function deps(): DeleteUserDataDeps {
  if (getApps().length === 0) initializeApp();
  return { firestore: getFirestore(), bucket: getStorage().bucket(), auth: getAuth() };
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

export const syncEntitlementsOnSubscription = onDocumentWritten(
  "customers/{uid}/subscriptions/{subscriptionId}",
  async (event) => {
    await syncEntitlementsLogic(entitlementDeps(), event.params.uid);
  },
);

export const syncEntitlementsOnPayment = onDocumentWritten(
  "customers/{uid}/payments/{paymentId}",
  async (event) => {
    await syncEntitlementsLogic(entitlementDeps(), event.params.uid);
  },
);
