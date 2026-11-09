import type {
  CaptureFormat,
  DeviceCategory,
  MediaCategory,
  PageSourceFormat,
  ScrollMode,
  WatermarkLocation,
} from "./tokens.js";

/** The browser window the page is rendered in. */
export interface ViewportOptions {
  /** Width in CSS pixels, 250 to 7680. Default 1920. */
  width?: number;
  /** Height in CSS pixels, 250 to 7680. Default 1080. */
  height?: number;
  /** Device pixel ratio, 1 to 3. Default 1. */
  deviceScaleFactor?: number;
}

/** The position the browser reports. Latitude and longitude are sent together or not at all. */
export interface GeolocationOptions {
  /** -90 to 90. */
  latitude?: number;
  /** -180 to 180. */
  longitude?: number;
  /** In metres, 1 to 10000. Default 100. */
  accuracy?: number;
}

/** Elements to act on before the capture. */
export interface SelectorOptions {
  /** Capture only the element this XPath selects. At most 512 characters. */
  xpath?: string;
  /**
   * Elements to hide: up to 25 comma-separated CSS selectors (an XPath starting with `//` works
   * too), at most 2000 characters. Each is applied on its own; one the browser rejects is skipped.
   */
  hide?: string;
  /** CSS selector of an element to click. At most 512 characters. */
  click?: string;
  /** CSS selector of an element to hover. At most 512 characters. */
  hover?: string;
}

/** Route the capture through a proxy. Requires the ProxyLocation plan feature. */
export interface ProxyOptions {
  /** A country from the `proxyCountries` of `instantSnap.catalog()`. */
  country: string;
}

/** A strip with the capture time and URL. Passing this turns it on. Not available for video. */
export interface TimestampWatermarkOptions {
  /** Default `true`. */
  enabled?: boolean;
  /** Default `"top"`. */
  location?: WatermarkLocation;
  /** Hex colour. Default `"#000000"`. */
  fontColor?: string;
  /** Hex colour. Default `"#FFFFFF"`. */
  backgroundColor?: string;
}

/**
 * Also keep the page source. Charged as a second capture, capped at 10 MB, not available with
 * `captureFile`.
 */
export interface PageSourceOptions {
  /** Default `"html"`. */
  format?: PageSourceFormat;
}

/** The bucket `captureToBucket` uploads to. Needs `region` or `endpointUrl`. */
export interface S3DeliveryOptions {
  accessKeyId: string;
  /** Sent to the API but never returned. */
  secretAccessKey: string;
  bucket: string;
  region?: string;
  /** An https endpoint for S3-compatible storage. */
  endpointUrl?: string;
  /** Default `false`. */
  forcePathStyle?: boolean;
  keyPrefix?: string;
  /** Wait up to 30 seconds for the upload before answering. Default `false`. */
  waitForSync?: boolean;
}

/**
 * What to capture and how. Only `url` is required; anything left out takes the API's default,
 * which `instantSnap.defaults()` lists.
 */
export interface CaptureOptions {
  /** The page to capture: absolute http or https, without credentials, at most 2048 characters. */
  url: string;
  /** Default `"image"`. */
  mediaCategory?: MediaCategory;
  /** Must belong to `mediaCategory`. */
  format?: CaptureFormat;
  viewport?: ViewportOptions;
  /** Default `"desktop"`. */
  deviceCategory?: DeviceCategory;
  /** A device from `instantSnap.catalog()`, case-insensitive. Mobile defaults to "iPhone 13". */
  emulatedDevice?: string;
  /** Default `"viewport"`, or `"scroll"` for video. */
  scrollMode?: ScrollMode;
  /** Default `false`. */
  autoHeight?: boolean;
  /** 250 to 100000, and within the format's own ceiling. */
  maxHeight?: number;
  /** Percent, 50 to 100. Default 100. */
  zoom?: number;
  /** Default `true`. */
  blockAds?: boolean;
  /** Default `true`. */
  blockPopUps?: boolean;
  /**
   * Press Escape after the pop-up pass and again after scrolling (once in a video), for a modal
   * that closes on Escape. Default `false`.
   */
  pressEscape?: boolean;
  /** 1000 to 60000. Default 30000. */
  pageTimeoutMs?: number;
  /** The pause after each scroll step of a full-page capture, 0 to 10000. Default 500. */
  scrollingDelayMs?: number;
  userAgent?: string;
  /** A BCP 47 language tag. */
  locale?: string;
  /** An IANA time zone. */
  timeZone?: string;
  /**
   * Sent with every request the page makes, with names exactly as given. Requires the
   * RequestHeadersCookies plan feature.
   */
  headers?: Record<string, string>;
  /**
   * Set for the URL's origin, with names exactly as given. Requires the RequestHeadersCookies plan
   * feature.
   */
  cookies?: Record<string, string>;
  geolocation?: GeolocationOptions;
  selectors?: SelectorOptions;
  proxy?: ProxyOptions;
  timestampWatermark?: TimestampWatermarkOptions;
  pageSource?: PageSourceOptions;
  /** Also receives the `capture.succeeded` or `capture.failed` webhook. Requires the Webhooks plan feature. */
  callbackUrl?: string;
  /**
   * Async only (`submit` and `submitToBucket`): the seconds the capture may take in the browser,
   * 30 to 300; time in the queue does not count. Server default 120. The server refuses it on the
   * other capture operations.
   */
  timeout?: number;
}

/** Options for `instantSnap.captureFile()`, which cannot keep the page source. */
export type CaptureFileOptions = Omit<CaptureOptions, "pageSource">;

/** Options for `instantSnap.captureToBucket()`. */
export interface CaptureToBucketOptions extends CaptureOptions {
  s3Delivery: S3DeliveryOptions;
}
