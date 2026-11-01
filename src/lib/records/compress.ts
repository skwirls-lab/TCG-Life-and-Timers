/**
 * Record log encoding (HIST-003): the final game snapshot as JSON, gzip-compressed with
 * `CompressionStream` and base64-encoded. Falls back to plain JSON where the stream API is
 * missing. Decoding detects the format (gzip base64 always starts with "H4sI").
 */
import type { Game } from "@/engine";
import { MAX_LOG_BYTES } from "./types";

export interface LogPayload {
  v: 1;
  game: Game;
}

const GZIP_B64_PREFIX = "H4sI";

function hasStreams(): boolean {
  return typeof CompressionStream === "function" && typeof DecompressionStream === "function";
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(data as Uint8Array<ArrayBuffer>).catch(() => {});
  void writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export async function gzipBase64(text: string): Promise<string> {
  const bytes = await pipe(new TextEncoder().encode(text), new CompressionStream("gzip"));
  return bytesToBase64(bytes);
}

export async function gunzipBase64(b64: string): Promise<string> {
  const bytes = await pipe(base64ToBytes(b64), new DecompressionStream("gzip"));
  return new TextDecoder().decode(bytes);
}

export interface EncodeOptions {
  /** Force the plain-JSON fallback (tests, browsers without CompressionStream). */
  plain?: boolean;
  maxBytes?: number;
}

export interface EncodedLog {
  log?: string;
  truncated: boolean;
}

async function encodeOnce(game: Game, plain: boolean): Promise<string> {
  const json = JSON.stringify({ v: 1, game } satisfies LogPayload);
  return plain ? json : gzipBase64(json);
}

/**
 * Encode the snapshot; when over `maxBytes` the oldest log events are dropped (halving) until it
 * fits, and `truncated` is set. Returns no log when even an empty log does not fit.
 */
export async function encodeLog(game: Game, opts: EncodeOptions = {}): Promise<EncodedLog> {
  const plain = opts.plain === true || !hasStreams();
  const max = opts.maxBytes ?? MAX_LOG_BYTES;
  let g = game;
  let truncated = false;
  for (;;) {
    const out = await encodeOnce(g, plain);
    if (out.length <= max) return { log: out, truncated };
    if (g.log.length === 0) return { truncated: true };
    truncated = true;
    const keep = Math.floor(g.log.length / 2);
    g = { ...g, log: keep > 0 ? g.log.slice(g.log.length - keep) : [] };
  }
}

/** Decode a stored log back to the game snapshot (null when missing or unreadable). */
export async function decodeLog(log: string | undefined): Promise<Game | null> {
  if (!log) return null;
  try {
    let json = log;
    if (log.startsWith(GZIP_B64_PREFIX)) {
      if (!hasStreams()) return null;
      json = await gunzipBase64(log);
    }
    const parsed = JSON.parse(json) as Partial<LogPayload>;
    if (parsed && parsed.v === 1 && parsed.game && typeof parsed.game === "object") {
      return parsed.game;
    }
    return null;
  } catch {
    return null;
  }
}
