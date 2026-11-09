import { camelCaseKeys } from "../wire.js";

/** The viewport a capture uses when it does not set one. */
export interface DefaultViewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

/**
 * The values a capture takes for fields it does not send, and the limits it is checked against.
 * Every field is optional because the set is versioned by `specVersion` and may change.
 */
export interface Defaults {
  specVersion?: string;
  responseType?: string;
  mediaCategory?: string;
  /** The default format of each media category. */
  format?: Record<string, string>;
  /** The formats each media category accepts. */
  formats?: Record<string, string[]>;
  deviceCategory?: string;
  emulatedDevice?: string;
  viewport?: DefaultViewport;
  zoom?: number;
  scrollMode?: string;
  autoHeight?: boolean;
  autoHeightMaxHeight?: number | null;
  autoHeightMaxHeightWebp?: number;
  blockAds?: boolean;
  blockPopUps?: boolean;
  pressEscape?: boolean;
  pageTimeoutMs?: number;
  scrollingDelayMs?: number;
  geolocation?: boolean;
  geolocationAccuracy?: number;
  waitForCloudSync?: boolean;
  timestampWatermark?: Record<string, unknown>;
  pageSource?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  /** Settings the API leaves to the browser rather than fixing a value. */
  leftToTheBrowser?: string[];
}

/** What `emulatedDevice` and `proxy.country` accept. */
export interface Catalog {
  emulatedDevices: string[];
  proxyCountries: string[];
}

export interface WireDefaults {
  spec_version?: string;
  response_type?: string;
  media_category?: string;
  format?: Record<string, string>;
  formats?: Record<string, string[]>;
  device_category?: string;
  emulated_device?: string;
  viewport?: {
    width: number;
    height: number;
    device_scale_factor: number;
  };
  zoom?: number;
  scroll_mode?: string;
  auto_height?: boolean;
  auto_height_max_height?: number | null;
  auto_height_max_height_webp?: number;
  block_ads?: boolean;
  block_pop_ups?: boolean;
  press_escape?: boolean;
  page_timeout_ms?: number;
  scrolling_delay_ms?: number;
  geolocation?: boolean;
  geolocation_accuracy?: number;
  wait_for_cloud_sync?: boolean;
  timestamp_watermark?: Record<string, unknown>;
  page_source?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  left_to_the_browser?: string[];
}

export interface WireCatalog {
  emulated_devices: string[];
  proxy_countries: string[];
}

export function parseDefaults(wire: WireDefaults): Defaults {
  const defaults: Defaults = {
    specVersion: wire.spec_version,
    responseType: wire.response_type,
    mediaCategory: wire.media_category,
    format: wire.format,
    formats: wire.formats,
    deviceCategory: wire.device_category,
    emulatedDevice: wire.emulated_device,
    viewport: wire.viewport && {
      width: wire.viewport.width,
      height: wire.viewport.height,
      deviceScaleFactor: wire.viewport.device_scale_factor,
    },
    zoom: wire.zoom,
    scrollMode: wire.scroll_mode,
    autoHeight: wire.auto_height,
    autoHeightMaxHeight: wire.auto_height_max_height,
    autoHeightMaxHeightWebp: wire.auto_height_max_height_webp,
    blockAds: wire.block_ads,
    blockPopUps: wire.block_pop_ups,
    pressEscape: wire.press_escape,
    pageTimeoutMs: wire.page_timeout_ms,
    scrollingDelayMs: wire.scrolling_delay_ms,
    geolocation: wire.geolocation,
    geolocationAccuracy: wire.geolocation_accuracy,
    waitForCloudSync: wire.wait_for_cloud_sync,
    timestampWatermark: camelCaseKeys(wire.timestamp_watermark) as
      Record<string, unknown> | undefined,
    pageSource: camelCaseKeys(wire.page_source) as
      Record<string, unknown> | undefined,
    limits: camelCaseKeys(wire.limits) as Record<string, unknown> | undefined,
    leftToTheBrowser: wire.left_to_the_browser,
  };
  // Fields the API did not send stay absent rather than showing up as `undefined`.
  return Object.fromEntries(
    Object.entries(defaults).filter(([, value]) => value !== undefined),
  );
}

export function parseCatalog(wire: WireCatalog): Catalog {
  return {
    emulatedDevices: wire.emulated_devices,
    proxyCountries: wire.proxy_countries,
  };
}
