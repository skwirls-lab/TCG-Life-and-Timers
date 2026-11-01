import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GameIcon, GAME_ICON_IDS, hasGameIcon } from "./GameIcon";

describe("GameIcon", () => {
  it("renders known and unknown ids without crashing", () => {
    const { container } = render(
      <>
        <GameIcon id="poison" />
        <GameIcon id="does-not-exist" />
      </>,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });
  it("exposes the id list", () => {
    expect(GAME_ICON_IDS.length).toBeGreaterThan(40);
    expect(hasGameIcon("crown")).toBe(true);
    expect(hasGameIcon("nope")).toBe(false);
  });
});
