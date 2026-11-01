import type { ScryfallErrorBody } from "./types";

/**
 * Typed Scryfall failure. `status` is the HTTP status (0 for network failures);
 * `code` is Scryfall's error code (e.g. `not_found`), or `network` / `http_error` /
 * `bad_response` for failures without a Scryfall Error object.
 */
export class ScryfallError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string;
  readonly type?: string;
  readonly warnings?: string[];

  constructor(init: {
    status: number;
    code: string;
    details: string;
    type?: string;
    warnings?: string[];
    cause?: unknown;
  }) {
    super(`Scryfall ${init.status} ${init.code}: ${init.details}`, { cause: init.cause });
    this.name = "ScryfallError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.type = init.type;
    this.warnings = init.warnings;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** True when the request never reached Scryfall (offline, DNS, CORS…). ART-009 UI hint. */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export function isScryfallErrorBody(v: unknown): v is ScryfallErrorBody {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { object?: unknown }).object === "error" &&
    typeof (v as { code?: unknown }).code === "string"
  );
}

/** Build a ScryfallError from an HTTP status and a parsed (possibly non-error) body. */
export function errorFromResponse(status: number, body: unknown): ScryfallError {
  if (isScryfallErrorBody(body)) {
    return new ScryfallError({
      status: typeof body.status === "number" ? body.status : status,
      code: body.code,
      details: typeof body.details === "string" ? body.details : "",
      type: body.type,
      warnings: body.warnings,
    });
  }
  return new ScryfallError({ status, code: "http_error", details: `HTTP ${status}` });
}

export function isAbortError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

export function abortError(signal?: AbortSignal): unknown {
  const reason: unknown = signal?.reason;
  if (isAbortError(reason)) return reason;
  return new DOMException("The operation was aborted.", "AbortError");
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}
