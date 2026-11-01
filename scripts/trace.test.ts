// @vitest-environment node
import { describe, expect, it } from "vitest";
import { citedIds, parsePrd } from "./trace";

describe("trace script", () => {
  it("parses requirement IDs with priority and milestone", () => {
    const prd = "- **CMD-004 (P0, M1):** text\n- **TOK-005 (P2):** later\n| x | new: **SET-030** |";
    const r = parsePrd(prd);
    expect(r.get("CMD-004")).toEqual({ id: "CMD-004", priority: "P0", milestone: "M1" });
    expect(r.get("TOK-005")?.priority).toBe("P2");
    expect(r.get("SET-030")?.priority).toBe("P1");
  });
  it("expands ranges", () => {
    const ids = citedIds("INP-001..003 and CMD-010");
    expect([...ids].sort()).toEqual(["CMD-010", "INP-001", "INP-002", "INP-003"]);
  });
});
