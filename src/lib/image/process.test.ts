// @vitest-environment node
// @req ART-020 @req ART-021 @req ART-025
import { describe, expect, it, vi } from "vitest";
import { orientedSize } from "./exif";
import {
  ImageValidationError,
  MAX_EDGE_PX,
  MAX_INPUT_BYTES,
  QUALITY_STEPS,
  createBitmapDecoder,
  createCanvasEncoder,
  fitWithin,
  processImage,
  selectCanvasBackend,
  validateImageFile,
  type CanvasEnv,
  type DecodeAdapter,
  type DecodedImage,
  type EncodeAdapter,
} from "./process";

const blobOf = (bytes: number, type: string) => new Blob([new Uint8Array(bytes)], { type });
const jpeg = (bytes = 1024) => blobOf(bytes, "image/jpeg");

function fakeDecoder(width: number, height: number) {
  const close = vi.fn();
  const decode: DecodeAdapter<string> = async () => ({ source: "bitmap", width, height, close });
  return { decode, close };
}

/** Encoder whose output size depends on quality; records each call. */
function fakeEncoder(
  sizeFor: (q: number, type: string) => number,
  outType?: (t: string) => string,
) {
  const calls: { type: string; quality: number; width: number; height: number }[] = [];
  const encode: EncodeAdapter<string> = async (_img, size, type, quality) => {
    calls.push({ type, quality, ...size });
    return blobOf(sizeFor(quality, type), outType ? outType(type) : type);
  };
  return { encode, calls };
}

async function rejection(p: Promise<unknown>): Promise<ImageValidationError> {
  const e = await p.catch((err: unknown) => err);
  expect(e).toBeInstanceOf(ImageValidationError);
  return e as ImageValidationError;
}

describe("fitWithin", () => {
  it("fits the long edge to 1600 px keeping aspect ratio", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(5000, 5000, 1600)).toEqual({ width: 1600, height: 1600 });
    expect(fitWithin(4032, 3024, MAX_EDGE_PX)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1000, 333, 999)).toEqual({ width: 999, height: 333 });
  });

  it("never upscales and never returns a zero dimension", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 10, 1600)).toEqual({ width: 1600, height: 10 });
    expect(fitWithin(100000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });

  it("uses oriented (swapped) dimensions for EXIF orientations 5–8", () => {
    // A 4000×3000 sensor image with orientation 6 displays as 3000×4000.
    const shown = orientedSize(4000, 3000, 6);
    expect(shown).toEqual({ width: 3000, height: 4000 });
    expect(fitWithin(shown.width, shown.height, 1600)).toEqual({ width: 1200, height: 1600 });
    for (const o of [5, 7, 8]) expect(orientedSize(4000, 3000, o).width).toBe(3000);
    for (const o of [1, 2, 3, 4]) expect(orientedSize(4000, 3000, o).width).toBe(4000);
    expect(orientedSize(4000, 3000)).toEqual({ width: 4000, height: 3000 });
  });

  it("rejects invalid dimensions", () => {
    expect(() => fitWithin(0, 10, 1600)).toThrow(RangeError);
    expect(() => fitWithin(10, -1, 1600)).toThrow(RangeError);
    expect(() => fitWithin(10, 10, 0)).toThrow(RangeError);
    expect(() => fitWithin(Number.NaN, 10, 10)).toThrow(RangeError);
  });
});

describe("validateImageFile (ART-025)", () => {
  it("accepts image/* up to 15 MB", () => {
    expect(() => validateImageFile(jpeg())).not.toThrow();
    expect(() => validateImageFile(blobOf(10, "image/heic"))).not.toThrow();
    expect(() => validateImageFile(blobOf(MAX_INPUT_BYTES, "image/png"))).not.toThrow();
  });

  it("rejects non-images, empty files and files over 15 MB", () => {
    const codes = [
      blobOf(10, "application/pdf"),
      blobOf(10, ""),
      blobOf(0, "image/png"),
      blobOf(MAX_INPUT_BYTES + 1, "image/png"),
    ].map((b) => {
      try {
        validateImageFile(b);
        return "ok";
      } catch (e) {
        expect(e).toBeInstanceOf(ImageValidationError);
        return (e as ImageValidationError).code;
      }
    });
    expect(codes).toEqual(["not-image", "not-image", "empty", "too-large"]);
    expect(() => validateImageFile(jpeg(11), 10)).toThrow(/limit is 10/);
  });

  it("processImage validates before decoding", async () => {
    const { decode } = fakeDecoder(10, 10);
    const spy = vi.fn(decode);
    const e = await rejection(processImage(blobOf(10, "text/plain"), { decode: spy }));
    expect(e.code).toBe("not-image");
    expect(e.name).toBe("ImageValidationError");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("processImage pipeline (ART-021)", () => {
  it("resizes to the long edge, encodes WebP 0.8 and closes the bitmap", async () => {
    const { decode, close } = fakeDecoder(4000, 3000);
    const { encode, calls } = fakeEncoder(() => 200_000);
    const out = await processImage(jpeg(), { decode, encode });
    expect(calls).toEqual([{ type: "image/webp", quality: 0.8, width: 1600, height: 1200 }]);
    expect(out).toMatchObject({
      type: "image/webp",
      width: 1600,
      height: 1200,
      bytes: 200_000,
      quality: 0.8,
      overTarget: false,
    });
    expect(out.blob.type).toBe("image/webp");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("steps quality 0.8 → 0.7 → 0.6 while the output is over 400 KB", async () => {
    const { decode } = fakeDecoder(4000, 3000);
    const sizes: Record<number, number> = { 0.8: 600_000, 0.7: 450_000, 0.6: 300_000 };
    const { encode, calls } = fakeEncoder((q) => sizes[q]!);
    const out = await processImage(jpeg(), { decode, encode });
    expect(calls.map((c) => c.quality)).toEqual([...QUALITY_STEPS]);
    expect(out.quality).toBe(0.6);
    expect(out.bytes).toBe(300_000);
    expect(out.overTarget).toBe(false);
  });

  it("stops stepping as soon as the target is met", async () => {
    const { decode } = fakeDecoder(4000, 3000);
    const { encode, calls } = fakeEncoder((q) => (q >= 0.8 ? 500_000 : 390_000));
    const out = await processImage(jpeg(), { decode, encode });
    expect(calls.map((c) => c.quality)).toEqual([0.8, 0.7]);
    expect(out.quality).toBe(0.7);
  });

  it("returns the lowest-quality result flagged overTarget when 0.6 is still too big", async () => {
    const { decode } = fakeDecoder(4000, 3000);
    const { encode } = fakeEncoder((q) => Math.round(q * 1_000_000));
    const out = await processImage(jpeg(), { decode, encode });
    expect(out.quality).toBe(0.6);
    expect(out.overTarget).toBe(true);
  });

  it("rejects outputs above the 2 MB storage limit", async () => {
    const { decode, close } = fakeDecoder(4000, 3000);
    const { encode } = fakeEncoder(() => 3 * 1024 * 1024);
    const e = await rejection(processImage(jpeg(), { decode, encode }));
    expect(e.code).toBe("output-too-large");
    expect(close).toHaveBeenCalled();
  });

  it("falls back to JPEG when the encoder can't produce WebP (detected by output type)", async () => {
    const { decode } = fakeDecoder(1000, 2000);
    const { encode, calls } = fakeEncoder(
      (q) => (q > 0.75 ? 500_000 : 100_000),
      (t) => (t === "image/webp" ? "image/png" : t),
    );
    const out = await processImage(jpeg(), { decode, encode });
    expect(calls.map((c) => `${c.type}@${c.quality}`)).toEqual([
      "image/webp@0.8",
      "image/jpeg@0.8",
      "image/jpeg@0.7", // once WebP is known unsupported it is not retried
    ]);
    expect(out.type).toBe("image/jpeg");
    expect(out.width).toBe(800);
    expect(out.height).toBe(1600);
  });

  it("encodes JPEG directly when preferWebp is false and honours custom options", async () => {
    const { decode } = fakeDecoder(500, 400);
    const { encode, calls } = fakeEncoder(() => 900);
    const out = await processImage(jpeg(), {
      decode,
      encode,
      preferWebp: false,
      maxEdge: 250,
      qualities: [0.9],
      targetBytes: 1000,
    });
    expect(calls).toEqual([{ type: "image/jpeg", quality: 0.9, width: 250, height: 200 }]);
    expect(out.quality).toBe(0.9);
  });

  it("uses the default quality steps when given an empty list", async () => {
    const { decode } = fakeDecoder(10, 10);
    const { encode, calls } = fakeEncoder(() => 10);
    await processImage(jpeg(), { decode, encode, qualities: [] });
    expect(calls[0]!.quality).toBe(0.8);
  });

  it("maps decoder failures and empty bitmaps to decode-failed", async () => {
    const failing: DecodeAdapter<string> = async () => {
      throw new Error("corrupt");
    };
    const e1 = await rejection(processImage(jpeg(), { decode: failing }));
    expect(e1.code).toBe("decode-failed");
    expect((e1.cause as Error).message).toBe("corrupt");

    const { decode, close } = fakeDecoder(0, 0);
    const e2 = await rejection(
      processImage(jpeg(), { decode, encode: fakeEncoder(() => 1).encode }),
    );
    expect(e2.code).toBe("decode-failed");
    expect(close).toHaveBeenCalled();
  });

  it("maps encoder failures and unexpected output types to encode-failed", async () => {
    const { decode } = fakeDecoder(10, 10);
    const throwing: EncodeAdapter<string> = async () => {
      throw new Error("gpu lost");
    };
    expect((await rejection(processImage(jpeg(), { decode, encode: throwing }))).code).toBe(
      "encode-failed",
    );
    const png = fakeEncoder(
      () => 10,
      () => "image/png",
    );
    const e = await rejection(processImage(jpeg(), { decode, encode: png.encode }));
    expect(e.code).toBe("encode-failed");
    expect(e.message).toContain("image/png");
  });

  it("works with decoders that have no close()", async () => {
    const decode: DecodeAdapter<string> = async () => ({ source: "x", width: 2, height: 2 });
    const out = await processImage(jpeg(), { decode, encode: fakeEncoder(() => 5).encode });
    expect(out.width).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------
// Default adapters with fake browser globals

class FakeCtx {
  imageSmoothingEnabled = false;
  imageSmoothingQuality = "low";
  drawn: unknown[] = [];
  drawImage(...args: unknown[]) {
    this.drawn.push(args);
  }
}

function fakeOffscreenEnv(opts: { ctx?: boolean } = {}) {
  const made: { w: number; h: number; ctx: FakeCtx; opts?: unknown }[] = [];
  class FakeOffscreen {
    ctx = new FakeCtx();
    constructor(
      public w: number,
      public h: number,
    ) {
      made.push({ w, h, ctx: this.ctx });
    }
    getContext() {
      return opts.ctx === false ? null : this.ctx;
    }
    async convertToBlob(o: { type: string; quality: number }) {
      made[made.length - 1]!.opts = o;
      return blobOf(7, o.type);
    }
  }
  return { env: { OffscreenCanvas: FakeOffscreen } as unknown as CanvasEnv, made };
}

function fakeHtmlEnv(result: "blob" | "null") {
  const ctx = new FakeCtx();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob(cb: (b: Blob | null) => void, type: string, quality: number) {
      canvas.args = [type, quality];
      cb(result === "blob" ? blobOf(3, type) : null);
    },
    args: [] as unknown[],
  };
  const env = { document: { createElement: () => canvas } } as unknown as CanvasEnv;
  return { env, canvas, ctx };
}

const img: DecodedImage = { source: {} as CanvasImageSource, width: 100, height: 50 };

describe("default adapters", () => {
  it("selects OffscreenCanvas, then <canvas>, then nothing", () => {
    expect(selectCanvasBackend(fakeOffscreenEnv().env)).toBe("offscreen");
    expect(selectCanvasBackend(fakeHtmlEnv("blob").env)).toBe("html");
    const noBlob = {
      OffscreenCanvas: function NoBlobCanvas() {},
      ...fakeHtmlEnv("blob").env,
    } as CanvasEnv;
    expect(selectCanvasBackend(noBlob)).toBe("html");
    expect(selectCanvasBackend({})).toBeNull();
  });

  it("decodes with createImageBitmap(file, { imageOrientation: 'from-image' })", async () => {
    const close = vi.fn();
    const createImageBitmap = vi.fn(
      async () => ({ width: 30, height: 40, close }) as unknown as ImageBitmap,
    );
    const decoded = await createBitmapDecoder({ createImageBitmap })(jpeg());
    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
      imageOrientation: "from-image",
    });
    expect(decoded).toMatchObject({ width: 30, height: 40 });
    decoded.close!();
    expect(close).toHaveBeenCalled();
    await expect(createBitmapDecoder({})(jpeg())).rejects.toThrow(/createImageBitmap/);
  });

  it("encodes via OffscreenCanvas.convertToBlob at the target size", async () => {
    const { env, made } = fakeOffscreenEnv();
    const blob = await createCanvasEncoder(env)(img, { width: 20, height: 10 }, "image/webp", 0.8);
    expect(blob.type).toBe("image/webp");
    expect(made[0]).toMatchObject({ w: 20, h: 10, opts: { type: "image/webp", quality: 0.8 } });
    expect(made[0]!.ctx.drawn).toEqual([[img.source, 0, 0, 20, 10]]);
    expect(made[0]!.ctx.imageSmoothingQuality).toBe("high");
  });

  it("falls back to <canvas>.toBlob and rejects when it yields null", async () => {
    const ok = fakeHtmlEnv("blob");
    const blob = await createCanvasEncoder(ok.env)(img, { width: 8, height: 4 }, "image/jpeg", 0.7);
    expect(blob.type).toBe("image/jpeg");
    expect(ok.canvas).toMatchObject({ width: 8, height: 4, args: ["image/jpeg", 0.7] });
    expect(ok.ctx.drawn).toHaveLength(1);
    const bad = fakeHtmlEnv("null");
    await expect(
      createCanvasEncoder(bad.env)(img, { width: 1, height: 1 }, "image/jpeg", 0.7),
    ).rejects.toThrow(/null/);
  });

  it("fails clearly without a canvas or 2D context", async () => {
    await expect(
      createCanvasEncoder({})(img, { width: 1, height: 1 }, "image/webp", 0.8),
    ).rejects.toThrow(/No canvas/);
    const { env } = fakeOffscreenEnv({ ctx: false });
    await expect(
      createCanvasEncoder(env)(img, { width: 1, height: 1 }, "image/webp", 0.8),
    ).rejects.toThrow(/2D canvas context/);
  });

  it("processImage uses the browser adapters by default (none in Node → decode-failed)", async () => {
    const e = await rejection(processImage(jpeg()));
    expect(e.code).toBe("decode-failed");
  });
});
