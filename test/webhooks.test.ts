import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import {
  SignatureVerificationError,
  Webhook,
  type WebhookEvent,
} from "../src/index.js";
import { jsonFilesIn, propertyName, readJson, specDir } from "./helpers.js";

interface Vectors {
  secret: string;
  cases: {
    name: string;
    header: string;
    body: string;
    now: number;
    tolerance?: number;
    valid: boolean;
  }[];
}

const vectors = readJson(specDir, "webhook-vectors.json") as Vectors;
const eventsDir = path.join(specDir, "events");
const now = new Date("2026-09-26T10:30:10.000Z");

function sign(body: string, date: Date): string {
  const timestamp = String(Math.floor(date.getTime() / 1000));
  const digest = createHmac("sha256", vectors.secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

/** Checks that every wire field of `data` came through under its camelCase name. */
function assertMapped(actual: unknown, wire: unknown, where: string): void {
  if (wire === null) {
    assert.equal(actual, null, where);
  } else if (Array.isArray(wire)) {
    assert.ok(Array.isArray(actual), where);
    wire.forEach((item, index) => {
      assertMapped(actual[index], item, `${where}[${String(index)}]`);
    });
  } else if (typeof wire === "object") {
    assert.ok(typeof actual === "object" && actual !== null, where);
    for (const [key, value] of Object.entries(wire)) {
      const record = actual as Record<string, unknown>;
      assertMapped(record[propertyName(key)], value, `${where}.${key}`);
    }
  } else if (actual instanceof Date) {
    assert.equal(actual.getTime(), Date.parse(wire as string), where);
  } else {
    assert.equal(actual, wire, where);
  }
}

describe("webhook signature vectors", () => {
  for (const vector of vectors.cases) {
    test(vector.name, () => {
      const verify = (): WebhookEvent =>
        Webhook.verify(vector.body, vector.header, vectors.secret, {
          now: new Date(vector.now * 1000),
          ...(vector.tolerance === undefined
            ? {}
            : { tolerance: vector.tolerance }),
        });
      if (vector.valid) {
        assert.equal(verify().type, "ping");
      } else {
        assert.throws(verify, SignatureVerificationError);
      }
    });
  }

  test("accepts the body as a Buffer", () => {
    const [vector] = vectors.cases.filter(({ name }) => name === "valid");
    assert.ok(vector);
    const event = Webhook.verify(
      Buffer.from(vector.body, "utf8"),
      vector.header,
      vectors.secret,
      { now: new Date(vector.now * 1000) },
    );
    assert.equal(event.id, "8c1f0a2e-4b6d-4f3a-9e21-5d7c9b0a1f11");
  });

  test("refuses a missing header", () => {
    assert.throws(
      () => Webhook.verify("{}", undefined, vectors.secret),
      SignatureVerificationError,
    );
  });
});

describe("webhook events", () => {
  for (const name of jsonFilesIn(eventsDir)) {
    test(name, () => {
      const body = readFileSync(path.join(eventsDir, name), "utf8");
      const wire = JSON.parse(body) as {
        id: string;
        type: string;
        product: string;
        created_at: string;
        data: Record<string, unknown>;
      };
      const event = Webhook.verify(body, sign(body, now), vectors.secret, {
        now,
      });

      assert.equal(event.id, wire.id);
      assert.equal(event.type, wire.type);
      assert.equal(event.product, wire.product);
      assert.equal(event.createdAt.getTime(), Date.parse(wire.created_at));
      if (name === "unknown.json") {
        assert.ok("rawData" in event);
        assert.deepEqual(event.rawData, wire.data);
      } else {
        assert.ok(!("rawData" in event));
        assertMapped(event.data, wire.data, "data");
      }
    });
  }

  test("types a capture by its product", () => {
    const body = readFileSync(
      path.join(eventsDir, "instant-snap.capture.succeeded.json"),
      "utf8",
    );
    const event = Webhook.verify(body, sign(body, now), vectors.secret, {
      now,
    });
    assert.ok(event.type === "capture.succeeded");
    assert.ok(event.product === "instant_snap");
    assert.equal(event.data.specVersion, "v1");
    assert.ok(!("downloadUrl" in event.data));
  });

  test("keeps a known capture type from an unknown product as unknown", () => {
    const body = JSON.stringify({
      id: "1",
      type: "capture.succeeded",
      created_at: "2026-09-26T10:30:05.000Z",
      product: "future_product",
      data: { anything: 1 },
    });
    const event = Webhook.verify(body, sign(body, now), vectors.secret, {
      now,
    });
    assert.ok("rawData" in event);
    assert.deepEqual(event.rawData, { anything: 1 });
  });
});
