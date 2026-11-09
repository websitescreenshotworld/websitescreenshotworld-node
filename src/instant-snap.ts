import { randomUUID } from "node:crypto";

import { AuthenticationError } from "./errors.js";
import { type FileDestination, writeBody } from "./files.js";
import { captureFileFrom, type CaptureFile } from "./models/capture-file.js";
import type {
  CaptureFileOptions,
  CaptureOptions,
  CaptureToBucketOptions,
} from "./models/capture-options.js";
import {
  parseCapture,
  type Capture,
  type WireCapture,
} from "./models/capture.js";
import {
  parseCatalog,
  parseDefaults,
  type Catalog,
  type Defaults,
  type WireCatalog,
  type WireDefaults,
} from "./models/defaults.js";
import type {
  Call,
  CaptureRequestOptions,
  RequestOptions,
  Transport,
} from "./transport.js";
import { toWire } from "./wire.js";

/** Options for {@link InstantSnap.wait}. */
export interface WaitOptions {
  /**
   * Seconds to keep reading the capture. When they run out, `wait` returns the capture as last
   * read, still unfinished, rather than throwing. Default 360.
   */
  timeoutSeconds?: number;
  /** Seconds between reads. Default 3; `0` reads again at once. */
  pollIntervalSeconds?: number;
  /**
   * Stops waiting, and the read in progress, as soon as it aborts; `wait` then rejects with the
   * signal's reason.
   */
  signal?: AbortSignal;
}

/** What {@link InstantSnap} needs from the client. */
export interface InstantSnapConfig {
  transport: Transport;
  apiKey: string | undefined;
  baseUrl: string;
  timeout: number;
  captureTimeout: number;
}

const CAPTURES_PATH = "/instant-snap/v1/captures";
const DEFAULT_WAIT_TIMEOUT_SECONDS = 360;
const DEFAULT_POLL_INTERVAL_SECONDS = 3;
/** The statuses of a capture that has not finished yet. */
const UNFINISHED_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "running",
  "pending",
]);

/** On-demand captures: an image, a video or a PDF of a web page. */
export class InstantSnap {
  readonly #config: InstantSnapConfig;

  /** @internal Use `client.instantSnap`. */
  constructor(config: InstantSnapConfig) {
    this.#config = config;
  }

  /**
   * Captures a page and returns the capture, with a `downloadUrl` valid for 60 minutes.
   *
   * @example
   * ```ts
   * const capture = await client.instantSnap.capture({ url: "https://example.com", format: "webp" });
   * ```
   */
  async capture(
    options: CaptureOptions,
    requestOptions: CaptureRequestOptions = {},
  ): Promise<Capture> {
    const wire = await this.#transport.json(
      this.#captureCall(options, "json", requestOptions),
    );
    return parseCapture(wire as WireCapture);
  }

  /**
   * Captures a page and returns the file itself as a stream, with its metadata. The API does not
   * keep the file, so read or save it before discarding the result.
   */
  async captureFile(
    options: CaptureFileOptions,
    requestOptions: CaptureRequestOptions = {},
  ): Promise<CaptureFile> {
    const response = await this.#transport.file(
      this.#captureCall(options, "by_format", requestOptions),
    );
    return captureFileFrom(response);
  }

  /** Captures a page and uploads the file to your S3-compatible bucket. */
  async captureToBucket(
    options: CaptureToBucketOptions,
    requestOptions: CaptureRequestOptions = {},
  ): Promise<Capture> {
    const wire = await this.#transport.json(
      this.#captureCall(options, "cloud_storage", requestOptions),
    );
    return parseCapture(wire as WireCapture);
  }

  /**
   * Queues a capture and returns at once with it, `status` `queued`; it runs when a browser is
   * free. Read it with {@link InstantSnap.wait} or {@link InstantSnap.get}, or receive it at
   * `callbackUrl`.
   *
   * `options.timeout` sets the browser time it may take, 30 to 300 seconds. The call itself uses
   * the client's `timeout`, not `captureTimeout`, since nothing is captured while it waits. A
   * capture still queued 15 minutes later ends `failed` with `capture_expired`, not charged.
   *
   * @throws `RateLimitError` with `errorCode` `queue_full` when too many async captures are
   * already waiting or running. It is not retried; `retryAfterSeconds` says when to try again.
   *
   * @example
   * ```ts
   * const queued = await client.instantSnap.submit({ url: "https://example.com", timeout: 240 });
   * const capture = await client.instantSnap.wait(queued.id);
   * ```
   */
  async submit(
    options: CaptureOptions,
    requestOptions: CaptureRequestOptions = {},
  ): Promise<Capture> {
    const wire = await this.#transport.json(
      this.#captureCall(options, "json", requestOptions, true),
    );
    return parseCapture(wire as WireCapture);
  }

  /**
   * Queues a capture that uploads the file to your S3-compatible bucket, and returns at once with
   * it, `status` `queued`. Otherwise as {@link InstantSnap.submit}.
   */
  async submitToBucket(
    options: CaptureToBucketOptions,
    requestOptions: CaptureRequestOptions = {},
  ): Promise<Capture> {
    const wire = await this.#transport.json(
      this.#captureCall(options, "cloud_storage", requestOptions, true),
    );
    return parseCapture(wire as WireCapture);
  }

  /**
   * Reads a capture with `get` every `pollIntervalSeconds` until its status is no longer `queued`,
   * `running` or `pending`, and returns it. When `timeoutSeconds` runs out first, returns the
   * capture as last read, still unfinished, so you can decide whether to wait again. An error from
   * `get` is thrown as it is.
   *
   * @param capture - A capture's id, or the capture itself, such as the one `submit` returned.
   */
  async wait(
    capture: string | { id: string },
    options: WaitOptions = {},
  ): Promise<Capture> {
    const id = typeof capture === "string" ? capture : capture.id;
    const timeoutMs =
      (options.timeoutSeconds ?? DEFAULT_WAIT_TIMEOUT_SECONDS) * 1000;
    const intervalMs =
      (options.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS) * 1000;
    const { signal } = options;
    const expiresAt = performance.now() + timeoutMs;
    for (;;) {
      const current = await this.get(id, { signal });
      const remaining = expiresAt - performance.now();
      if (!UNFINISHED_STATUSES.has(current.status) || remaining <= 0) {
        return current;
      }
      if (intervalMs > 0) await sleep(Math.min(intervalMs, remaining), signal);
    }
  }

  /** Reads a capture back, with a fresh `downloadUrl`. */
  async get(id: string, requestOptions: RequestOptions = {}): Promise<Capture> {
    const wire = await this.#transport.json({
      method: "GET",
      url: this.#url(`${CAPTURES_PATH}/${encodeURIComponent(id)}`),
      apiKey: this.#apiKey(),
      timeout: requestOptions.timeout ?? this.#config.timeout,
      signal: requestOptions.signal,
    });
    return parseCapture(wire as WireCapture);
  }

  /**
   * Downloads a capture's file, or its page source, to a path or a stream.
   *
   * @param source - A capture from `capture` or `get`, or its `pageSource`.
   * @param destination - A file path, a Node.js writable stream or a web `WritableStream`.
   */
  async download(
    source: { downloadUrl: string | null },
    destination: FileDestination,
    requestOptions: RequestOptions = {},
  ): Promise<void> {
    if (source.downloadUrl === null) {
      throw new TypeError(
        "This capture has no downloadUrl. Read it again with get() for a fresh one.",
      );
    }
    // The link is signed, so the API key stays with the API and is not sent to the file host.
    const response = await this.#transport.file({
      method: "GET",
      url: source.downloadUrl,
      file: true,
      timeout: requestOptions.timeout ?? this.#config.timeout,
      signal: requestOptions.signal,
    });
    const body = response.body ?? new Blob([]).stream();
    await writeBody(body, destination, requestOptions.signal);
  }

  /** The values a capture takes for fields it does not set, and the limits. Needs no API key. */
  async defaults(requestOptions: RequestOptions = {}): Promise<Defaults> {
    const wire = await this.#transport.json({
      method: "GET",
      url: this.#url("/instant-snap/v1/defaults"),
      timeout: requestOptions.timeout ?? this.#config.timeout,
      signal: requestOptions.signal,
    });
    return parseDefaults(wire as WireDefaults);
  }

  /** The devices `emulatedDevice` accepts and the countries `proxy.country` accepts. */
  async catalog(requestOptions: RequestOptions = {}): Promise<Catalog> {
    const wire = await this.#transport.json({
      method: "GET",
      url: this.#url("/instant-snap/v1/catalog"),
      apiKey: this.#apiKey(),
      timeout: requestOptions.timeout ?? this.#config.timeout,
      signal: requestOptions.signal,
    });
    return parseCatalog(wire as WireCatalog);
  }

  get #transport(): Transport {
    return this.#config.transport;
  }

  #captureCall(
    options: CaptureOptions | CaptureFileOptions,
    responseType: string,
    requestOptions: CaptureRequestOptions,
    async = false,
  ): Call {
    const body = { ...toWire(options), response_type: responseType };
    return {
      method: "POST",
      url: this.#url(CAPTURES_PATH),
      apiKey: this.#apiKey(),
      body: async ? { ...body, async: true } : body,
      idempotencyKey: requestOptions.idempotencyKey ?? randomUUID(),
      file: responseType === "by_format",
      // An async capture is answered at once, so it takes the ordinary timeout.
      timeout:
        requestOptions.timeout ??
        (async ? this.#config.timeout : this.#config.captureTimeout),
      signal: requestOptions.signal,
    };
  }

  #url(path: string): string {
    return `${this.#config.baseUrl}${path}`;
  }

  #apiKey(): string {
    if (this.#config.apiKey === undefined) {
      throw new AuthenticationError(
        "No Instant Snap API key: pass instantSnapApiKey to the client or set WSW_INSTANT_SNAP_API_KEY.",
      );
    }
    return this.#config.apiKey;
  }
}

/** Waits `milliseconds`, or rejects with the signal's reason as soon as it aborts. */
function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason as Error);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason as Error);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
