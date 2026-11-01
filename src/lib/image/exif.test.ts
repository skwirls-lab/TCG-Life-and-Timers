// @vitest-environment node
// @req ART-021
import { describe, expect, it } from "vitest";
import { hasExif, parseTiff, readExif, sniffContainer } from "./exif";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );

/** Minimal TIFF block: IFD0 with Orientation (and optionally a GPS pointer). */
function tiff(order: "II" | "MM", orientation: number, gps = false): number[] {
  const le = order === "II";
  const u16 = (v: number) => (le ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v: number) =>
    le
      ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24]
      : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  const entries = [[...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0]];
  if (gps) entries.push([...u16(0x8825), ...u16(4), ...u32(1), ...u32(0)]);
  return [
    ...[...order].map((c) => c.charCodeAt(0)),
    ...u16(42),
    ...u32(8),
    ...u16(entries.length),
    ...entries.flat(),
    ...u32(0),
  ];
}

function jpegWithApp1(payload: number[], before: number[] = []): Uint8Array {
  const exif = [...bytes("Exif"), 0, 0, ...payload];
  const len = exif.length + 2;
  return bytes(
    [0xff, 0xd8],
    before,
    [0xff, 0xe1, len >> 8, len & 0xff],
    exif,
    [0xff, 0xda, 0, 2, 0xff, 0xd9],
  );
}

describe("sniffContainer", () => {
  it("recognises JPEG, WebP, PNG and unknown bytes", () => {
    expect(sniffContainer(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniffContainer(bytes("RIFF", [0, 0, 0, 0], "WEBP"))).toBe("webp");
    expect(sniffContainer(bytes([0x89], "PNG", [13, 10, 26, 10]))).toBe("png");
    expect(sniffContainer(bytes("GIF89a"))).toBe("unknown");
    expect(sniffContainer(new ArrayBuffer(0))).toBe("unknown");
  });
});

describe("JPEG EXIF detection", () => {
  it("finds APP1 Exif in little- and big-endian TIFF", () => {
    const le = jpegWithApp1(tiff("II", 6, true));
    expect(hasExif(le)).toBe(true);
    expect(readExif(le)).toEqual({ orientation: 6, hasGps: true });
    const be = jpegWithApp1(tiff("MM", 8));
    expect(readExif(be.buffer as ArrayBuffer)).toEqual({ orientation: 8, hasGps: false });
  });

  it("skips JFIF APP0, fill bytes and standalone markers before APP1", () => {
    const app0 = [0xff, 0xe0, 0, 6, ...bytes("JFIF")];
    const jpg = jpegWithApp1(tiff("II", 3), [...app0, 0xff, 0xff, 0xd0]);
    expect(readExif(jpg)?.orientation).toBe(3);
  });

  it("reports no EXIF for plain, truncated or corrupt JPEGs", () => {
    const plain = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xda, 0, 2]);
    expect(hasExif(plain)).toBe(false);
    expect(readExif(plain)).toBeUndefined();
    expect(hasExif(bytes([0xff, 0xd8, 0xff, 0xd9, 0, 0]))).toBe(false); // EOI
    expect(hasExif(bytes([0xff, 0xd8, 0xff, 0x00, 0, 0]))).toBe(false); // garbage marker byte
    expect(hasExif(bytes([0xff, 0xd8, 0xff, 0xe1, 0, 1]))).toBe(false); // bad length
    expect(hasExif(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]))).toBe(false); // runs out
    // APP1 that is XMP, not Exif
    const xmp = bytes([0xff, 0xd8, 0xff, 0xe1, 0, 8], "http", [0, 0, 0xff, 0xd9]);
    expect(hasExif(xmp)).toBe(false);
  });

  it("returns undefined for malformed TIFF blocks", () => {
    expect(readExif(jpegWithApp1([0, 0]))).toBeUndefined(); // too short
    expect(readExif(jpegWithApp1([...bytes("XX"), 42, 0, 8, 0, 0, 0]))).toBeUndefined();
    expect(readExif(jpegWithApp1([...bytes("II"), 43, 0, 8, 0, 0, 0]))).toBeUndefined();
    expect(readExif(jpegWithApp1([...bytes("II"), 42, 0, 255, 0, 0, 0]))).toBeUndefined();
    // IFD claims 5 entries but the data ends: parse what exists
    const t = tiff("II", 2);
    t[8] = 5;
    expect(parseTiff(new Uint8Array(t), 0)).toEqual({ orientation: 2, hasGps: false });
  });
});

describe("WebP / PNG EXIF detection", () => {
  function riff(chunks: [string, number[]][]): Uint8Array {
    const body = chunks.flatMap(([type, data]) => {
      const n = data.length;
      const pad = n % 2 ? [0] : [];
      return [...bytes(type), n & 0xff, (n >> 8) & 0xff, 0, 0, ...data, ...pad];
    });
    return bytes("RIFF", [0, 0, 0, 0], "WEBP", body);
  }

  it("finds EXIF chunks with or without the Exif\\0\\0 prefix", () => {
    const plain = riff([["VP8 ", [1, 2, 3]]]);
    expect(hasExif(plain)).toBe(false);
    expect(readExif(plain)).toBeUndefined();
    const withExif = riff([
      ["VP8X", [0, 0, 0]],
      ["EXIF", tiff("II", 6, true)],
    ]);
    expect(hasExif(withExif)).toBe(true);
    expect(readExif(withExif)).toEqual({ orientation: 6, hasGps: true });
    const prefixed = riff([["EXIF", [...bytes("Exif"), 0, 0, ...tiff("MM", 5)]]]);
    expect(readExif(prefixed)?.orientation).toBe(5);
  });

  it("finds PNG eXIf chunks", () => {
    const chunk = (type: string, data: number[]) => {
      const n = data.length;
      return [
        n >>> 24,
        (n >> 16) & 0xff,
        (n >> 8) & 0xff,
        n & 0xff,
        ...bytes(type),
        ...data,
        0,
        0,
        0,
        0,
      ];
    };
    const sig = [0x89, ...bytes("PNG"), 13, 10, 26, 10];
    const png = bytes(sig, chunk("IHDR", new Array(13).fill(0)), chunk("eXIf", tiff("MM", 7)));
    expect(hasExif(png)).toBe(true);
    expect(readExif(png)?.orientation).toBe(7);
    const none = bytes(sig, chunk("IHDR", new Array(13).fill(0)));
    expect(hasExif(none)).toBe(false);
    expect(readExif(none)).toBeUndefined();
  });

  it("ignores unknown containers", () => {
    expect(hasExif(bytes("GIF89a"))).toBe(false);
    expect(readExif(bytes("GIF89a"))).toBeUndefined();
  });
});
