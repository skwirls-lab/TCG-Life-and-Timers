/** Paywall entry points (T7.1). Mount `PaywallHost` once; gate with `ProLock` / `useProGate`. */
export { PaywallHost } from "./PaywallHost";
export { ProLock } from "./ProLock";
export { useProGate, requirePro, requireLimit } from "@/lib/entitlements/gate";
export { usePaywall, openPaywall } from "@/lib/entitlements/paywall";
