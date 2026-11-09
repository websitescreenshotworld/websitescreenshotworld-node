// Each token is a set of named constants plus a type that also accepts any other string, so a value
// the API adds later still comes through while the known ones keep their autocompletion.

/** Where a capture is in its life. */
export const CaptureStatus = {
  Pending: "pending",
  /** An async capture accepted and waiting for a browser. */
  Queued: "queued",
  /** An async capture a browser is taking now. */
  Running: "running",
  Succeeded: "succeeded",
  /** The end state of `captureFile`: the file went back in the answer and is not kept. */
  Delivered: "delivered",
  Failed: "failed",
  TimedOut: "timed_out",
  Expired: "expired",
} as const;
export type CaptureStatus =
  (typeof CaptureStatus)[keyof typeof CaptureStatus] | (string & {});

/** How the API answered a capture. */
export const ResponseType = {
  Json: "json",
  ByFormat: "by_format",
  CloudStorage: "cloud_storage",
} as const;
export type ResponseType =
  (typeof ResponseType)[keyof typeof ResponseType] | (string & {});

export const MediaCategory = {
  Image: "image",
  Video: "video",
  Pdf: "pdf",
} as const;
export type MediaCategory =
  (typeof MediaCategory)[keyof typeof MediaCategory] | (string & {});

/** The file format. It must belong to the capture's media category. */
export const CaptureFormat = {
  Png: "png",
  Jpeg: "jpeg",
  Webp: "webp",
  Tiff: "tiff",
  Mp4: "mp4",
  Webm: "webm",
  Mov: "mov",
  Gif: "gif",
  ImagePdf: "image_pdf",
  DocumentPdf: "document_pdf",
} as const;
export type CaptureFormat =
  (typeof CaptureFormat)[keyof typeof CaptureFormat] | (string & {});

export const DeviceCategory = {
  Desktop: "desktop",
  Mobile: "mobile",
} as const;
export type DeviceCategory =
  (typeof DeviceCategory)[keyof typeof DeviceCategory] | (string & {});

export const ScrollMode = {
  /** Only what fits in the viewport. */
  Viewport: "viewport",
  /** The full page. */
  Scroll: "scroll",
} as const;
export type ScrollMode =
  (typeof ScrollMode)[keyof typeof ScrollMode] | (string & {});

export const WatermarkLocation = {
  Top: "top",
  Bottom: "bottom",
} as const;
export type WatermarkLocation =
  (typeof WatermarkLocation)[keyof typeof WatermarkLocation] | (string & {});

export const PageSourceFormat = {
  Html: "html",
  Json: "json",
  Text: "text",
} as const;
export type PageSourceFormat =
  (typeof PageSourceFormat)[keyof typeof PageSourceFormat] | (string & {});

/** Where an upload to your bucket stands. */
export const S3DeliveryStatus = {
  NotStarted: "not_started",
  InProgress: "in_progress",
  Completed: "completed",
  Failed: "failed",
} as const;
export type S3DeliveryStatus =
  (typeof S3DeliveryStatus)[keyof typeof S3DeliveryStatus] | (string & {});

/** What a trigger-now call did. */
export const TriggerStatus = {
  Triggered: "triggered",
  /** A capture was already queued or running; nothing new was started or charged. */
  AlreadyPending: "already_pending",
} as const;
export type TriggerStatus =
  (typeof TriggerStatus)[keyof typeof TriggerStatus] | (string & {});

/** Who started a scheduled web page's pending capture. */
export const TriggeredBy = {
  Api: "api",
  Ui: "ui",
} as const;
export type TriggeredBy =
  (typeof TriggeredBy)[keyof typeof TriggeredBy] | (string & {});

/** The product a webhook event comes from. */
export const Product = {
  InstantSnap: "instant_snap",
  AutoSchedule: "auto_schedule",
} as const;
export type Product = (typeof Product)[keyof typeof Product] | (string & {});
