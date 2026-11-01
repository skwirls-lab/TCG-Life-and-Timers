// @vitest-environment node
// @req ART-021 @req ART-025
/**
 * Real-pixel proof of the processing contract using sharp as a stand-in for the browser's
 * createImageBitmap + canvas (jsdom has neither). Fixture: a 4000×3000 camera-style JPEG with
 * EXIF Orientation=6 and GPS tags, generated on the fly.
 */
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { hasExif, readExif } from "./exif";
import { processImage, type DecodeAdapter, type EncodeAdapter } from "./process";

const W = 4000;
const H = 3000;

/** Stored pixels: top half red, bottom half blue, with mild texture. */
async function makeCameraJpeg(): Promise<Buffer> {
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const top = y < H / 2;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const tex = (x * 7 + y * 13) % 24;
      raw[i] = top ? 210 - tex : 20 + tex;
      raw[i + 1] = 40 + ((x >> 5) % 16);
      raw[i + 2] = top ? 30 + tex : 210 - tex;
    }
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } })
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: { Make: "TestCam", Model: "Fixture 1" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "51/1 30/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "0/1 7/1 0/1",
      },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

const toBlob = (buf: Buffer, type: string) => new Blob([new Uint8Array(buf)], { type });

/** Like createImageBitmap(file, { imageOrientation: 'from-image' }): oriented dimensions. */
const sharpDecode: DecodeAdapter<Buffer> = async (file) => {
  const source = Buffer.from(await file.arrayBuffer());
  const meta = await sharp(source).metadata();
  return { source, width: meta.autoOrient.width, height: meta.autoOrient.height };
};

/** Like drawImage + convertToBlob: pixels only, so no metadata survives. */
const sharpEncode: EncodeAdapter<Buffer> = async (img, size, type, quality) => {
  const pipeline = sharp(img.source).rotate().resize(size.width, size.height, { fit: "fill" });
  const q = Math.round(quality * 100);
  const out =
    type === "image/webp"
      ? await pipeline.webp({ quality: q }).toBuffer()
      : await pipeline.jpeg({ quality: q }).toBuffer();
  return toBlob(out, type);
};

let input: Buffer;
beforeAll(async () => {
  input = await makeCameraJpeg();
}, 30_000);

describe("EXIF-rotated camera JPEG with GPS (fixture)", () => {
  it("is detected as carrying EXIF with orientation 6 and GPS", () => {
    expect(input.length).toBeLessThan(15 * 1024 * 1024);
    expect(hasExif(input)).toBe(true);
    expect(readExif(input)).toEqual({ orientation: 6, hasGps: true });
  });

  it("processes to an upright 1200×1600 WebP under 400 KB with no EXIF", async () => {
    const out = await processImage(toBlob(input, "image/jpeg"), {
      decode: sharpDecode,
      encode: sharpEncode,
    });
    expect(out.type).toBe("image/webp");
    expect([out.width, out.height]).toEqual([1200, 1600]);
    expect(out.bytes).toBeLessThan(400 * 1024);
    expect(out.overTarget).toBe(false);

    const bytes = new Uint8Array(await out.blob.arrayBuffer());
    expect(hasExif(bytes)).toBe(false);
    expect(readExif(bytes)).toBeUndefined();

    // Orientation 6 = rotate 90° clockwise: the stored top (red) ends up on the right.
    const meta = await sharp(bytes).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 1600]);
    const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return { r: data[i]!, b: data[i + 2]! };
    };
    const right = px(1100, 800);
    const left = px(100, 800);
    expect(right.r).toBeGreaterThan(right.b);
    expect(left.b).toBeGreaterThan(left.r);
  }, 30_000);

  it("detects EXIF in WebP and PNG containers when metadata is kept", async () => {
    const webp = await sharp(input).resize(64).webp().keepExif().toBuffer();
    expect(hasExif(webp)).toBe(true);
    expect(readExif(webp)?.hasGps).toBe(true);
    const png = await sharp(input).resize(64).png().keepExif().toBuffer();
    expect(hasExif(png)).toBe(true);
    expect(readExif(png)?.orientation).toBe(6);
    const stripped = await sharp(input).resize(64).webp().toBuffer();
    expect(hasExif(stripped)).toBe(false);
    expect(readExif(stripped)).toBeUndefined();
  });
});
