# Website Screenshot World for Node.js

The official Node.js client for [Website Screenshot World](https://websitescreenshotworld.com): capture
web pages on demand with **Instant Snap**, start a scheduled page's capture with **Auto Schedule**, and
verify the webhooks both products send.

- Written in TypeScript, with types for every option, answer and webhook event
- ES modules and CommonJS, no runtime dependencies
- Retries with idempotency keys, timeouts and `AbortSignal` cancellation built in

## Install

```sh
npm install @websitescreenshotworld/sdk
```

## Quick start

Create a client once and reuse it. The keys default to the `WSW_INSTANT_SNAP_API_KEY` and
`WSW_AUTO_SCHEDULE_API_KEY` environment variables; you only need the key of the product you use.

### Instant Snap

```ts
import { WebsiteScreenshotWorld } from "@websitescreenshotworld/sdk";

const client = new WebsiteScreenshotWorld();

const capture = await client.instantSnap.capture({
  url: "https://example.com",
  format: "webp",
  viewport: { width: 1440 },
});

console.log(capture.id, capture.width, capture.height);
console.log(capture.downloadUrl); // valid for 60 minutes
```

Every option of the API is available in camelCase: `mediaCategory`, `scrollMode`, `blockAds`,
`timestampWatermark`, `pageSource` and the rest. Options you leave out take the API's defaults, which
`client.instantSnap.defaults()` lists; `client.instantSnap.catalog()` lists the devices and proxy
countries you can ask for. Names in `headers` and `cookies` are sent exactly as you write them.

### Auto Schedule

Web pages are set up in the dashboard. Start one's capture now with its id; the outcome arrives by
webhook.

```ts
const result = await client.autoSchedule.triggerNow(
  "7d4e2b1a-6c5f-4a3e-9d8c-2b1a0f9e8d7c",
);

if (result.status === "already_pending") {
  console.log("A capture was already on its way:", result.message);
}
```

## Saving a file

`captureFile` returns the file in the answer itself, as a stream, along with its metadata. The API does
not keep the file, so save or read it before you drop the result.

```ts
const file = await client.instantSnap.captureFile({
  url: "https://example.com",
  format: "png",
});

console.log(file.filename, file.contentType, file.sha256);
await file.saveTo(`./${file.filename ?? "capture.png"}`);
```

`file.body` is a web `ReadableStream` you can pipe anywhere instead, and `file.arrayBuffer()` reads the
whole file into memory. The stream can be read once.

## Uploading to a bucket

`captureToBucket` uploads the file to your own S3-compatible storage. Give it a `region` for AWS, or an
`endpointUrl` for other providers.

```ts
const capture = await client.instantSnap.captureToBucket({
  url: "https://example.com",
  s3Delivery: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    bucket: "captures",
    region: "eu-west-2",
    keyPrefix: "example/",
    waitForSync: true,
  },
});

console.log(capture.s3Delivery?.status, capture.s3Delivery?.key);
```

## Async captures

`submit` and `submitToBucket` do not wait for the capture: the API accepts it at once and returns it with
`status: "queued"`, and it runs when a browser is free (`running`, then `succeeded` or `failed`). `wait`
reads it with `get` every few seconds until it has finished.

```ts
import { CaptureStatus } from "@websitescreenshotworld/sdk";

const queued = await client.instantSnap.submit({
  url: "https://example.com",
  timeout: 240, // seconds of browser time, 30 to 300; the API uses 120 when left out
});

const capture = await client.instantSnap.wait(queued.id, {
  timeoutSeconds: 600, // default 360
  pollIntervalSeconds: 5, // default 3
});

if (capture.status === CaptureStatus.Succeeded) {
  await client.instantSnap.download(capture, "./capture.png");
}

const toBucket = await client.instantSnap.submitToBucket({
  url: "https://example.com",
  s3Delivery: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    bucket: "captures",
    region: "eu-west-2",
  },
});
console.log(toBucket.status); // "queued"; wait for it the same way
```

When `timeoutSeconds` runs out first, `wait` returns the capture as last read, still `queued` or
`running`, rather than throwing, so you can wait again. It takes an `AbortSignal` as `signal`. Instead of
waiting, you can also set `callbackUrl` and receive the `capture.succeeded` or `capture.failed` webhook.

`timeout` is only for `submit` and `submitToBucket`; the API refuses it on the other capture calls. The
submit call itself uses the client's `timeout` (30 seconds), not `captureTimeout`, since it is answered at
once. A capture still queued 15 minutes after it was accepted ends `failed` with `capture_expired`, and is
not charged. When your organization already has as many async captures waiting or running as it may, the
API answers `queue_full`: the client throws it at once as a `RateLimitError` with `retryAfterSeconds`,
without retrying.

## Reading a capture back

Files are kept for 24 hours. `get` returns the capture with a fresh `downloadUrl`, and `download` writes
the file (or the page source) to a path, a Node.js stream or a web `WritableStream`.

```ts
const capture = await client.instantSnap.get(
  "3f6c2a1e-9b8d-4c7e-a5f4-1d2e3c4b5a69",
);

await client.instantSnap.download(capture, "./capture.png");
if (capture.pageSource !== null) {
  await client.instantSnap.download(capture.pageSource, "./capture.html");
}
```

## Errors and retries

Every error is a `WebsiteScreenshotWorldError`, with `errorCode`, `message`, `httpStatus`,
`retryAfterSeconds` and `rawBody`. Each kind of refusal has its own subclass:

| Class                        | When                                                         |
| ---------------------------- | ------------------------------------------------------------ |
| `AuthenticationError`        | The API key is missing, invalid or for the other product     |
| `InvalidRequestError`        | The request was invalid, such as an out-of-range option      |
| `PlanLimitError`             | The plan has no captures left, or does not include a feature |
| `NotFoundError`              | No such capture or web page for this account                 |
| `RateLimitError`             | Too many requests even after retrying, or the queue is full  |
| `CaptureError`               | The website could not be captured, or the file was too large |
| `ServiceError`               | The service was busy or failed on its side                   |
| `ConnectionError`            | No answer came back, or the call ran out of time             |
| `SignatureVerificationError` | A webhook's signature did not check out                      |

Decide what to do from `errorCode`, never from the status or the message. The `ErrorCode` constants name
the codes the API sends today; a code added later arrives as the base class with its new code.

```ts
import {
  CaptureError,
  ErrorCode,
  PlanLimitError,
  WebsiteScreenshotWorldError,
} from "@websitescreenshotworld/sdk";

try {
  await client.instantSnap.capture({ url: "https://example.com" });
} catch (error) {
  if (
    error instanceof CaptureError &&
    error.errorCode === ErrorCode.CaptureTimeout
  ) {
    // The page took too long to load: a longer pageTimeoutMs may help.
  } else if (error instanceof PlanLimitError) {
    // Out of captures, or the plan does not include an option that was asked for.
  } else if (error instanceof WebsiteScreenshotWorldError) {
    console.error(error.errorCode, error.message);
  } else {
    throw error;
  }
}
```

The client retries what is safe and likely to succeed: `rate_limited`, `capture_busy`,
`service_unavailable`, `idempotency_key_in_use` and requests that got no answer. It waits as long as the
API asks (up to a minute), otherwise 0.5 seconds and then 1 second, with a little jitter. It retries twice
by default; set `maxRetries` to change that. A failed or timed-out capture is not retried, and neither is
`queue_full` from `submit`: the queue stays full until captures finish, so you decide when to try again.

## Idempotency keys

Every capture carries an `Idempotency-Key`, and retries of that call reuse it, so a retry never captures
twice. Pass your own key to make a capture safe to repeat across calls and processes for 24 hours:

```ts
const hero = await client.instantSnap.capture(
  { url: "https://example.com" },
  { idempotencyKey: "order-1234-hero" },
);
```

Trigger-now needs no key: a second call while the first capture is pending answers `already_pending`.

## Timeouts and cancellation

A capture may take up to 120 seconds on the API's side, so capture calls time out after 180
seconds and other calls after 30, retries included. Change them for the client or per call, and pass an
`AbortSignal` to cancel:

```ts
const quick = new WebsiteScreenshotWorld({ captureTimeout: 60_000 });

const controller = new AbortController();
const pending = quick.instantSnap.capture(
  { url: "https://example.com" },
  { timeout: 90_000, signal: controller.signal },
);
controller.abort(); // `pending` rejects with the signal's reason
```

`submit` and `submitToBucket` use `timeout`, not `captureTimeout`. A timeout raises `ConnectionError`. Cancelling stops the call and any retry it would make at once.

## Webhooks

Each delivery is signed in its `X-WSW-Signature` header. `Webhook.verify` checks the signature against
the raw body and returns the event, typed by `type` and, for captures, by `product`:

```ts
import { Webhook, type WebhookEvent } from "@websitescreenshotworld/sdk";

const secret = process.env.WSW_WEBHOOK_SECRET ?? "";

function handle(event: WebhookEvent): void {
  switch (event.type) {
    case "capture.succeeded":
      if (event.product === "instant_snap") {
        console.log(
          "Instant Snap capture",
          event.data.id,
          event.data.mediaSha256,
        );
      } else if (event.product === "auto_schedule") {
        console.log("Scheduled capture of", event.data.scheduleName);
      }
      break;
    case "capture.changed":
      console.log(event.data.url, "changed by", event.data.changePercent, "%");
      break;
    case "ping":
      console.log(event.data.message);
      break;
    default:
      // An event type added after this version: its type and raw data still arrive.
      if ("rawData" in event) console.log(event.type, event.rawData);
  }
}
```

The other events are `capture.failed`, `delivery.completed`, `schedule.paused` and
`sitemap_run.completed`; `WebhookEventType` names them all. `verify` throws `SignatureVerificationError`
when the signature does not match or its timestamp is more than five minutes from now; pass
`{ tolerance }` in seconds to change that.

The signature covers the exact bytes that were sent, so give `verify` the raw body, not JSON your
framework parsed and serialised again. The examples below reuse `secret` and `handle` from above.

### Express

```ts
import express from "express";

const app = express();

app.post(
  "/webhooks/wsw",
  express.raw({ type: "application/json" }),
  (request, response) => {
    try {
      const event = Webhook.verify(
        request.body as Buffer,
        request.get("X-WSW-Signature"),
        secret,
      );
      handle(event);
      response.sendStatus(204);
    } catch {
      response.sendStatus(400);
    }
  },
);
```

### Fastify

```ts
import Fastify from "fastify";

const fastify = Fastify();

fastify.register(async (webhooks) => {
  webhooks.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_request, body, done) => {
      done(null, body);
    },
  );

  webhooks.post("/webhooks/wsw", async (request, reply) => {
    try {
      const event = Webhook.verify(
        request.body as Buffer,
        request.headers["x-wsw-signature"],
        secret,
      );
      handle(event);
      return reply.code(204).send();
    } catch {
      return reply.code(400).send();
    }
  });
});
```

### Next.js (App Router)

```ts
// app/webhooks/wsw/route.ts
export async function POST(request: Request): Promise<Response> {
  try {
    const event = Webhook.verify(
      await request.text(),
      request.headers.get("X-WSW-Signature"),
      secret,
    );
    handle(event);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 400 });
  }
}
```

## Configuration

| Option                | Default                                      |
| --------------------- | -------------------------------------------- |
| `instantSnapApiKey`   | `WSW_INSTANT_SNAP_API_KEY`                   |
| `autoScheduleApiKey`  | `WSW_AUTO_SCHEDULE_API_KEY`                  |
| `instantSnapBaseUrl`  | `https://api.websitescreenshotworld.com`     |
| `autoScheduleBaseUrl` | `https://autoapi.websitescreenshotworld.com` |
| `captureTimeout`      | `180_000` milliseconds                       |
| `timeout`             | `30_000` milliseconds                        |
| `maxRetries`          | `2`                                          |
| `fetch`               | the global `fetch`                           |

Either key can be left out. Calling a product without its key throws `AuthenticationError` before
anything is sent.

## Supported runtimes

Node.js 22 and later, from ES modules or CommonJS. The type definitions need TypeScript 5.0 or later.

## Development

```sh
npm ci
npm test       # builds, then runs the unit tests and the shared conformance cases
npm run lint   # ESLint, Prettier and the type checker
```

The tests start `spec/conformance/server.js` and read the shared cases in `spec/`, the
[websitescreenshotworld-spec](https://github.com/websitescreenshotworld/websitescreenshotworld-spec) submodule, so
clone with `git clone --recurse-submodules`, or run `git submodule update --init` in an existing clone.

## License

MIT. See [LICENSE](LICENSE).
