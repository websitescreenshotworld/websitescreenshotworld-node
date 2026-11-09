import {
  parseCaptureFields,
  parsePageSourceFields,
  parseS3DeliveryFields,
  type WireCapture,
} from "../models/capture.js";
import { parseDate } from "../wire.js";
import type {
  CaptureChangedData,
  DeliveryCompletedData,
  InstantSnapCaptureData,
  PingData,
  ScheduledCapture,
  SchedulePausedData,
  SitemapRunCompletedData,
  UnknownWebhookEvent,
  WebhookEvent,
} from "./events.js";

export interface WireEnvelope {
  id: string;
  type: string;
  created_at: string;
  product: string;
  data: unknown;
}

interface WireScheduledCapture {
  id: string;
  schedule_id: string;
  schedule_name: string;
  url: string;
  status: string;
  media_category: string;
  format?: string | null;
  page_http_status?: number | null;
  captured_at?: string | null;
  final_url?: string | null;
  media_sha256?: string | null;
  page_source?: { format: string; sha256?: string | null } | null;
  sitemap_run_id?: string | null;
}

interface WireDeliveryCompleted extends WireScheduledCapture {
  destinations?: {
    slot: number;
    name: string;
    provider: string;
    status: string;
    completed_at?: string | null;
  }[];
}

interface WireCaptureChanged extends WireScheduledCapture {
  change_percent?: number | null;
  compared_to_capture_id?: string | null;
  change_image_available?: boolean;
}

interface WireSchedulePaused {
  schedule_id: string;
  schedule_name: string;
  url: string;
  reason: string;
  paused_at?: string | null;
}

interface WireSitemapRunCompleted {
  sitemap_run_id: string;
  schedule_id: string;
  schedule_name: string;
  sitemap_url: string;
  status: string;
  run_at?: string | null;
  completed_at?: string | null;
  pages_listed?: number | null;
  pages_matched?: number | null;
  pages_queued?: number | null;
  pages_succeeded?: number | null;
  pages_failed?: number | null;
  pages_over_limit?: number | null;
  pages_over_quota?: number | null;
  message?: string | null;
}

interface WirePing {
  endpoint_id: string;
  endpoint_name: string;
  message: string;
  sent_at?: string | null;
}

/** Turns a verified webhook body into its typed event. */
export function parseEvent(wire: WireEnvelope): WebhookEvent {
  const { type, product, data } = wire;
  const envelope = { id: wire.id, createdAt: parseDate(wire.created_at) };

  if (type === "capture.succeeded" || type === "capture.failed") {
    if (product === "instant_snap") {
      const capture = instantSnapCapture(data as WireCapture);
      return { ...envelope, type, product, data: capture };
    }
    if (product === "auto_schedule") {
      const capture = scheduledCapture(data as WireScheduledCapture);
      return { ...envelope, type, product, data: capture };
    }
  }
  switch (type) {
    case "delivery.completed":
      return {
        ...envelope,
        type,
        product: "auto_schedule",
        data: deliveryCompleted(data as WireDeliveryCompleted),
      };
    case "capture.changed":
      return {
        ...envelope,
        type,
        product: "auto_schedule",
        data: captureChanged(data as WireCaptureChanged),
      };
    case "schedule.paused":
      return {
        ...envelope,
        type,
        product: "auto_schedule",
        data: schedulePaused(data as WireSchedulePaused),
      };
    case "sitemap_run.completed":
      return {
        ...envelope,
        type,
        product: "auto_schedule",
        data: sitemapRunCompleted(data as WireSitemapRunCompleted),
      };
    case "ping":
      return { ...envelope, type, product, data: ping(data as WirePing) };
    default:
      // Includes a known capture type from a product this version does not know.
      return {
        ...envelope,
        type,
        product,
        rawData: data as Record<string, unknown>,
      } as UnknownWebhookEvent;
  }
}

function instantSnapCapture(wire: WireCapture): InstantSnapCaptureData {
  return {
    ...parseCaptureFields(wire),
    pageSource: wire.page_source
      ? parsePageSourceFields(wire.page_source)
      : null,
    s3Delivery: wire.s3_delivery
      ? parseS3DeliveryFields(wire.s3_delivery)
      : null,
  };
}

function scheduledCapture(wire: WireScheduledCapture): ScheduledCapture {
  return {
    id: wire.id,
    scheduleId: wire.schedule_id,
    scheduleName: wire.schedule_name,
    url: wire.url,
    status: wire.status,
    mediaCategory: wire.media_category,
    format: wire.format ?? null,
    pageHttpStatus: wire.page_http_status ?? null,
    capturedAt: parseDate(wire.captured_at),
    finalUrl: wire.final_url ?? null,
    mediaSha256: wire.media_sha256 ?? null,
    pageSource: wire.page_source
      ? {
          format: wire.page_source.format,
          sha256: wire.page_source.sha256 ?? null,
        }
      : null,
    sitemapRunId: wire.sitemap_run_id ?? null,
  };
}

function deliveryCompleted(wire: WireDeliveryCompleted): DeliveryCompletedData {
  return {
    ...scheduledCapture(wire),
    destinations: (wire.destinations ?? []).map((destination) => ({
      slot: destination.slot,
      name: destination.name,
      provider: destination.provider,
      status: destination.status,
      completedAt: parseDate(destination.completed_at),
    })),
  };
}

function captureChanged(wire: WireCaptureChanged): CaptureChangedData {
  return {
    ...scheduledCapture(wire),
    changePercent: wire.change_percent ?? null,
    comparedToCaptureId: wire.compared_to_capture_id ?? null,
    changeImageAvailable: wire.change_image_available ?? false,
  };
}

function schedulePaused(wire: WireSchedulePaused): SchedulePausedData {
  return {
    scheduleId: wire.schedule_id,
    scheduleName: wire.schedule_name,
    url: wire.url,
    reason: wire.reason,
    pausedAt: parseDate(wire.paused_at),
  };
}

function sitemapRunCompleted(
  wire: WireSitemapRunCompleted,
): SitemapRunCompletedData {
  return {
    sitemapRunId: wire.sitemap_run_id,
    scheduleId: wire.schedule_id,
    scheduleName: wire.schedule_name,
    sitemapUrl: wire.sitemap_url,
    status: wire.status,
    runAt: parseDate(wire.run_at),
    completedAt: parseDate(wire.completed_at),
    pagesListed: wire.pages_listed ?? null,
    pagesMatched: wire.pages_matched ?? null,
    pagesQueued: wire.pages_queued ?? null,
    pagesSucceeded: wire.pages_succeeded ?? null,
    pagesFailed: wire.pages_failed ?? null,
    pagesOverLimit: wire.pages_over_limit ?? null,
    pagesOverQuota: wire.pages_over_quota ?? null,
    message: wire.message ?? null,
  };
}

function ping(wire: WirePing): PingData {
  return {
    endpointId: wire.endpoint_id,
    endpointName: wire.endpoint_name,
    message: wire.message,
    sentAt: parseDate(wire.sent_at),
  };
}
