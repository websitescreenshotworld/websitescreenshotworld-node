import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { after, before, beforeEach, describe, test } from "node:test";

import {
  AuthenticationError,
  CaptureStatus,
  ConnectionError,
  NotFoundError,
  RateLimitError,
  VERSION,
  WebsiteScreenshotWorld,
  type ClientOptions,
} from "../src/index.js";
import {
  keys,
  readJson,
  specDir,
  startConformanceServer,
  type ConformanceServer,
} from "./helpers.js";

const captureBody = (
  readJson(specDir, "fixtures", "06-get-capture.json") as {
    responses: { body: Record<string, unknown> }[];
  }
).responses[0]?.body;

const [queuedBody, runningBody, succeededBody] = (
  readJson(specDir, "fixtures", "25-wait.json") as {
    responses: { body: Record<string, unknown> }[];
  }
).responses.map((response) => response.body);

const fileBytes = Buffer.from("not really a png, but bytes all the same");

describe("client", () => {
  let server: ConformanceServer;
  let directory: string;

  const client = (options: ClientOptions = {}): WebsiteScreenshotWorld =>
    new WebsiteScreenshotWorld({
      instantSnapApiKey: keys.instant_snap,
      autoScheduleApiKey: keys.auto_schedule,
      instantSnapBaseUrl: server.url,
      autoScheduleBaseUrl: server.url,
      ...options,
    });

  const fileResponse = {
    status: 200,
    headers: { "Content-Type": "image/png" },
    body_base64: fileBytes.toString("base64"),
  };

  before(async () => {
    server = await startConformanceServer();
    directory = await mkdtemp(path.join(tmpdir(), "wsw-node-"));
  });

  after(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await server.load([]);
  });

  describe("API keys", () => {
    const withoutEnvironment = (): (() => void) => {
      const saved = {
        instantSnap: process.env.WSW_INSTANT_SNAP_API_KEY,
        autoSchedule: process.env.WSW_AUTO_SCHEDULE_API_KEY,
      };
      delete process.env.WSW_INSTANT_SNAP_API_KEY;
      delete process.env.WSW_AUTO_SCHEDULE_API_KEY;
      return () => {
        if (saved.instantSnap !== undefined) {
          process.env.WSW_INSTANT_SNAP_API_KEY = saved.instantSnap;
        }
        if (saved.autoSchedule !== undefined) {
          process.env.WSW_AUTO_SCHEDULE_API_KEY = saved.autoSchedule;
        }
      };
    };

    test("a missing key fails before anything is sent", async (t) => {
      t.after(withoutEnvironment());
      const bare = new WebsiteScreenshotWorld({
        instantSnapBaseUrl: server.url,
        autoScheduleBaseUrl: server.url,
      });
      await assert.rejects(
        bare.instantSnap.capture({ url: "https://example.com" }),
        (error: unknown) =>
          error instanceof AuthenticationError &&
          error.message.includes("WSW_INSTANT_SNAP_API_KEY"),
      );
      await assert.rejects(
        bare.autoSchedule.triggerNow("7d4e2b1a-6c5f-4a3e-9d8c-2b1a0f9e8d7c"),
        (error: unknown) =>
          error instanceof AuthenticationError &&
          error.message.includes("WSW_AUTO_SCHEDULE_API_KEY"),
      );
      assert.deepEqual(await server.requests(), []);
    });

    test("keys default to the environment", async (t) => {
      t.after(withoutEnvironment());
      process.env.WSW_AUTO_SCHEDULE_API_KEY = "from-environment";
      await server.load([{ status: 404, body: { error_code: "not_found" } }]);
      const fromEnvironment = new WebsiteScreenshotWorld({
        autoScheduleBaseUrl: server.url,
      });
      await assert.rejects(fromEnvironment.autoSchedule.triggerNow("x"));
      const [request] = await server.requests();
      assert.equal(request?.headers["x-api-key"], "from-environment");
    });

    test("defaults needs no key and sends none", async (t) => {
      t.after(withoutEnvironment());
      await server.load([{ status: 200, body: { success: true } }]);
      const bare = new WebsiteScreenshotWorld({
        instantSnapBaseUrl: server.url,
      });
      assert.deepEqual(await bare.instantSnap.defaults(), {});
      const [request] = await server.requests();
      assert.equal(request?.headers["x-api-key"], undefined);
    });
  });

  test("sends the User-Agent and Accept headers", async () => {
    await server.load([{ status: 200, body: captureBody }]);
    await client().instantSnap.get("3f6c2a1e-9b8d-4c7e-a5f4-1d2e3c4b5a69");
    const [request] = await server.requests();
    assert.equal(
      request?.headers["user-agent"],
      `websitescreenshotworld-node/${VERSION} (node ${process.versions.node})`,
    );
    assert.match(
      request.headers["user-agent"] ?? "",
      /^websitescreenshotworld-node\/\d+\.\d+\.\d+ \(node \d+\.\d+\.\d+\)$/,
    );
    assert.equal(request.headers.accept, "application/json");
    assert.equal(request.headers["content-type"], undefined);
  });

  test("returns dates as Date objects", async () => {
    await server.load([{ status: 200, body: captureBody }]);
    const capture = await client().instantSnap.get("id");
    assert.ok(capture.capturedAt instanceof Date);
    assert.equal(capture.capturedAt.toISOString(), "2026-09-26T10:30:04.512Z");
  });

  test("ignores fields it does not know", async () => {
    await server.load([
      { status: 200, body: { ...captureBody, added_later: { x: 1 } } },
    ]);
    const capture = await client().instantSnap.get("id");
    assert.ok(!("addedLater" in capture) && !("added_later" in capture));
  });

  describe("download", () => {
    const capture = (): { downloadUrl: string } => ({
      downloadUrl: `${server.url}/media/capture.png`,
    });

    test("writes to a path", async () => {
      await server.load([fileResponse]);
      const target = path.join(directory, "capture.png");
      await client().instantSnap.download(capture(), target);
      assert.deepEqual(await readFile(target), fileBytes);
      const [request] = await server.requests();
      assert.equal(request?.method, "GET");
      assert.equal(request.path, "/media/capture.png");
      assert.equal(request.headers["x-api-key"], undefined);
      assert.notEqual(request.headers.accept, "application/json");
    });

    test("writes to a Node.js stream", async () => {
      await server.load([fileResponse]);
      const chunks: Buffer[] = [];
      const sink = new Writable({
        write(chunk: Buffer, _encoding, done) {
          chunks.push(chunk);
          done();
        },
      });
      await client().instantSnap.download(capture(), sink);
      assert.deepEqual(Buffer.concat(chunks), fileBytes);
    });

    test("writes to a web WritableStream", async () => {
      await server.load([fileResponse]);
      const chunks: Uint8Array[] = [];
      const sink = new WritableStream<Uint8Array>({
        write(chunk) {
          chunks.push(chunk);
        },
      });
      await client().instantSnap.download(capture(), sink);
      assert.deepEqual(Buffer.concat(chunks), fileBytes);
    });

    test("refuses a capture without a download URL", async () => {
      await assert.rejects(
        client().instantSnap.download({ downloadUrl: null }, directory),
        TypeError,
      );
      assert.deepEqual(await server.requests(), []);
    });

    test("raises the API's error for a link that has expired", async () => {
      await server.load([{ status: 404, body_text: "Not Found" }]);
      await assert.rejects(
        client().instantSnap.download(capture(), path.join(directory, "gone")),
        { name: "NotFoundError", errorCode: "not_found" },
      );
    });
  });

  test("captureFile saves the stream to a path", async () => {
    await server.load([
      {
        ...fileResponse,
        headers: {
          ...fileResponse.headers,
          "Content-Disposition": "attachment; filename*=UTF-8''caf%C3%A9.png",
          "X-InstantSnap-Id": "3f6c2a1e-9b8d-4c7e-a5f4-1d2e3c4b5a69",
          "X-InstantSnap-Captured-At": "2026-09-26T10:30:04.512Z",
          "X-InstantSnap-Part-Count": "2",
        },
      },
    ]);
    const file = await client().instantSnap.captureFile({
      url: "https://example.com",
    });
    assert.equal(file.filename, "café.png");
    assert.equal(file.partCount, 2);
    assert.equal(file.width, null);
    assert.equal(file.capturedAt?.toISOString(), "2026-09-26T10:30:04.512Z");
    const target = path.join(directory, "saved.png");
    await file.saveTo(target);
    assert.deepEqual(await readFile(target), fileBytes);
    const [request] = await server.requests();
    assert.notEqual(request?.headers.accept, "application/json");
  });

  describe("timeouts and cancellation", () => {
    const hangingFetch =
      (calls: { count: number }): typeof fetch =>
      (_input, init) => {
        calls.count += 1;
        return new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason as Error);
          });
        });
      };

    test("a timeout ends the call without retrying", async () => {
      const calls = { count: 0 };
      await assert.rejects(
        client({ fetch: hangingFetch(calls) }).instantSnap.get("id", {
          timeout: 50,
        }),
        (error: unknown) =>
          error instanceof ConnectionError && error.message.includes("within"),
      );
      assert.equal(calls.count, 1);
    });

    test("aborting rejects with the signal's reason", async () => {
      const calls = { count: 0 };
      const controller = new AbortController();
      const reason = new Error("stopped by the caller");
      const pending = client({
        fetch: hangingFetch(calls),
      }).instantSnap.capture(
        { url: "https://example.com" },
        { signal: controller.signal },
      );
      controller.abort(reason);
      await assert.rejects(pending, (error) => error === reason);
      assert.equal(calls.count, 1);
    });

    test("submit takes the ordinary timeout, not captureTimeout", async () => {
      const calls = { count: 0 };
      const started = Date.now();
      await assert.rejects(
        client({
          fetch: hangingFetch(calls),
          timeout: 50,
          captureTimeout: 60_000,
        }).instantSnap.submit({ url: "https://example.com" }),
        (error: unknown) =>
          error instanceof ConnectionError && error.message.includes("0.05"),
      );
      assert.ok(Date.now() - started < 5_000);
      assert.equal(calls.count, 1);
    });

    test("an already aborted signal sends nothing", async () => {
      await assert.rejects(
        client().instantSnap.get("id", { signal: AbortSignal.abort() }),
        { name: "AbortError" },
      );
      assert.deepEqual(await server.requests(), []);
    });

    test("an abort during the wait between retries stops at once", async () => {
      await server.load([
        {
          status: 503,
          body: { error_code: "capture_busy", retry_after_seconds: 30 },
        },
      ]);
      const controller = new AbortController();
      const started = Date.now();
      setTimeout(() => {
        controller.abort();
      }, 50);
      await assert.rejects(
        client().instantSnap.capture(
          { url: "https://example.com" },
          { signal: controller.signal },
        ),
        { name: "AbortError" },
      );
      assert.ok(Date.now() - started < 5_000);
      assert.equal((await server.requests()).length, 1);
    });
  });

  test("a retry that could not finish in time is not attempted", async () => {
    await server.load([
      {
        status: 503,
        body: { error_code: "capture_busy", retry_after_seconds: 30 },
      },
    ]);
    await assert.rejects(
      client().instantSnap.capture(
        { url: "https://example.com" },
        { timeout: 5_000 },
      ),
      {
        name: "ServiceError",
        errorCode: "capture_busy",
        retryAfterSeconds: 30,
      },
    );
    assert.equal((await server.requests()).length, 1);
  });

  describe("connection failures", () => {
    const failingFetch =
      (calls: { count: number }, failures: number): typeof fetch =>
      (input, init) => {
        calls.count += 1;
        if (calls.count <= failures) {
          return Promise.reject(new TypeError("fetch failed"));
        }
        return fetch(input, init);
      };

    test("are retried", async () => {
      await server.load([{ status: 200, body: captureBody }]);
      const calls = { count: 0 };
      const capture = await client({
        fetch: failingFetch(calls, 2),
      }).instantSnap.get("id");
      assert.equal(capture.id, "3f6c2a1e-9b8d-4c7e-a5f4-1d2e3c4b5a69");
      assert.equal(calls.count, 3);
    });

    test("raise ConnectionError once the retries run out", async () => {
      const calls = { count: 0 };
      await assert.rejects(
        client({
          fetch: failingFetch(calls, 3),
          maxRetries: 1,
        }).instantSnap.get("id"),
        (error: unknown) =>
          error instanceof ConnectionError &&
          error.cause instanceof TypeError &&
          error.httpStatus === null,
      );
      assert.equal(calls.count, 2);
    });
  });

  test("a redirect is not followed, so the key goes nowhere else", async () => {
    await server.load([
      {
        status: 302,
        headers: { Location: `${server.url}/elsewhere` },
        body_text: "",
      },
    ]);
    await assert.rejects(client().instantSnap.get("id"), {
      errorCode: "unknown_error",
      httpStatus: 302,
    });
    assert.equal((await server.requests()).length, 1);
  });

  test("a refusal from an unknown status keeps the raw body", async () => {
    await server.load([{ status: 418, body_text: "short and stout" }]);
    await assert.rejects(client().instantSnap.get("id"), {
      name: "WebsiteScreenshotWorldError",
      errorCode: "unknown_error",
      httpStatus: 418,
      rawBody: "short and stout",
    });
  });

  describe("async captures", () => {
    const id = "3f6c2a1e-9b8d-4c7e-a5f4-1d2e3c4b5a69";
    const ok = (body: unknown): { status: number; body: unknown } => ({
      status: 200,
      body,
    });

    test("submit sends async and accepts the 202", async () => {
      await server.load([{ status: 202, body: queuedBody }]);
      const capture = await client().instantSnap.submit({
        url: "https://example.com",
        timeout: 60,
      });
      assert.equal(capture.status, CaptureStatus.Queued);
      const [request] = await server.requests();
      assert.deepEqual(JSON.parse(request?.body ?? "null"), {
        url: "https://example.com",
        timeout: 60,
        response_type: "json",
        async: true,
      });
    });

    test("queue_full is raised at once, not retried", async () => {
      await server.load([
        {
          status: 429,
          body: { error_code: "queue_full", retry_after_seconds: 1 },
        },
        { status: 202, body: queuedBody },
      ]);
      await assert.rejects(
        client().instantSnap.submit({ url: "https://example.com" }),
        (error: unknown) =>
          error instanceof RateLimitError &&
          error.errorCode === "queue_full" &&
          error.retryAfterSeconds === 1,
      );
      assert.equal((await server.requests()).length, 1);
    });

    test("wait takes the capture itself and stops once it is finished", async () => {
      await server.load([ok(runningBody), ok(succeededBody), ok(queuedBody)]);
      const capture = await client().instantSnap.wait(
        { id },
        { pollIntervalSeconds: 0 },
      );
      assert.equal(capture.status, CaptureStatus.Succeeded);
      const requests = await server.requests();
      assert.equal(requests.length, 2);
      assert.equal(requests[0]?.path, `/instant-snap/v1/captures/${id}`);
    });

    test("wait returns the last capture read when time runs out", async () => {
      await server.load(Array.from({ length: 20 }, () => ok(queuedBody)));
      const capture = await client().instantSnap.wait(id, {
        timeoutSeconds: 0.2,
        pollIntervalSeconds: 0.05,
      });
      assert.equal(capture.status, CaptureStatus.Queued);
      const count = (await server.requests()).length;
      assert.ok(count >= 2 && count < 20, `${String(count)} reads`);
    });

    test("wait with no time reads once", async () => {
      await server.load([ok(queuedBody), ok(succeededBody)]);
      const capture = await client().instantSnap.wait(id, {
        timeoutSeconds: 0,
      });
      assert.equal(capture.status, CaptureStatus.Queued);
      assert.equal((await server.requests()).length, 1);
    });

    test("wait throws an error from get as it is", async () => {
      await server.load([
        ok(queuedBody),
        { status: 404, body: { error_code: "capture_not_found" } },
      ]);
      await assert.rejects(
        client().instantSnap.wait(id, { pollIntervalSeconds: 0 }),
        (error: unknown) =>
          error instanceof NotFoundError &&
          error.errorCode === "capture_not_found",
      );
    });

    test("aborting stops wait between reads at once", async () => {
      await server.load([ok(queuedBody), ok(succeededBody)]);
      const controller = new AbortController();
      const reason = new Error("stopped by the caller");
      const started = Date.now();
      setTimeout(() => {
        controller.abort(reason);
      }, 50);
      await assert.rejects(
        client().instantSnap.wait(id, {
          pollIntervalSeconds: 30,
          signal: controller.signal,
        }),
        (error) => error === reason,
      );
      assert.ok(Date.now() - started < 5_000);
      assert.equal((await server.requests()).length, 1);
    });
  });
});
