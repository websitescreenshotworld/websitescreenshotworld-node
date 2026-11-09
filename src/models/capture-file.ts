import { filenameFrom, writeBody } from "../files.js";
import { parseDate } from "../wire.js";
import type { CaptureStatus } from "./tokens.js";

/**
 * A file returned by `instantSnap.captureFile`, with its metadata. The body is a stream that can be
 * read once: through `body`, `arrayBuffer()` or `saveTo()`.
 */
export interface CaptureFile {
  id: string;
  /** `delivered`: the file is in this answer and the API does not keep it. */
  status: CaptureStatus;
  contentType: string | null;
  /** The name the API suggests, from `Content-Disposition`. */
  filename: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  /** How long the capture took. */
  durationMs: number | null;
  /** The status the website answered with. */
  pageHttpStatus: number | null;
  specVersion: string | null;
  capturedAt: Date | null;
  /** Where the browser ended up. `null` when the page did not redirect or the URL is not plain ASCII. */
  finalUrl: string | null;
  /** Lowercase hex SHA-256 of the file. */
  sha256: string | null;
  /** How many parts the answer has, when it has more than one. */
  partCount: number | null;
  /** The file itself. */
  readonly body: ReadableStream<Uint8Array>;
  /** Reads the whole file into memory. */
  arrayBuffer(): Promise<ArrayBuffer>;
  /** Streams the file to `path`, replacing any file already there. */
  saveTo(path: string): Promise<void>;
}

export function captureFileFrom(response: Response): CaptureFile {
  const headers = response.headers;
  const header = (name: string): string | null =>
    headers.get(`x-instantsnap-${name}`);
  const body = response.body ?? new Blob([]).stream();
  return {
    id: header("id") ?? "",
    status: header("status") ?? "delivered",
    contentType: headers.get("content-type"),
    filename: filenameFrom(headers.get("content-disposition")),
    width: integerOrNull(header("width")),
    height: integerOrNull(header("height")),
    sizeBytes: integerOrNull(header("size-bytes")),
    durationMs: integerOrNull(header("duration-ms")),
    pageHttpStatus: integerOrNull(header("page-http-status")),
    specVersion: header("spec-version"),
    capturedAt: parseDate(header("captured-at")),
    finalUrl: header("final-url"),
    sha256: header("sha256"),
    partCount: integerOrNull(header("part-count")),
    body,
    arrayBuffer: () => new Response(body).arrayBuffer(),
    saveTo: (path) => writeBody(body, path),
  };
}

function integerOrNull(value: string | null): number | null {
  if (value === null || !/^\s*-?\d+\s*$/.test(value)) return null;
  return Number(value);
}
