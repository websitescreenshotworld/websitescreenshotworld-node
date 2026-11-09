import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, test } from "node:test";

import {
  ERROR_KINDS,
  FALLBACK_CODE_BY_STATUS,
  FALLBACK_CODE_FOR_OTHER_STATUS,
  RETRYABLE_CODES,
} from "../src/error-codes.js";
import { filenameFrom } from "../src/files.js";
import { retryDelay } from "../src/transport.js";
import { VERSION } from "../src/version.js";
import { parseDate, toWire } from "../src/wire.js";
import { readJson, specDir } from "./helpers.js";

describe("parseDate", () => {
  const cases: [string, string][] = [
    ["2026-09-26T10:30:04.512Z", "2026-09-26T10:30:04.512Z"],
    ["2026-09-26T10:30:04Z", "2026-09-26T10:30:04.000Z"],
    ["2026-09-26T10:30:04.5Z", "2026-09-26T10:30:04.500Z"],
    ["2026-09-26T10:30:04.5129876Z", "2026-09-26T10:30:04.512Z"],
    ["2026-09-26T16:00:04.512+05:30", "2026-09-26T10:30:04.512Z"],
    ["2026-09-26T05:30:04-0500", "2026-09-26T10:30:04.000Z"],
    ["2026-09-26t10:30:04.512z", "2026-09-26T10:30:04.512Z"],
  ];
  for (const [input, expected] of cases) {
    test(input, () => {
      assert.equal(parseDate(input).toISOString(), expected);
    });
  }

  test("null stays null", () => {
    assert.equal(parseDate(null), null);
    assert.equal(parseDate(undefined), null);
  });
});

describe("toWire", () => {
  test("re-cases field names but not header or cookie names", () => {
    assert.deepEqual(
      toWire({
        url: "https://example.com",
        blockPopUps: false,
        zoom: 0,
        userAgent: "",
        viewport: { deviceScaleFactor: 2 },
        headers: { "X-Trace": "1", sessionId: "abc" },
        cookies: { themeName: "dark" },
        s3Delivery: { accessKeyId: "a", forcePathStyle: true },
        locale: undefined,
      }),
      {
        url: "https://example.com",
        block_pop_ups: false,
        zoom: 0,
        user_agent: "",
        viewport: { device_scale_factor: 2 },
        headers: { "X-Trace": "1", sessionId: "abc" },
        cookies: { themeName: "dark" },
        s3_delivery: { access_key_id: "a", force_path_style: true },
      },
    );
  });
});

describe("filenameFrom", () => {
  const cases: [string | null, string | null][] = [
    ['attachment; filename="capture.png"', "capture.png"],
    ["attachment; filename=capture.png", "capture.png"],
    ['attachment; filename="a \\"b\\".png"', 'a "b".png'],
    [
      "attachment; filename=\"fallback.png\"; filename*=UTF-8''caf%C3%A9.png",
      "café.png",
    ],
    ["attachment", null],
    [null, null],
  ];
  for (const [header, expected] of cases) {
    test(String(header), () => {
      assert.equal(filenameFrom(header), expected);
    });
  }
});

describe("retryDelay", () => {
  test("uses the API's hint, capped at a minute", () => {
    assert.equal(retryDelay(0, 0), 0);
    assert.equal(retryDelay(3, 1), 3_000);
    assert.equal(retryDelay(600, 0), 60_000);
  });

  test("backs off 0.5 s then 1 s, with up to 25 % jitter", () => {
    for (let run = 0; run < 50; run++) {
      const first = retryDelay(null, 0);
      const second = retryDelay(null, 1);
      assert.ok(first >= 500 && first <= 625, String(first));
      assert.ok(second >= 1_000 && second <= 1_250, String(second));
    }
  });
});

describe("spec agreement", () => {
  const errors = readJson(specDir, "errors.json") as {
    kinds: Record<string, string[]>;
    retryable: string[];
    fallback_by_status: Record<string, string>;
  };

  test("error kinds match errors.json", () => {
    assert.deepEqual(ERROR_KINDS, errors.kinds);
  });

  test("retryable codes match errors.json", () => {
    assert.deepEqual([...RETRYABLE_CODES].sort(), [...errors.retryable].sort());
  });

  test("fallback codes match errors.json", () => {
    const { description, other, ...byStatus } = errors.fallback_by_status;
    assert.ok(description);
    assert.equal(FALLBACK_CODE_FOR_OTHER_STATUS, other);
    assert.deepEqual({ ...FALLBACK_CODE_BY_STATUS }, byStatus);
  });

  test("VERSION matches package.json", () => {
    assert.equal(
      VERSION,
      (readJson("package.json") as { version: string }).version,
    );
  });
});

describe("package entry points", () => {
  const name = "@websitescreenshotworld/sdk";
  type Sdk = typeof import("../src/index.js");

  const check = (sdk: Sdk): void => {
    const error = new sdk.RateLimitError("Too many requests.", {
      errorCode: "rate_limited",
    });
    assert.ok(error instanceof sdk.RateLimitError);
    assert.ok(error instanceof sdk.WebsiteScreenshotWorldError);
    assert.ok(error instanceof Error);
    assert.equal(error.name, "RateLimitError");
    assert.equal(typeof sdk.WebsiteScreenshotWorld, "function");
    assert.equal(typeof sdk.Webhook.verify, "function");
  };

  test("ES module", async () => {
    check((await import(name)) as Sdk);
  });

  test("CommonJS", () => {
    check(createRequire(import.meta.url)(name) as Sdk);
  });
});
