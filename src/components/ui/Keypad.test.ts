// @vitest-environment node
// @req INP-007
import { describe, expect, it } from "vitest";
import { parseKeypad } from "./Keypad";

describe("parseKeypad", () => {
  it("parses calculator ops", () => {
    expect(parseKeypad("-1500", "calc")).toEqual({ op: "sub", value: 1500 });
    expect(parseKeypad("+800", "calc")).toEqual({ op: "add", value: 800 });
    expect(parseKeypad("=4000", "calc")).toEqual({ op: "set", value: 4000 });
    expect(parseKeypad("/2", "calc")).toEqual({ op: "half", value: 2 });
    expect(parseKeypad("300", "calc")).toEqual({ op: "sub", value: 300 });
  });
  it("treats bare numbers as set in set mode", () => {
    expect(parseKeypad("25", "set")).toEqual({ op: "set", value: 25 });
  });
  it("rejects junk", () => {
    expect(parseKeypad("", "set")).toBeNull();
    expect(parseKeypad("1-2", "set")).toBeNull();
  });
});
