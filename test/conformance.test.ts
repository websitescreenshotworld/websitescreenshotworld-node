import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import {
  AuthenticationError,
  CaptureError,
  InvalidRequestError,
  NotFoundError,
  PlanLimitError,
  RateLimitError,
  ServiceError,
  WebsiteScreenshotWorld,
  WebsiteScreenshotWorldError,
  type CaptureFile,
  type CaptureOptions,
  type CaptureToBucketOptions,
} from "../src/index.js";
import {
  jsonFilesIn,
  keys,
  optionsFromWire,
  propertyName,
  readJson,
  specDir,
  startConformanceServer,
  type ConformanceServer,
  type FixtureResponse,
  type RecordedRequest,
} from "./helpers.js";

interface Fixture {
  name: string;
  call: {
    product: "instant_snap" | "auto_schedule";
    method: string;
    options?: Record<string, unknown>;
    idempotency_key?: string;
    id?: string;
    web_page_id?: string;
    poll_interval_seconds?: number;
    timeout_seconds?: number;
  };
  expect_requests: {
    method: string;
    path: string;
    headers: Record<string, string>;
    idempotency_key?: "present" | "same";
    body?: unknown;
  }[];
  responses: FixtureResponse[];
  expect: {
    result?: Record<string, unknown>;
    error?: {
      kind: string;
      error_code: string;
      http_status: number;
      message?: string;
      retry_after_seconds?: number;
    };
  };
}

const ERROR_CLASSES: Record<string, typeof WebsiteScreenshotWorldError> = {
  authentication: AuthenticationError,
  invalid_request: InvalidRequestError,
  plan_limit: PlanLimitError,
  not_found: NotFoundError,
  rate_limit: RateLimitError,
  capture: CaptureError,
  service: ServiceError,
  base: WebsiteScreenshotWorldError,
};

const fixturesDir = path.join(specDir, "fixtures");
const fixtures = jsonFilesIn(fixturesDir)
  .filter((name) => name !== "keys.json")
  .map((name) => readJson(fixturesDir, name) as Fixture);

function callFixture(
  client: WebsiteScreenshotWorld,
  call: Fixture["call"],
): Promise<unknown> {
  const options = optionsFromWire(call.options ?? {});
  const requestOptions =
    call.idempotency_key === undefined
      ? {}
      : { idempotencyKey: call.idempotency_key };
  const { instantSnap, autoSchedule } = client;
  switch (`${call.product}.${call.method}`) {
    case "instant_snap.capture":
      return instantSnap.capture(options as CaptureOptions, requestOptions);
    case "instant_snap.capture_file":
      return instantSnap.captureFile(options as CaptureOptions, requestOptions);
    case "instant_snap.capture_to_bucket":
      return instantSnap.captureToBucket(
        options as CaptureToBucketOptions,
        requestOptions,
      );
    case "instant_snap.submit":
      return instantSnap.submit(options as CaptureOptions, requestOptions);
    case "instant_snap.submit_to_bucket":
      return instantSnap.submitToBucket(
        options as CaptureToBucketOptions,
        requestOptions,
      );
    case "instant_snap.wait":
      return instantSnap.wait(call.id ?? "", {
        pollIntervalSeconds: call.poll_interval_seconds,
        timeoutSeconds: call.timeout_seconds,
      });
    case "instant_snap.get":
      return instantSnap.get(call.id ?? "");
    case "instant_snap.defaults":
      return instantSnap.defaults();
    case "instant_snap.catalog":
      return instantSnap.catalog();
    case "auto_schedule.trigger_now":
      return autoSchedule.triggerNow(call.web_page_id ?? "");
    default:
      throw new Error(`No such call: ${call.product}.${call.method}`);
  }
}

function assertRequests(
  actual: RecordedRequest[],
  expected: Fixture["expect_requests"],
): void {
  assert.equal(actual.length, expected.length, "number of requests");
  const keysSent = new Set<string | undefined>();
  expected.forEach((want, index) => {
    const got = actual[index];
    assert.ok(got);
    assert.equal(got.method, want.method);
    assert.equal(got.path, want.path);
    for (const [name, value] of Object.entries(want.headers)) {
      assert.equal(got.headers[name.toLowerCase()], value, `header ${name}`);
    }
    if (want.idempotency_key !== undefined) {
      const key = got.headers["idempotency-key"];
      assert.ok(key, "Idempotency-Key is sent");
      keysSent.add(key);
    }
    if (want.body !== undefined) {
      const body = got.body === null ? null : (JSON.parse(got.body) as unknown);
      assert.deepEqual(body, want.body);
    }
  });
  if (expected.some((want) => want.idempotency_key === "same")) {
    assert.equal(keysSent.size, 1, "one Idempotency-Key across the retries");
  }
}

async function sha256Of(stream: ReadableStream<Uint8Array>): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function assertFields(
  actual: unknown,
  expected: Record<string, unknown>,
): Promise<void> {
  assert.ok(typeof actual === "object" && actual !== null);
  const record = actual as Record<string, unknown>;
  for (const [wireName, want] of Object.entries(expected)) {
    if (wireName === "body_sha256") {
      const file = actual as CaptureFile;
      assert.equal(await sha256Of(file.body), want);
      continue;
    }
    const got = record[propertyName(wireName)];
    if (typeof want === "object" && want !== null && !Array.isArray(want)) {
      await assertFields(got, want as Record<string, unknown>);
    } else if (got instanceof Date) {
      assert.equal(got.getTime(), new Date(want as string).getTime());
    } else {
      assert.deepEqual(got, want, wireName);
    }
  }
}

function assertError(
  error: unknown,
  expected: NonNullable<Fixture["expect"]["error"]>,
): void {
  const ErrorClass = ERROR_CLASSES[expected.kind];
  assert.ok(ErrorClass, `known kind ${expected.kind}`);
  assert.ok(error instanceof WebsiteScreenshotWorldError, String(error));
  assert.equal(error.constructor, ErrorClass);
  assert.equal(error.errorCode, expected.error_code);
  assert.equal(error.httpStatus, expected.http_status);
  if (expected.message !== undefined) {
    assert.equal(error.message, expected.message);
  }
  if (expected.retry_after_seconds !== undefined) {
    assert.equal(error.retryAfterSeconds, expected.retry_after_seconds);
  }
}

describe("conformance fixtures", () => {
  let server: ConformanceServer;

  before(async () => {
    server = await startConformanceServer();
  });

  after(async () => {
    await server.close();
  });

  for (const fixture of fixtures) {
    test(fixture.name, async () => {
      await server.load(fixture.responses);
      const client = new WebsiteScreenshotWorld({
        instantSnapApiKey: keys.instant_snap,
        autoScheduleApiKey: keys.auto_schedule,
        instantSnapBaseUrl: server.url,
        autoScheduleBaseUrl: server.url,
      });

      let result: unknown;
      let error: unknown;
      try {
        result = await callFixture(client, fixture.call);
      } catch (thrown) {
        error = thrown;
      }

      assertRequests(await server.requests(), fixture.expect_requests);
      if (fixture.expect.error !== undefined) {
        assertError(error, fixture.expect.error);
      } else {
        assert.equal(error, undefined);
        assert.ok(!Object.hasOwn(result as object, "success"));
        await assertFields(result, fixture.expect.result ?? {});
      }
    });
  }
});
