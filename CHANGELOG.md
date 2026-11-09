# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package uses
[semantic versioning](https://semver.org/).

## [0.1.0] - 2026-11-09

The first release.

### Added

- `WebsiteScreenshotWorld`, one client for both products, with keys read from
  `WSW_INSTANT_SNAP_API_KEY` and `WSW_AUTO_SCHEDULE_API_KEY` when not passed, and an optional
  `fetch` of your own.
- Instant Snap: `capture`, `captureFile` (the file as a stream, with its metadata, `arrayBuffer()` and
  `saveTo()`), `captureToBucket`, `get`, `download`, `defaults` and `catalog`, with every capture
  option typed in camelCase.
- Instant Snap async captures: `submit` and `submitToBucket`, answered at once with the capture
  `queued`, and `wait`, which polls `get` until it has finished; the `timeout` capture option (30 to
  300 seconds, async only); the `queued` and `running` statuses; and the `queue_full` (a
  `RateLimitError`, not retried) and `capture_expired` error codes.
- Auto Schedule: `triggerNow`.
- The `pressEscape` capture option, and the `sitemap_schedule_not_triggerable` error code (an
  `InvalidRequestError`: a sitemap schedule runs only on its schedule), from API version 1.1.0.
- Redirects are never followed, so the API key is never sent anywhere else; a 3xx answer is raised
  as an error.
- `Webhook.verify`, which checks the `X-WSW-Signature` header and returns a typed event for each of
  `capture.succeeded`, `capture.failed`, `delivery.completed`, `capture.changed`, `schedule.paused`,
  `sitemap_run.completed` and `ping`, and an unknown event, with its raw data, for types added later.
- `WebsiteScreenshotWorldError` and a subclass for each kind of error, with `errorCode`, `httpStatus`,
  `retryAfterSeconds` and the raw body, plus `ErrorCode` constants.
- Retries of rate limits, busy or unavailable service and lost connections, with an `Idempotency-Key`
  on every capture; timeouts and `AbortSignal` cancellation per call.
- Named constants for the API's tokens, such as `CaptureStatus` and `CaptureFormat`, with unknown
  values passed through as strings.
- ES module and CommonJS builds with type definitions, for Node.js 22 and later.
