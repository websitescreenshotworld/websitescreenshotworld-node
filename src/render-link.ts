import { createHmac } from "node:crypto";

import type { DeviceCategory, ScrollMode } from "./models/tokens.js";

/** The image formats a render link can ask for. */
export type RenderLinkFormat = "png" | "jpeg" | "webp";

/**
 * What a render link captures. Every option is optional except `url`; an option that is not set is not in the link.
 * The names are the API's, in camelCase (`deviceScaleFactor` is `device_scale_factor`).
 */
export interface RenderLinkOptions {
  /** The key's render secret (`wsw_rsk_…`), shown on the API Keys page once render links are on for the key. */
  renderSecret: string;
  /** The key's 12-character prefix: the part after `wsw_api_` and before the next `_`. */
  keyPrefix: string;
  /** The page to capture. */
  url: string;
  /** Default `png`. */
  format?: RenderLinkFormat;
  /** Default `https://api.websitescreenshotworld.com`. */
  baseUrl?: string;
  /**
   * How long, in seconds, a capture of the link is served from cache before a view captures again: 3600 to
   * 2592000. The server uses 86400 (a day) when it is left out.
   */
  ttl?: number;
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
  deviceCategory?: DeviceCategory;
  emulatedDevice?: string;
  scrollMode?: ScrollMode;
  autoHeight?: boolean;
  maxHeight?: number;
  zoom?: number;
  blockAds?: boolean;
  blockPopUps?: boolean;
  pressEscape?: boolean;
  pageTimeoutMs?: number;
  scrollingDelayMs?: number;
  locale?: string;
  timeZone?: string;
  /** The capture's `selectors.hide`. */
  hide?: string;
  /** The capture's `selectors.xpath`. */
  xpath?: string;
  /** The capture's `selectors.click`. */
  click?: string;
  /** The capture's `selectors.hover`. */
  hover?: string;
  /** The capture's `proxy.country`. */
  country?: string;
  /** Shrink the image to this width after the capture (16 to 3840), keeping its proportions. */
  thumbWidth?: number;
}

const DEFAULT_BASE_URL = "https://api.websitescreenshotworld.com";
const PATH_PREFIX = "/instant-snap/v1/render/";
const FORMATS: readonly string[] = ["png", "jpeg", "webp"];
const KEY_PREFIX = /^[0-9a-f]{12}$/;

/** The options a link carries, by their API names; `renderSecret`, `keyPrefix`, `format` and `baseUrl` are not. */
const PARAMETERS: Record<string, string> = {
  url: "url",
  ttl: "ttl",
  width: "width",
  height: "height",
  deviceScaleFactor: "device_scale_factor",
  deviceCategory: "device_category",
  emulatedDevice: "emulated_device",
  scrollMode: "scroll_mode",
  autoHeight: "auto_height",
  maxHeight: "max_height",
  zoom: "zoom",
  blockAds: "block_ads",
  blockPopUps: "block_pop_ups",
  pressEscape: "press_escape",
  pageTimeoutMs: "page_timeout_ms",
  scrollingDelayMs: "scrolling_delay_ms",
  locale: "locale",
  timeZone: "time_zone",
  hide: "hide",
  xpath: "xpath",
  click: "click",
  hover: "hover",
  country: "country",
  thumbWidth: "thumb_width",
};

/** RFC 3986: every UTF-8 byte but `A-Z a-z 0-9 - . _ ~`. `encodeURIComponent` alone leaves `! ' ( ) *`. */
function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Booleans as `true`/`false`, numbers in their shortest decimal form (`2`, `1.5`), strings as given. */
function wireValue(value: string | number | boolean): string {
  return typeof value === "string" ? value : String(value);
}

/**
 * Builds a render link: a signed URL that is itself a screenshot, for an `<img>` tag, an email or a social preview.
 * It is made here, locally - nothing is sent, and no client or API key is needed. Every view of the link that is not
 * already cached makes one Instant Snap capture.
 *
 * @throws `TypeError` when `renderSecret`, `keyPrefix` or `url` is missing, `keyPrefix` is not 12 lower-case hex
 * characters, or `format` is not `png`, `jpeg` or `webp`.
 */
function build(options: RenderLinkOptions): string {
  const { renderSecret, keyPrefix, url } = options;
  const format = options.format ?? "png";

  if (!renderSecret) throw new TypeError("renderSecret is required.");
  if (!keyPrefix || !KEY_PREFIX.test(keyPrefix)) {
    throw new TypeError(
      "keyPrefix must be the key's 12-character prefix (lower-case hex).",
    );
  }
  if (!url) throw new TypeError("url is required.");
  if (!FORMATS.includes(format)) {
    throw new TypeError("format must be png, jpeg or webp.");
  }

  const pairs: [string, string][] = [];
  for (const [property, name] of Object.entries(PARAMETERS)) {
    const value = (options as unknown as Record<string, unknown>)[property];
    if (value === undefined || value === null) continue;
    pairs.push([
      encode(name),
      encode(wireValue(value as string | number | boolean)),
    ]);
  }
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const query = pairs.map(([name, value]) => `${name}=${value}`).join("&");
  const canonical = `${PATH_PREFIX}${keyPrefix}/${format}?${query}`;
  const signature = createHmac("sha256", Buffer.from(renderSecret, "utf8"))
    .update(canonical, "utf8")
    .digest("hex");
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

  return `${baseUrl}${canonical}&sig=${signature}`;
}

/** Render links: signed URLs of an Instant Snap key that are themselves a screenshot. */
export const RenderLink = { build };
