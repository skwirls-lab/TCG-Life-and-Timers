"use client";
import { create } from "zustand";
import type { ProFeature } from "./features";
import { can, defaultPolicy, limit, type EntitlementState } from "./policy";
import type { FREE_LIMITS } from "./features";

interface EntitlementStore extends EntitlementState {
  setPro: (pro: boolean) => void;
  setPolicy: (policy: EntitlementState["policy"]) => void;
}

export const useEntitlements = create<EntitlementStore>((set) => ({
  policy: defaultPolicy(),
  pro: false,
  setPro: (pro) => set({ pro }),
  setPolicy: (policy) => set({ policy }),
}));

export function useCan(feature: ProFeature): boolean {
  return useEntitlements((s) => can(s, feature));
}

export function useLimit(key: keyof typeof FREE_LIMITS): number {
  return useEntitlements((s) => limit(s, key));
}
