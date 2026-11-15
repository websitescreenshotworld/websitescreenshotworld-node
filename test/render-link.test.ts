import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { RenderLink, type RenderLinkOptions } from "../src/index.js";
import { optionsFromWire, readJson, specDir } from "./helpers.js";

interface Vectors {
  cases: {
    name: string;
    render_secret: string;
    key_prefix: string;
    format?: string;
    base_url?: string;
    options: Record<string, unknown>;
    canonical: string;
    signature: string;
    url: string;
  }[];
}

const vectors = readJson(specDir, "render-link-vectors.json") as Vectors;

describe("render link vectors", () => {
  for (const vector of vectors.cases) {
    test(vector.name, () => {
      const options = {
        ...(optionsFromWire(vector.options) as object),
        renderSecret: vector.render_secret,
        keyPrefix: vector.key_prefix,
        ...(vector.format ? { format: vector.format } : {}),
        ...(vector.base_url ? { baseUrl: vector.base_url } : {}),
      } as RenderLinkOptions;

      assert.equal(RenderLink.build(options), vector.url);
    });
  }
});

describe("RenderLink.build", () => {
  const valid: RenderLinkOptions = {
    renderSecret: "wsw_rsk_x",
    keyPrefix: "0123456789ab",
    url: "https://example.com",
  };

  test("refuses what cannot be a link, before signing anything", () => {
    assert.throws(
      () => RenderLink.build({ ...valid, renderSecret: "" }),
      TypeError,
    );
    assert.throws(
      () => RenderLink.build({ ...valid, keyPrefix: "0123456789AB" }),
      TypeError,
    );
    assert.throws(
      () => RenderLink.build({ ...valid, keyPrefix: "wsw_api_0123" }),
      TypeError,
    );
    assert.throws(() => RenderLink.build({ ...valid, url: "" }), TypeError);
    assert.throws(
      () => RenderLink.build({ ...valid, format: "pdf" as never }),
      TypeError,
    );
    assert.match(RenderLink.build(valid), /&sig=[0-9a-f]{64}$/);
  });

  test("leaves out an option that is not set", () => {
    const link = RenderLink.build({
      ...valid,
      width: undefined,
      blockAds: false,
    });
    assert.ok(link.includes("block_ads=false"));
    assert.ok(!link.includes("width="));
  });
});
