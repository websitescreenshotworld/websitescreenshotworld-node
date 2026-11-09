import type {
  CaptureFields,
  PageSource,
  S3Delivery,
} from "../models/capture.js";
import type {
  CaptureFormat,
  MediaCategory,
  PageSourceFormat,
  Product,
} from "../models/tokens.js";

/** The event types this version knows. */
export const WebhookEventType = {
  CaptureSucceeded: "capture.succeeded",
  CaptureFailed: "capture.failed",
  DeliveryCompleted: "delivery.completed",
  CaptureChanged: "capture.changed",
  SchedulePaused: "schedule.paused",
  SitemapRunCompleted: "sitemap_run.completed",
  Ping: "ping",
} as const;
export type WebhookEventType =
  (typeof WebhookEventType)[keyof typeof WebhookEventType];

interface EventEnvelope<Type extends string, EventProduct, Data> {
  /** The delivery id; the same on every retry of this delivery. */
  id: string;
  type: Type;
  createdAt: Date;
  product: EventProduct;
  data: Data;
}

/** An Instant Snap capture as its webhook carries it: no download links or access key. */
export interface InstantSnapCaptureData extends CaptureFields {
  pageSource: Omit<PageSource, "downloadUrl"> | null;
  s3Delivery: Omit<S3Delivery, "accessKeyId"> | null;
}

/** A scheduled web page's capture. */
export interface ScheduledCapture {
  id: string;
  /** The web page's id; `autoSchedule.triggerNow` calls it `webPageId`. */
  scheduleId: string;
  scheduleName: string;
  url: string;
  status: string;
  mediaCategory: MediaCategory;
  format: CaptureFormat | null;
  pageHttpStatus: number | null;
  capturedAt: Date | null;
  finalUrl: string | null;
  mediaSha256: string | null;
  pageSource: { format: PageSourceFormat; sha256: string | null } | null;
  /** Set when the capture was part of a sitemap run. */
  sitemapRunId: string | null;
}

/** One place a scheduled capture was delivered to. */
export interface Destination {
  slot: number;
  name: string;
  provider: string;
  status: string;
  completedAt: Date | null;
}

export interface DeliveryCompletedData extends ScheduledCapture {
  destinations: Destination[];
}

export interface CaptureChangedData extends ScheduledCapture {
  /** How much of the image changed since the capture it was compared with. */
  changePercent: number | null;
  comparedToCaptureId: string | null;
  changeImageAvailable: boolean;
}

export interface SchedulePausedData {
  scheduleId: string;
  scheduleName: string;
  url: string;
  /** Why the schedule stopped, such as `quota_exhausted`. */
  reason: string;
  pausedAt: Date | null;
}

export interface SitemapRunCompletedData {
  sitemapRunId: string;
  scheduleId: string;
  scheduleName: string;
  sitemapUrl: string;
  status: string;
  runAt: Date | null;
  completedAt: Date | null;
  pagesListed: number | null;
  pagesMatched: number | null;
  pagesQueued: number | null;
  pagesSucceeded: number | null;
  pagesFailed: number | null;
  pagesOverLimit: number | null;
  pagesOverQuota: number | null;
  message: string | null;
}

export interface PingData {
  endpointId: string;
  endpointName: string;
  message: string;
  sentAt: Date | null;
}

type CaptureOutcome = "capture.succeeded" | "capture.failed";

/** An Instant Snap capture finished. */
export type InstantSnapCaptureEvent = EventEnvelope<
  CaptureOutcome,
  "instant_snap",
  InstantSnapCaptureData
>;

/** A scheduled web page's capture finished. */
export type AutoScheduleCaptureEvent = EventEnvelope<
  CaptureOutcome,
  "auto_schedule",
  ScheduledCapture
>;

/** A scheduled capture reached all of its destinations. */
export type DeliveryCompletedEvent = EventEnvelope<
  "delivery.completed",
  "auto_schedule",
  DeliveryCompletedData
>;

/** A scheduled capture differs from the one before it. */
export type CaptureChangedEvent = EventEnvelope<
  "capture.changed",
  "auto_schedule",
  CaptureChangedData
>;

/** A schedule stopped running. */
export type SchedulePausedEvent = EventEnvelope<
  "schedule.paused",
  "auto_schedule",
  SchedulePausedData
>;

/** Every page of a sitemap run has been captured or skipped. */
export type SitemapRunCompletedEvent = EventEnvelope<
  "sitemap_run.completed",
  "auto_schedule",
  SitemapRunCompletedData
>;

/** A test delivery sent from the dashboard, by either product. */
export type PingEvent = EventEnvelope<"ping", Product, PingData>;

/**
 * An event type this version does not know yet, with its payload as sent in `rawData`.
 *
 * Its `data` is never set: that keeps `event.data` precisely typed after `switch (event.type)`
 * narrows to a known type, since TypeScript cannot exclude one string from a `string` type.
 */
export interface UnknownWebhookEvent {
  id: string;
  type: string;
  createdAt: Date;
  product: string;
  data: never;
  /** The event's `data` exactly as sent, with snake_case keys. */
  rawData: Record<string, unknown>;
}

/** Every event `Webhook.verify` returns, told apart by `type` and, for captures, `product`. */
export type WebhookEvent =
  | InstantSnapCaptureEvent
  | AutoScheduleCaptureEvent
  | DeliveryCompletedEvent
  | CaptureChangedEvent
  | SchedulePausedEvent
  | SitemapRunCompletedEvent
  | PingEvent
  | UnknownWebhookEvent;
