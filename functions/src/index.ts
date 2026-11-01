import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as functionsV1 from "firebase-functions/v1";
import { helloLogic } from "./logic/hello";
import {
  deleteUserData as deleteUserDataLogic,
  type DeleteUserDataDeps,
} from "./logic/deleteUserData";

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
