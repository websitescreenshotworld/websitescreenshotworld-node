/**
 * The `error_code` tokens the APIs answer with. Switch on these, never on the HTTP status or the
 * message. A code added to the API later still comes through as a plain string.
 */
export const ErrorCode = {
  ApiKeyInvalid: "api_key_invalid",
  ValidationFailed: "validation_failed",
  S3DestinationInvalid: "s3_destination_invalid",
  WebPageIdInvalid: "web_page_id_invalid",
  IdempotencyKeyReused: "idempotency_key_reused",
  /** The web page is a sitemap schedule, which runs only on its schedule. Not retried. */
  SitemapScheduleNotTriggerable: "sitemap_schedule_not_triggerable",
  QuotaExhausted: "quota_exhausted",
  FeatureNotAvailable: "feature_not_available",
  NoTriggerAllowance: "no_trigger_allowance",
  Forbidden: "forbidden",
  CaptureNotFound: "capture_not_found",
  WebPageNotFound: "web_page_not_found",
  NotFound: "not_found",
  RateLimited: "rate_limited",
  /** Too many async captures are already waiting or running. Not retried. */
  QueueFull: "queue_full",
  CaptureFailed: "capture_failed",
  CaptureTimeout: "capture_timeout",
  PayloadTooLarge: "payload_too_large",
  /** An async capture still waited for a browser 15 minutes after it was accepted. Not charged. */
  CaptureExpired: "capture_expired",
  CaptureBusy: "capture_busy",
  ServiceUnavailable: "service_unavailable",
  InternalError: "internal_error",
  RequestCancelled: "request_cancelled",
  IdempotencyKeyInUse: "idempotency_key_in_use",
  UnknownError: "unknown_error",
} as const;

export type ErrorCode =
  (typeof ErrorCode)[keyof typeof ErrorCode] | (string & {});

/** The kind of error each known code raises. Codes not listed raise the base error. */
export const ERROR_KINDS = {
  authentication: ["api_key_invalid"],
  invalid_request: [
    "validation_failed",
    "s3_destination_invalid",
    "web_page_id_invalid",
    "idempotency_key_reused",
    "sitemap_schedule_not_triggerable",
  ],
  plan_limit: [
    "quota_exhausted",
    "feature_not_available",
    "no_trigger_allowance",
    "forbidden",
  ],
  not_found: ["capture_not_found", "web_page_not_found", "not_found"],
  rate_limit: ["rate_limited", "queue_full"],
  capture: [
    "capture_failed",
    "capture_timeout",
    "payload_too_large",
    "capture_expired",
  ],
  service: [
    "capture_busy",
    "service_unavailable",
    "internal_error",
    "request_cancelled",
    "idempotency_key_in_use",
  ],
} as const;

export type ErrorKind = keyof typeof ERROR_KINDS;

/**
 * Codes that are worth sending the same request again for. `queue_full` is not one: the async queue
 * stays full until captures finish, so it is raised for the caller with `retryAfterSeconds`.
 */
export const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  "rate_limited",
  "capture_busy",
  "service_unavailable",
  "idempotency_key_in_use",
]);

/** The code for a refusal that came without a JSON error body, usually from a proxy. */
export const FALLBACK_CODE_BY_STATUS: Readonly<Record<number, string>> = {
  400: "validation_failed",
  401: "api_key_invalid",
  403: "forbidden",
  404: "not_found",
  409: "idempotency_key_in_use",
  413: "payload_too_large",
  429: "rate_limited",
  500: "internal_error",
  502: "service_unavailable",
  503: "service_unavailable",
  504: "service_unavailable",
};

export const FALLBACK_CODE_FOR_OTHER_STATUS = "unknown_error";
