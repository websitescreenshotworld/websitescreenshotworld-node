import {
  FALLBACK_CODE_BY_STATUS,
  FALLBACK_CODE_FOR_OTHER_STATUS,
  RETRYABLE_CODES,
} from "./error-codes.js";
import {
  ConnectionError,
  WebsiteScreenshotWorldError,
  errorFor,
} from "./errors.js";

/** Options every call accepts as its last argument. */
export interface RequestOptions {
  /**
   * Milliseconds the call may take, retries and the waits between them included. Defaults to the
   * client's `captureTimeout` for captures and `timeout` for everything else.
   */
  timeout?: number;
  /**
   * Stops the call, and any retry it would make, as soon as it aborts; the call then rejects with
   * the signal's reason. Once a file has started to arrive, cancel its stream instead.
   */
  signal?: AbortSignal;
}

/** Options the capture calls accept as their last argument. */
export interface CaptureRequestOptions extends RequestOptions {
  /**
   * Makes the capture safe to repeat within 24 hours. A random UUID is used when none is given;
   * either way, every retry of this call sends the same key.
   */
  idempotencyKey?: string;
}

export interface TransportOptions {
  /** Looked up on each request when left out, so a global fetch replaced later is used. */
  fetch: typeof fetch | undefined;
  maxRetries: number;
  userAgent: string;
}

/** One API call, which may take several attempts. */
export interface Call {
  method: "GET" | "POST";
  url: string;
  /** Left out for the one endpoint that needs no key. */
  apiKey?: string;
  /** A JSON body; left out for calls without one. */
  body?: unknown;
  idempotencyKey?: string;
  /** The answer is a file rather than JSON. */
  file?: boolean;
  timeout: number;
  signal?: AbortSignal | undefined;
}

type Attempt<T> =
  | { done: true; value: T }
  | { done: false; error: WebsiteScreenshotWorldError; retryable: boolean };

interface WireError {
  error_code: string;
  error_message?: unknown;
  retry_after_seconds?: unknown;
}

const MAX_RETRY_AFTER_SECONDS = 60;
const BACKOFF_MS = [500, 1000] as const;
const JITTER = 0.25;
// setTimeout fires at once for anything longer, so such a timeout means "no timeout".
const MAX_TIMER_MS = 2 ** 31 - 1;

/** Sends calls with the shared headers, timeouts and retries. */
export class Transport {
  readonly #options: TransportOptions;

  constructor(options: TransportOptions) {
    this.#options = options;
  }

  /** Makes the call and parses its JSON answer. */
  json(call: Call): Promise<unknown> {
    return this.#send(call, async (response) => {
      const text = await response.text();
      try {
        return JSON.parse(text) as unknown;
      } catch (cause) {
        throw new WebsiteScreenshotWorldError(
          "The API answered with a body that is not JSON.",
          { httpStatus: response.status, rawBody: text, cause },
        );
      }
    });
  }

  /** Makes the call and returns the answer as soon as its headers arrive, with the body unread. */
  file(call: Call): Promise<Response> {
    return this.#send(call, (response) => Promise.resolve(response));
  }

  async #send<T>(
    call: Call,
    read: (response: Response) => Promise<T>,
  ): Promise<T> {
    const deadline = new Deadline(call.timeout, call.signal);
    try {
      const init = this.#requestInit(call, deadline.signal);
      for (let attempt = 0; ; attempt++) {
        const outcome = await this.#attempt(call.url, init, read, deadline);
        if (outcome.done) return outcome.value;
        const delay = retryDelay(outcome.error.retryAfterSeconds, attempt);
        const retry =
          outcome.retryable &&
          attempt < this.#options.maxRetries &&
          deadline.allows(delay);
        if (!retry) throw outcome.error;
        await deadline.sleep(delay);
      }
    } finally {
      deadline.end();
    }
  }

  async #attempt<T>(
    url: string,
    init: RequestInit,
    read: (response: Response) => Promise<T>,
    deadline: Deadline,
  ): Promise<Attempt<T>> {
    try {
      const fetch = this.#options.fetch ?? globalThis.fetch;
      const response = await fetch(url, init);
      if (response.ok) return { done: true, value: await read(response) };
      const error = await refusalFrom(response);
      return {
        done: false,
        error,
        retryable: RETRYABLE_CODES.has(error.errorCode ?? ""),
      };
    } catch (cause) {
      deadline.throwIfStopped();
      if (cause instanceof WebsiteScreenshotWorldError) throw cause;
      const error = new ConnectionError(
        `The request to ${new URL(url).origin} failed before an answer came back.`,
        { cause },
      );
      return { done: false, error, retryable: true };
    }
  }

  #requestInit(call: Call, signal: AbortSignal): RequestInit {
    const headers: Record<string, string> = {
      "User-Agent": this.#options.userAgent,
    };
    if (call.apiKey !== undefined) headers["X-Api-Key"] = call.apiKey;
    if (call.file !== true) headers.Accept = "application/json";
    if (call.body !== undefined) headers["Content-Type"] = "application/json";
    if (call.idempotencyKey !== undefined) {
      headers["Idempotency-Key"] = call.idempotencyKey;
    }
    /* Redirects are never followed (code-review plan 7.4, 28 Oct 2026): fetch would send the
       X-Api-Key to wherever a 3xx pointed. The API never redirects, and neither does the download
       link, so a 3xx is answered as the refusal it is - "manual", not "error", which would surface
       as a ConnectionError and be retried. */
    const init: RequestInit = {
      method: call.method,
      headers,
      signal,
      redirect: "manual",
    };
    if (call.body !== undefined) init.body = JSON.stringify(call.body);
    return init;
  }
}

/**
 * How long to wait before the next attempt: the API's hint when it gave one, capped at a minute,
 * otherwise a short backoff with jitter so that clients refused together do not return together.
 */
export function retryDelay(
  retryAfterSeconds: number | null,
  attempt: number,
): number {
  if (retryAfterSeconds !== null) {
    return Math.min(retryAfterSeconds, MAX_RETRY_AFTER_SECONDS) * 1000;
  }
  const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 1000;
  return base * (1 + Math.random() * JITTER);
}

async function refusalFrom(
  response: Response,
): Promise<WebsiteScreenshotWorldError> {
  const rawBody = await response.text();
  const body = errorBodyFrom(rawBody);
  const errorCode =
    body?.error_code ??
    FALLBACK_CODE_BY_STATUS[response.status] ??
    FALLBACK_CODE_FOR_OTHER_STATUS;
  const message =
    typeof body?.error_message === "string"
      ? body.error_message
      : `The API answered with HTTP ${String(response.status)} and no error details.`;
  const retryAfterSeconds =
    typeof body?.retry_after_seconds === "number"
      ? body.retry_after_seconds
      : retryAfterHeader(response.headers);
  return errorFor(errorCode, message, {
    httpStatus: response.status,
    retryAfterSeconds,
    rawBody,
  });
}

function errorBodyFrom(text: string): WireError | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const isErrorBody =
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<WireError>).error_code === "string";
  return isErrorBody ? (value as WireError) : null;
}

function retryAfterHeader(headers: Headers): number | null {
  const value = headers.get("retry-after")?.trim();
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : null;
}

/** Ends a call when its timeout passes or the caller's signal aborts, whichever comes first. */
class Deadline {
  readonly #controller = new AbortController();
  readonly #expiresAt: number;
  readonly #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #callerSignal: AbortSignal | undefined;
  readonly #onCallerAbort = (): void => {
    this.#controller.abort(this.#callerSignal?.reason);
  };

  constructor(timeout: number, callerSignal: AbortSignal | undefined) {
    callerSignal?.throwIfAborted();
    this.#callerSignal = callerSignal;
    this.#expiresAt = performance.now() + timeout;
    callerSignal?.addEventListener("abort", this.#onCallerAbort, {
      once: true,
    });
    if (timeout <= MAX_TIMER_MS) {
      this.#timer = setTimeout(() => {
        this.#controller.abort(
          new ConnectionError(
            `The call did not finish within ${String(timeout / 1000)} seconds.`,
          ),
        );
      }, timeout);
    }
  }

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  /** Whether waiting `milliseconds` still leaves time for another attempt. */
  allows(milliseconds: number): boolean {
    return performance.now() + milliseconds < this.#expiresAt;
  }

  /** Throws the reason the call was stopped, if it was. */
  throwIfStopped(): void {
    this.#controller.signal.throwIfAborted();
  }

  sleep(milliseconds: number): Promise<void> {
    const signal = this.#controller.signal;
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason as Error);
        return;
      }
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(signal.reason as Error);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, milliseconds);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  end(): void {
    clearTimeout(this.#timer);
    this.#callerSignal?.removeEventListener("abort", this.#onCallerAbort);
  }
}
