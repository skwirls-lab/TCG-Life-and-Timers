// @req ARCH-008
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCan, useEntitlements, useLimit } from "./store";

describe("entitlement store hooks", () => {
  it("reflects policy and pro changes", () => {
    const can = renderHook(() => useCan("historyExport"));
    const lim = renderHook(() => useLimit("profiles"));
    expect(can.result.current).toBe(true);
    act(() => useEntitlements.getState().setPolicy("TIERED"));
    can.rerender();
    lim.rerender();
    expect(can.result.current).toBe(false);
    expect(lim.result.current).toBe(4);
    act(() => useEntitlements.getState().setPro(true));
    can.rerender();
    expect(can.result.current).toBe(true);
    act(() => {
      useEntitlements.getState().setPolicy("ALL_FREE");
      useEntitlements.getState().setPro(false);
    });
  });
});
