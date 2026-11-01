/**
 * Client-side upload processing (T5.3; ART-020, ART-021, ART-025).
 *
 * decode (EXIF orientation applied) → resize so the long edge ≤ 1600 px → encode WebP 0.8
 * (JPEG 0.8 when the browser can't encode WebP) → step quality 0.8 → 0.7 → 0.6 while the
 * output is over 400 KB. Re-encoding from pixels drops every metadata block (EXIF/GPS).
 *
 * The decode/encode steps are injectable adapters so the logic is unit-testable without a
 * real canvas; the defaults use `createImageBitmap` and `OffscreenCanvas` (or `<canvas>`).
 */

export const MAX_INPUT_BYTES = 15 * 1024 * 1024; // ART-025
export const MAX_EDGE_PX = 1600; // ART-021
export const TARGET_BYTES = 400 * 1024; // ART-021
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // storage.rules limit (ART-025)
export const QUALITY_STEPS = [0.8, 0.7, 0.6] as const;

export type OutputType = "image/webp" | "image/jpeg";

export interface Size {
  width: number;
  height: number;
}

/** A decoded, already-oriented image. `S` is the drawable source (ImageBitmap in browsers). */
export interface DecodedImage<S = CanvasImageSource> extends Size {
  source: S;
  close?(): void;
}

export type DecodeAdapter<S = CanvasImageSource> = (file: Blob) => Promise<DecodedImage<S>>;
export type EncodeAdapter<S = CanvasImageSource> = (
  image: DecodedImage<S>,
  size: Size,
  type: OutputType,
  quality: number,
) => Promise<Blob>;

export type ImageValidationCode =
  "not-image" | "empty" | "too-large" | "decode-failed" | "encode-failed" | "output-too-large";

export class ImageValidationError extends Error {
  readonly code: ImageValidationCode;
  constructor(code: ImageValidationCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ImageValidationError";
    this.code = code;
  }
}

export interface ProcessImageOptions<S = CanvasImageSource> {
  decode?: DecodeAdapter<S>;
  encode?: EncodeAdapter<S>;
  maxEdge?: number;
  maxInputBytes?: number;
  targetBytes?: number;
  maxOutputBytes?: number;
  qualities?: readonly number[];
  /** Try WebP first (default true). */
  preferWebp?: boolean;
}

export interface ProcessedImage extends Size {
  blob: Blob;
  type: OutputType;
  bytes: number;
  quality: number;
  /** True if even the lowest quality step stayed above `targetBytes`. */
  overTarget: boolean;
}

/** Scale (never upscale) so the long edge is at most `max`, keeping aspect ratio. */
export function fitWithin(width: number, height: number, max: number): Size {
  if (!(width > 0 && height > 0 && max > 0)) {
    throw new RangeError(`fitWithin: invalid dimensions ${width}×${height} / ${max}`);
  }
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** ART-025: image MIME only, non-empty, ≤ 15 MB raw. */
export function validateImageFile(file: Blob, maxInputBytes: number = MAX_INPUT_BYTES): void {
  if (!file.type.startsWith("image/")) {
    throw new ImageValidationError("not-image", `Not an image: "${file.type || "unknown"}"`);
  }
  if (file.size === 0) throw new ImageValidationError("empty", "The file is empty");
  if (file.size > maxInputBytes) {
    throw new ImageValidationError(
      "too-large",
      `Image is ${file.size} bytes; the limit is ${maxInputBytes}`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Default browser adapters

/** The globals the default adapters need (injectable for tests). */
export interface CanvasEnv {
  createImageBitmap?: (image: Blob, options?: ImageBitmapOptions) => Promise<ImageBitmap>;
  OffscreenCanvas?: new (width: number, height: number) => OffscreenCanvas;
  document?: { createElement(tag: "canvas"): HTMLCanvasElement };
}

export type CanvasBackend = "offscreen" | "html";

/** Prefer OffscreenCanvas with `convertToBlob`; fall back to `<canvas>`; else none. */
export function selectCanvasBackend(env: CanvasEnv): CanvasBackend | null {
  if (typeof env.OffscreenCanvas === "function") {
    const proto = (env.OffscreenCanvas as { prototype?: { convertToBlob?: unknown } }).prototype;
    if (typeof proto?.convertToBlob === "function") return "offscreen";
  }
  if (env.document && typeof env.document.createElement === "function") return "html";
  return null;
}

/** `createImageBitmap(file, { imageOrientation: 'from-image' })` — applies EXIF rotation. */
export function createBitmapDecoder(env: CanvasEnv = globalThis as CanvasEnv): DecodeAdapter {
  return async (file) => {
    if (typeof env.createImageBitmap !== "function") {
      throw new Error("createImageBitmap is not available");
    }
    const bitmap = await env.createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  };
}

type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function draw(ctx: Ctx2D | null, image: DecodedImage, size: Size): void {
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image.source, 0, 0, size.width, size.height);
}

/** Draw into an OffscreenCanvas (or `<canvas>`) at `size` and encode. */
export function createCanvasEncoder(env: CanvasEnv = globalThis as CanvasEnv): EncodeAdapter {
  return async (image, size, type, quality) => {
    const backend = selectCanvasBackend(env);
    if (backend === "offscreen") {
      const canvas = new env.OffscreenCanvas!(size.width, size.height);
      draw(canvas.getContext("2d"), image, size);
      return canvas.convertToBlob({ type, quality });
    }
    if (backend === "html") {
      const canvas = env.document!.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      draw(canvas.getContext("2d"), image, size);
      return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob returned null"))),
          type,
          quality,
        ),
      );
    }
    throw new Error("No canvas implementation available");
  };
}

// ---------------------------------------------------------------------------------------------

/**
 * Validate, orient, resize and re-encode an uploaded image. Throws ImageValidationError.
 * The output never contains the input's metadata because it is encoded from pixels.
 */
export async function processImage<S = CanvasImageSource>(
  file: Blob,
  opts: ProcessImageOptions<S> = {},
): Promise<ProcessedImage> {
  const maxEdge = opts.maxEdge ?? MAX_EDGE_PX;
  const targetBytes = opts.targetBytes ?? TARGET_BYTES;
  const maxOutputBytes = opts.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  const qualities = opts.qualities?.length ? opts.qualities : QUALITY_STEPS;
  const decode = opts.decode ?? (createBitmapDecoder() as unknown as DecodeAdapter<S>);
  const encode = opts.encode ?? (createCanvasEncoder() as unknown as EncodeAdapter<S>);

  validateImageFile(file, opts.maxInputBytes ?? MAX_INPUT_BYTES);

  let image: DecodedImage<S>;
  try {
    image = await decode(file);
  } catch (e) {
    throw new ImageValidationError("decode-failed", "Could not read this image", { cause: e });
  }

  try {
    if (!(image.width > 0 && image.height > 0)) {
      throw new ImageValidationError("decode-failed", "Image has no pixels");
    }
    const size = fitWithin(image.width, image.height, maxEdge);
    let type: OutputType = opts.preferWebp === false ? "image/jpeg" : "image/webp";

    const run = async (t: OutputType, q: number) => {
      try {
        return await encode(image, size, t, q);
      } catch (e) {
        throw new ImageValidationError("encode-failed", "Could not encode the image", {
          cause: e,
        });
      }
    };

    let result: { blob: Blob; quality: number } | undefined;
    for (const quality of qualities) {
      let blob = await run(type, quality);
      // Browsers without a WebP encoder silently return PNG: switch to JPEG for good.
      if (type === "image/webp" && blob.type !== "image/webp") {
        type = "image/jpeg";
        blob = await run(type, quality);
      }
      if (blob.type !== type) {
        throw new ImageValidationError("encode-failed", `Encoder produced "${blob.type}"`);
      }
      result = { blob, quality };
      if (blob.size <= targetBytes) break;
    }
    const { blob, quality } = result!;
    if (blob.size > maxOutputBytes) {
      throw new ImageValidationError(
        "output-too-large",
        `Processed image is ${blob.size} bytes; the limit is ${maxOutputBytes}`,
      );
    }
    return {
      blob,
      type,
      width: size.width,
      height: size.height,
      bytes: blob.size,
      quality,
      overTarget: blob.size > targetBytes,
    };
  } finally {
    image.close?.();
  }
}
