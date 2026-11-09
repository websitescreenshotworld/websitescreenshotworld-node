import { AutoSchedule } from "./auto-schedule.js";
import { InstantSnap } from "./instant-snap.js";
import { Transport } from "./transport.js";
import { VERSION } from "./version.js";

/** Settings for {@link WebsiteScreenshotWorld}. Every one is optional. */
export interface ClientOptions {
  /** Defaults to the `WSW_INSTANT_SNAP_API_KEY` environment variable. */
  instantSnapApiKey?: string;
  /** Defaults to the `WSW_AUTO_SCHEDULE_API_KEY` environment variable. */
  autoScheduleApiKey?: string;
  /** Default `https://api.websitescreenshotworld.com`. */
  instantSnapBaseUrl?: string;
  /** Default `https://autoapi.websitescreenshotworld.com`. */
  autoScheduleBaseUrl?: string;
  /**
   * Milliseconds a capture call may take, retries included. Default 180 000: the API itself may
   * take up to 120 seconds.
   */
  captureTimeout?: number;
  /** Milliseconds any other call may take, retries included. Default 30 000. */
  timeout?: number;
  /** How many times a failed attempt is retried when retrying can help. Default 2. */
  maxRetries?: number;
  /** A `fetch` to send requests with, for a proxy or instrumentation. Defaults to the global one. */
  fetch?: typeof fetch;
}

const DEFAULT_INSTANT_SNAP_BASE_URL = "https://api.websitescreenshotworld.com";
const DEFAULT_AUTO_SCHEDULE_BASE_URL =
  "https://autoapi.websitescreenshotworld.com";
const DEFAULT_CAPTURE_TIMEOUT_MS = 180_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

/**
 * The Website Screenshot World client. One client covers both products; either key may be left
 * out, and calling a product without its key fails before anything is sent.
 *
 * @example
 * ```ts
 * const client = new WebsiteScreenshotWorld();
 * const capture = await client.instantSnap.capture({ url: "https://example.com" });
 * ```
 */
export class WebsiteScreenshotWorld {
  /** On-demand captures. */
  readonly instantSnap: InstantSnap;
  /** Captures of scheduled web pages. */
  readonly autoSchedule: AutoSchedule;

  constructor(options: ClientOptions = {}) {
    const transport = new Transport({
      fetch: options.fetch,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      userAgent: `websitescreenshotworld-node/${VERSION} (node ${process.versions.node})`,
    });
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.instantSnap = new InstantSnap({
      transport,
      apiKey: apiKey(options.instantSnapApiKey, "WSW_INSTANT_SNAP_API_KEY"),
      baseUrl: withoutTrailingSlash(
        options.instantSnapBaseUrl ?? DEFAULT_INSTANT_SNAP_BASE_URL,
      ),
      timeout,
      captureTimeout: options.captureTimeout ?? DEFAULT_CAPTURE_TIMEOUT_MS,
    });
    this.autoSchedule = new AutoSchedule({
      transport,
      apiKey: apiKey(options.autoScheduleApiKey, "WSW_AUTO_SCHEDULE_API_KEY"),
      baseUrl: withoutTrailingSlash(
        options.autoScheduleBaseUrl ?? DEFAULT_AUTO_SCHEDULE_BASE_URL,
      ),
      timeout,
    });
  }
}

/** The key given, else the environment's; an empty string counts as no key. */
function apiKey(
  given: string | undefined,
  variable: string,
): string | undefined {
  const key =
    given === undefined || given === "" ? process.env[variable] : given;
  return key === "" ? undefined : key;
}

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
