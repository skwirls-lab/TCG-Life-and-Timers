import { onCall } from "firebase-functions/v2/https";
import { helloLogic } from "./logic/hello";

export const hello = onCall((req) => ({ message: helloLogic(String(req.data?.name ?? "world")) }));
