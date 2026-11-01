// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cn } from "./cn";
import { useActiveGameFlag } from "../app/activeGame";

describe("small utils", () => {
  it("joins truthy class names", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
  it("active game flag toggles", () => {
    useActiveGameFlag.getState().setInProgress(true);
    expect(useActiveGameFlag.getState().inProgress).toBe(true);
    useActiveGameFlag.getState().setInProgress(false);
  });
});
