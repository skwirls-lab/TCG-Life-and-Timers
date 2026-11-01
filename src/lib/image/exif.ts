/**
 * Tiny pure metadata inspector (T5.3, ART-021). Used by tests and the future upload e2e to
 * prove that processed images carry no EXIF/GPS, and to read the EXIF orientation of inputs.
 * Supports JPEG (APP1 "Exif"), WebP (RIFF "EXIF" chunk) and PNG ("eXIf" chunk).
 */

export type ImageContainer = "jpeg" | "webp" | "png" | "unknown";

export interface ExifSummary {
  /** EXIF Orientation (1–8) when present in IFD0. */
  orientation?: number;
  /** True when IFD0 points at a GPS IFD (tag 0x8825). */
  hasGps: boolean;
}

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

function ascii(b: Uint8Array, off: number, len: number): string {
  let s = "";
  for (let i = 0; i < len && off + i < b.length; i++) s += String.fromCharCode(b[off + i]!);
  return s;
}

function toBytes(input: Uint8Array | ArrayBuffer): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

export function sniffContainer(input: Uint8Array | ArrayBuffer): ImageContainer {
  const b = toBytes(input);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return "png";
  return "unknown";
}

/** Offset of the TIFF header inside the JPEG's APP1 Exif segment, or -1. */
function findJpegExifTiff(b: Uint8Array): number {
  let off = 2; // after SOI
  while (off + 4 <= b.length) {
    if (b[off] !== 0xff) return -1; // corrupt stream
    const marker = b[off + 1]!;
    if (marker === 0xff) {
      off += 1; // fill byte
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return -1; // EOI / start of scan: no more metadata
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      off += 2; // standalone markers
      continue;
    }
    const len = (b[off + 2]! << 8) | b[off + 3]!;
    if (len < 2) return -1;
    if (marker === 0xe1 && EXIF_HEADER.every((v, i) => b[off + 4 + i] === v)) return off + 10;
    off += 2 + len;
  }
  return -1;
}

interface Chunk {
  type: string;
  offset: number;
  size: number;
}

function riffChunks(b: Uint8Array): Chunk[] {
  const out: Chunk[] = [];
  let off = 12;
  while (off + 8 <= b.length) {
    const size =
      (b[off + 4]! | (b[off + 5]! << 8) | (b[off + 6]! << 16) | (b[off + 7]! << 24)) >>> 0;
    out.push({ type: ascii(b, off, 4), offset: off + 8, size });
    off += 8 + size + (size % 2);
  }
  return out;
}

function pngChunks(b: Uint8Array): Chunk[] {
  const out: Chunk[] = [];
  let off = 8;
  while (off + 8 <= b.length) {
    const size = ((b[off]! << 24) | (b[off + 1]! << 16) | (b[off + 2]! << 8) | b[off + 3]!) >>> 0;
    out.push({ type: ascii(b, off + 4, 4), offset: off + 8, size });
    off += 12 + size;
  }
  return out;
}

/** True when the image bytes carry an EXIF block. */
export function hasExif(input: Uint8Array | ArrayBuffer): boolean {
  const b = toBytes(input);
  switch (sniffContainer(b)) {
    case "jpeg":
      return findJpegExifTiff(b) !== -1;
    case "webp":
      return riffChunks(b).some((c) => c.type === "EXIF");
    case "png":
      return pngChunks(b).some((c) => c.type === "eXIf");
    default:
      return false;
  }
}

/** Parse orientation and GPS presence from a TIFF-structured EXIF block. */
export function parseTiff(b: Uint8Array, tiff: number): ExifSummary | undefined {
  if (tiff + 8 > b.length) return undefined;
  const order = ascii(b, tiff, 2);
  if (order !== "II" && order !== "MM") return undefined;
  const le = order === "II";
  const u16 = (o: number) => (le ? b[o]! | (b[o + 1]! << 8) : (b[o]! << 8) | b[o + 1]!);
  const u32 = (o: number) =>
    (le
      ? b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)
      : (b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
  if (u16(tiff + 2) !== 42) return undefined;
  const ifd0 = tiff + u32(tiff + 4);
  if (ifd0 + 2 > b.length) return undefined;
  const count = u16(ifd0);
  const summary: ExifSummary = { hasGps: false };
  for (let i = 0; i < count; i++) {
    const e = ifd0 + 2 + i * 12;
    if (e + 12 > b.length) break;
    const tag = u16(e);
    if (tag === 0x0112) summary.orientation = u16(e + 8);
    else if (tag === 0x8825) summary.hasGps = true;
  }
  return summary;
}

/** Orientation + GPS presence of a JPEG/WebP/PNG, or `undefined` when it has no EXIF. */
export function readExif(input: Uint8Array | ArrayBuffer): ExifSummary | undefined {
  const b = toBytes(input);
  switch (sniffContainer(b)) {
    case "jpeg": {
      const tiff = findJpegExifTiff(b);
      return tiff === -1 ? undefined : parseTiff(b, tiff);
    }
    case "webp": {
      const c = riffChunks(b).find((x) => x.type === "EXIF");
      if (!c) return undefined;
      // Some writers keep the "Exif\0\0" prefix inside the chunk.
      const skip = EXIF_HEADER.every((v, i) => b[c.offset + i] === v) ? 6 : 0;
      return parseTiff(b, c.offset + skip);
    }
    case "png": {
      const c = pngChunks(b).find((x) => x.type === "eXIf");
      return c ? parseTiff(b, c.offset) : undefined;
    }
    default:
      return undefined;
  }
}

/** Display size after applying an EXIF orientation (5–8 swap width and height). */
export function orientedSize(
  width: number,
  height: number,
  orientation = 1,
): { width: number; height: number } {
  return orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height };
}
