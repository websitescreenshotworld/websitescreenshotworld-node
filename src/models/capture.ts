import type { ErrorCode } from "../error-codes.js";
import { parseDate } from "../wire.js";
import type {
  CaptureFormat,
  CaptureStatus,
  MediaCategory,
  PageSourceFormat,
  ResponseType,
  S3DeliveryStatus,
} from "./tokens.js";

/** The page source kept alongside a capture. */
export interface PageSource {
  format: PageSourceFormat;
  contentType: string | null;
  sizeBytes: number | null;
  /** Lowercase hex SHA-256 of the source. */
  sha256: string | null;
  /** Short-lived; reissued on every read. */
  downloadUrl: string | null;
}

/** How the upload to your bucket went. Present for `captureToBucket` only. */
export interface S3Delivery {
  status: S3DeliveryStatus;
  bucket: string;
  key: string | null;
  /** Masked to its last four characters. */
  accessKeyId: string | null;
  error: string | null;
}

/**
 * A capture, as `capture`, `captureToBucket`, `submit`, `submitToBucket`, `get` and `wait` return
 * it.
 */
export interface Capture {
  id: string;
  /**
   * `succeeded`, `failed` and the other end states; an async capture from `submit` or
   * `submitToBucket` reads `queued` until a browser takes it and `running` while it is captured.
   */
  status: CaptureStatus;
  responseType: ResponseType;
  mediaCategory: MediaCategory;
  /** The format written. */
  format: CaptureFormat | null;
  contentType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  /** How long the capture took. */
  durationMs: number | null;
  /** The status the website answered with. */
  pageHttpStatus: number | null;
  capturedAt: Date | null;
  /** Where the browser ended up, when the page redirected. */
  finalUrl: string | null;
  /** Lowercase hex SHA-256 of the file. */
  mediaSha256: string | null;
  /**
   * Valid for 60 minutes and reissued on every `get`. `null` for `captureToBucket` and for captures
   * without a file.
   */
  downloadUrl: string | null;
  /** When the file is deleted, 24 hours after the capture. */
  expiresAt: Date | null;
  pageSource: PageSource | null;
  s3Delivery: S3Delivery | null;
  callbackUrl: string | null;
  /** Why a `failed` or `timed_out` capture ended. */
  errorCode: ErrorCode | null;
  /** The default set the capture was taken under, such as `v1`. */
  specVersion: string;
}

/** A capture as the API sends it. */
export interface WireCapture {
  id: string;
  status: string;
  response_type: string;
  media_category: string;
  format?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  page_http_status?: number | null;
  captured_at?: string | null;
  final_url?: string | null;
  media_sha256?: string | null;
  download_url?: string | null;
  expires_at?: string | null;
  page_source?: WirePageSource | null;
  s3_delivery?: WireS3Delivery | null;
  callback_url?: string | null;
  error_code?: string | null;
  spec_version: string;
}

export interface WirePageSource {
  format: string;
  content_type?: string | null;
  size_bytes?: number | null;
  sha256?: string | null;
  download_url?: string | null;
}

export interface WireS3Delivery {
  status: string;
  bucket: string;
  key?: string | null;
  access_key_id?: string | null;
  error?: string | null;
}

/** The fields every form of a capture shares, webhooks included. */
export type CaptureFields = Omit<
  Capture,
  "downloadUrl" | "pageSource" | "s3Delivery"
>;

export function parseCaptureFields(wire: WireCapture): CaptureFields {
  return {
    id: wire.id,
    status: wire.status,
    responseType: wire.response_type,
    mediaCategory: wire.media_category,
    format: wire.format ?? null,
    contentType: wire.content_type ?? null,
    sizeBytes: wire.size_bytes ?? null,
    width: wire.width ?? null,
    height: wire.height ?? null,
    durationMs: wire.duration_ms ?? null,
    pageHttpStatus: wire.page_http_status ?? null,
    capturedAt: parseDate(wire.captured_at),
    finalUrl: wire.final_url ?? null,
    mediaSha256: wire.media_sha256 ?? null,
    expiresAt: parseDate(wire.expires_at),
    callbackUrl: wire.callback_url ?? null,
    errorCode: wire.error_code ?? null,
    specVersion: wire.spec_version,
  };
}

export function parseCapture(wire: WireCapture): Capture {
  return {
    ...parseCaptureFields(wire),
    downloadUrl: wire.download_url ?? null,
    pageSource: wire.page_source
      ? {
          ...parsePageSourceFields(wire.page_source),
          downloadUrl: wire.page_source.download_url ?? null,
        }
      : null,
    s3Delivery: wire.s3_delivery
      ? {
          ...parseS3DeliveryFields(wire.s3_delivery),
          accessKeyId: wire.s3_delivery.access_key_id ?? null,
        }
      : null,
  };
}

export function parsePageSourceFields(
  wire: WirePageSource,
): Omit<PageSource, "downloadUrl"> {
  return {
    format: wire.format,
    contentType: wire.content_type ?? null,
    sizeBytes: wire.size_bytes ?? null,
    sha256: wire.sha256 ?? null,
  };
}

export function parseS3DeliveryFields(
  wire: WireS3Delivery,
): Omit<S3Delivery, "accessKeyId"> {
  return {
    status: wire.status,
    bucket: wire.bucket,
    key: wire.key ?? null,
    error: wire.error ?? null,
  };
}
