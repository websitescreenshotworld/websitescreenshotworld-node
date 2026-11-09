import { createHmac, timingSafeEqual } from "node:crypto";

import {
  SignatureVerificationError,
  WebsiteScreenshotWorldError,
} from "../errors.js";
import type { WebhookEvent } from "./events.js";
import { parseEvent, type WireEnvelope } from "./parse-event.js";

/** Options for {@link Webhook.verify}. */
export interface VerifyOptions {
  /** How far the signature's timestamp may be from now, in seconds. Default 300. */
  tolerance?: number;
  /** The time to check the timestamp against. Defaults to the current time. */
  now?: Date;
}

const DEFAULT_TOLERANCE_SECONDS = 300;
const SIGNATURE_HEX = /^[0-9a-f]{64}$/;

interface SignatureHeader {
  timestamp: number | null;
  signatures: string[];
}

/**
 * Checks a webhook delivery's `X-WSW-Signature` header against its raw body and returns the event.
 *
 * Pass the body exactly as received. A framework that parses the JSON and serialises it again
 * changes the bytes, and the signature no longer matches.
 *
 * @param payload - The raw request body.
 * @param signatureHeader - The `X-WSW-Signature` header.
 * @param secret - The endpoint's signing secret, starting `whsec_`.
 * @throws {@link SignatureVerificationError} when the header is missing or malformed, the timestamp
 * is outside the tolerance, or no signature matches.
 */
function verify(
  payload: string | Uint8Array,
  signatureHeader: string | readonly string[] | null | undefined,
  secret: string,
  options: VerifyOptions = {},
): WebhookEvent {
  const header = parseSignatureHeader(
    typeof signatureHeader === "string"
      ? signatureHeader
      : (signatureHeader ?? []).join(","),
  );
  if (header.timestamp === null) {
    throw new SignatureVerificationError(
      "The signature header has no valid timestamp.",
    );
  }
  if (header.signatures.length === 0) {
    throw new SignatureVerificationError(
      "The signature header has no v1 signature.",
    );
  }

  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE_SECONDS;
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (Math.abs(now - header.timestamp) > tolerance) {
    throw new SignatureVerificationError(
      "The signature's timestamp is outside the tolerance.",
    );
  }

  const body =
    typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
  const expected = Buffer.from(
    createHmac("sha256", Buffer.from(secret, "utf8"))
      .update(`${String(header.timestamp)}.`, "utf8")
      .update(body)
      .digest("hex"),
    "utf8",
  );
  const matches = header.signatures.some((signature) =>
    timingSafeEqual(expected, Buffer.from(signature, "utf8")),
  );
  if (!matches) {
    throw new SignatureVerificationError(
      "No signature in the header matches the body.",
    );
  }

  return parseEvent(parseBody(new TextDecoder().decode(body)));
}

function parseSignatureHeader(value: string): SignatureHeader {
  const header: SignatureHeader = { timestamp: null, signatures: [] };
  let sawTimestamp = false;
  for (const part of value.split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    const content = part.slice(separator + 1).trim();
    if (name === "t" && !sawTimestamp) {
      sawTimestamp = true;
      header.timestamp = /^\d+$/.test(content) ? Number(content) : null;
    } else if (name === "v1") {
      const signature = content.toLowerCase();
      // A value that cannot be a digest is skipped so the comparison always sees equal lengths.
      if (SIGNATURE_HEX.test(signature)) header.signatures.push(signature);
    }
  }
  return header;
}

function parseBody(text: string): WireEnvelope {
  try {
    return JSON.parse(text) as WireEnvelope;
  } catch (cause) {
    throw new WebsiteScreenshotWorldError(
      "The webhook body is signed but is not JSON.",
      { cause },
    );
  }
}

/** Verifies webhook deliveries from both products. */
export const Webhook = { verify } as const;
