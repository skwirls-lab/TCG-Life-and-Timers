// @req SET-002
import { describe, expect, it } from "vitest";
import { hasKey } from "@/lib/i18n";
import {
  artToCss,
  GRADIENTS,
  gradientById,
  gradientFor,
  hslToHex,
  PALETTE,
  solidFromHue,
} from "./gradients";

describe("curated backgrounds", () => {
  // @req SET-002
  it("has 16 uniquely named gradients and 8 palette colors", () => {
    expect(GRADIENTS).toHaveLength(16);
    expect(new Set(GRADIENTS.map((g) => g.id)).size).toBe(16);
    for (const g of GRADIENTS) {
      expect(g.css).toMatch(/gradient\(/);
      expect(g.accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(hasKey(`seat.gradient.${g.id}`)).toBe(true);
    }
    expect(PALETTE).toHaveLength(8);
    expect(gradientById("ocean")?.id).toBe("ocean");
    expect(gradientFor(GRADIENTS[2]!.css)?.id).toBe(GRADIENTS[2]!.id);
  });

  it("converts HSL to hex", () => {
    expect(hslToHex(0, 100, 50)).toBe("#ff0000");
    expect(hslToHex(120, 100, 50)).toBe("#00ff00");
    expect(hslToHex(240, 100, 50)).toBe("#0000ff");
    expect(hslToHex(-120, 100, 50)).toBe("#0000ff");
    expect(hslToHex(0, 0, 100)).toBe("#ffffff");
    expect(hslToHex(0, 200, -5)).toBe("#000000");
    expect(solidFromHue(200)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("artToCss", () => {
  // @req SET-002
  it("renders default, gradient and solid backgrounds", () => {
    expect(String(artToCss(undefined, "#123456").background)).toContain("#123456");
    expect(String(artToCss({ kind: "default", value: "" }, "#123456").background)).toContain(
      "#123456",
    );
    expect(artToCss({ kind: "gradient", value: "ocean" }, "#000").background).toBe(
      gradientById("ocean")!.css,
    );
    expect(artToCss({ kind: "gradient", value: "linear-gradient(red, blue)" }, "#000")).toEqual({
      background: "linear-gradient(red, blue)",
    });
    expect(String(artToCss({ kind: "gradient", value: "" }, "#abcdef").background)).toContain(
      "#abcdef",
    );
    expect(String(artToCss({ kind: "solid", value: "#ff0000" }, "#000").background)).toContain(
      "#ff0000",
    );
    expect(String(artToCss({ kind: "solid", value: "" }, "#00ff00").background)).toContain(
      "#00ff00",
    );
  });

  it("renders image art with focal point and zoom", () => {
    const plain = artToCss({ kind: "scryfall", value: "https://x.test/a.jpg" }, "#000");
    expect(plain.backgroundImage).toBe('url("https://x.test/a.jpg")');
    expect(plain.backgroundSize).toBe("cover");
    expect(plain.backgroundPosition).toBe("center");
    const focal = artToCss(
      { kind: "upload", value: "blob:abc", focal: { x: 0.25, y: 0.5, zoom: 1.5 } },
      "#000",
    );
    expect(focal.backgroundSize).toBe("150% auto");
    expect(focal.backgroundPosition).toBe("25% 50%");
    // An upload id that still needs resolving falls back to the seat color.
    expect(String(artToCss({ kind: "upload", value: "art-id-1" }, "#0f0f0f").background)).toContain(
      "#0f0f0f",
    );
  });

  // @req ART-022
  it("uses a resolved object URL for uploads", () => {
    const css = artToCss({ kind: "upload", value: "art-id-1" }, "#000", "blob:http://x/1");
    expect(css.backgroundImage).toBe('url("blob:http://x/1")');
  });
});
