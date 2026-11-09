export { WebsiteScreenshotWorld, type ClientOptions } from "./client.js";
export type { InstantSnap, WaitOptions } from "./instant-snap.js";
export type { AutoSchedule } from "./auto-schedule.js";
export type { CaptureRequestOptions, RequestOptions } from "./transport.js";
export type { FileDestination } from "./files.js";

export type {
  CaptureFileOptions,
  CaptureOptions,
  CaptureToBucketOptions,
  GeolocationOptions,
  PageSourceOptions,
  ProxyOptions,
  S3DeliveryOptions,
  SelectorOptions,
  TimestampWatermarkOptions,
  ViewportOptions,
} from "./models/capture-options.js";
export type {
  Capture,
  CaptureFields,
  PageSource,
  S3Delivery,
} from "./models/capture.js";
export type { CaptureFile } from "./models/capture-file.js";
export type { Catalog, DefaultViewport, Defaults } from "./models/defaults.js";
export type { TriggerResult } from "./models/trigger-result.js";
export {
  CaptureFormat,
  CaptureStatus,
  DeviceCategory,
  MediaCategory,
  PageSourceFormat,
  Product,
  ResponseType,
  S3DeliveryStatus,
  ScrollMode,
  TriggeredBy,
  TriggerStatus,
  WatermarkLocation,
} from "./models/tokens.js";

export { ErrorCode } from "./error-codes.js";
export {
  AuthenticationError,
  CaptureError,
  ConnectionError,
  InvalidRequestError,
  NotFoundError,
  PlanLimitError,
  RateLimitError,
  ServiceError,
  SignatureVerificationError,
  WebsiteScreenshotWorldError,
  type ErrorDetails,
} from "./errors.js";

export { Webhook, type VerifyOptions } from "./webhooks/webhook.js";
export {
  WebhookEventType,
  type AutoScheduleCaptureEvent,
  type CaptureChangedData,
  type CaptureChangedEvent,
  type DeliveryCompletedData,
  type DeliveryCompletedEvent,
  type Destination,
  type InstantSnapCaptureData,
  type InstantSnapCaptureEvent,
  type PingData,
  type PingEvent,
  type ScheduledCapture,
  type SchedulePausedData,
  type SchedulePausedEvent,
  type SitemapRunCompletedData,
  type SitemapRunCompletedEvent,
  type UnknownWebhookEvent,
  type WebhookEvent,
} from "./webhooks/events.js";

export { VERSION } from "./version.js";
