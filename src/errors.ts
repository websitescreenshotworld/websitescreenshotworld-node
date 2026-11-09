import { ERROR_KINDS, type ErrorCode, type ErrorKind } from "./error-codes.js";

/** What an error knows about the answer that caused it. */
export interface ErrorDetails {
  errorCode?: ErrorCode | null;
  httpStatus?: number | null;
  retryAfterSeconds?: number | null;
  rawBody?: string | null;
  cause?: unknown;
}

/**
 * The base class of every error this library throws. An `error_code` this version does not know
 * raises this class itself; known codes raise one of its subclasses.
 */
export class WebsiteScreenshotWorldError extends Error {
  static {
    this.prototype.name = "WebsiteScreenshotWorldError";
  }

  /** The API's error token, such as `rate_limited`. `null` when no answer came back. */
  readonly errorCode: ErrorCode | null;
  /** The HTTP status of the answer. `null` when no answer came back. */
  readonly httpStatus: number | null;
  /** How long the API asked to wait before trying again, in seconds. */
  readonly retryAfterSeconds: number | null;
  /** The body of the answer as received. */
  readonly rawBody: string | null;

  constructor(message: string, details: ErrorDetails = {}) {
    super(
      message,
      details.cause === undefined ? undefined : { cause: details.cause },
    );
    this.errorCode = details.errorCode ?? null;
    this.httpStatus = details.httpStatus ?? null;
    this.retryAfterSeconds = details.retryAfterSeconds ?? null;
    this.rawBody = details.rawBody ?? null;
  }
}

/** The API key is missing, malformed, revoked or belongs to the other product. */
export class AuthenticationError extends WebsiteScreenshotWorldError {
  static {
    this.prototype.name = "AuthenticationError";
  }
}

/** The request was refused as invalid. Sending it again will not help. */
export class InvalidRequestError extends WebsiteScreenshotWorldError {
  static {
    this.prototype.name = "InvalidRequestError";
  }
}

/** The plan has run out of captures, or does not include what was asked for. */
export class PlanLimitError extends WebsiteScreenshotWorldError {
  static {
    this.prototype.name = "PlanLimitError";
  }
}

/** The capture or web page does not exist for this account. */
export class NotFoundError extends WebsiteScreenshotWorldError {
  static {
    this.prototype.name = "NotFoundError";
  }
}

/** Too many requests, still refused after the retries ran out. */
export class RateLimitError extends WebsiteScreenshotWorldError {
  static {
    this.prototype.name = "RateLimitError";
  }
}

/** The website could not be captured, or the file was too large to return. Not retried. */
export class CaptureError extends WebsiteScreenshotWorldError {
  static {
    this.prototype.name = "CaptureError";
  }
}

/** The service was busy or failed on its side. */
export class ServiceError extends WebsiteScreenshotWorldError {
  static {
    this.prototype.name = "ServiceError";
  }
}

/**
 * The request could not be sent, no answer came back, or the call ran out of time. The underlying
 * error, when there is one, is the `cause`.
 */
export class ConnectionError extends WebsiteScreenshotWorldError {
  static {
    this.prototype.name = "ConnectionError";
  }
}

/** A webhook's signature header is missing, malformed, too old or does not match the body. */
export class SignatureVerificationError extends WebsiteScreenshotWorldError {
  static {
    this.prototype.name = "SignatureVerificationError";
  }
}

const CLASS_BY_KIND: Record<
  ErrorKind,
  new (message: string, details?: ErrorDetails) => WebsiteScreenshotWorldError
> = {
  authentication: AuthenticationError,
  invalid_request: InvalidRequestError,
  plan_limit: PlanLimitError,
  not_found: NotFoundError,
  rate_limit: RateLimitError,
  capture: CaptureError,
  service: ServiceError,
};

const KIND_BY_CODE = new Map<string, ErrorKind>(
  Object.entries(ERROR_KINDS).flatMap(([kind, codes]) =>
    codes.map((code) => [code, kind as ErrorKind] as const),
  ),
);

/** Creates the error class that `errorCode` raises. */
export function errorFor(
  errorCode: string,
  message: string,
  details: Omit<ErrorDetails, "errorCode">,
): WebsiteScreenshotWorldError {
  const kind = KIND_BY_CODE.get(errorCode);
  const ErrorClass =
    kind === undefined ? WebsiteScreenshotWorldError : CLASS_BY_KIND[kind];
  return new ErrorClass(message, { ...details, errorCode });
}
