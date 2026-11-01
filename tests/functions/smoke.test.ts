import { describe, expect, it } from "vitest";
import { helloLogic } from "../../functions/src/logic/hello";

describe("functions logic", () => {
  it("is importable and pure", () => {
    expect(helloLogic("x")).toBe("hello x");
  });
});
