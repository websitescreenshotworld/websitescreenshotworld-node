import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Where a file is written: a path, a Node.js writable stream or a web `WritableStream`. */
export type FileDestination =
  string | NodeJS.WritableStream | WritableStream<Uint8Array>;

/** Streams `body` to `destination`. A file left half-written by a failure is removed. */
export async function writeBody(
  body: ReadableStream<Uint8Array>,
  destination: FileDestination,
  signal?: AbortSignal,
): Promise<void> {
  const options = signal === undefined ? {} : { signal };
  if (destination instanceof WritableStream) {
    await body.pipeTo(destination, options);
    return;
  }
  const source = Readable.fromWeb(body);
  if (typeof destination !== "string") {
    await pipeline(source, destination, options);
    return;
  }
  try {
    await pipeline(source, createWriteStream(destination), options);
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
}

/** The file name from a `Content-Disposition` header, preferring the RFC 6266 `filename*` form. */
export function filenameFrom(contentDisposition: string | null): string | null {
  if (contentDisposition === null) return null;
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(
    contentDisposition,
  );
  if (extended?.[2] !== undefined) {
    try {
      return decodeURIComponent(extended[2].trim());
    } catch {
      // A malformed percent-encoding: the plain form below may still hold a usable name.
    }
  }
  const plain = /filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]+))/i.exec(
    contentDisposition,
  );
  const name = plain?.[1]?.replace(/\\(.)/g, "$1") ?? plain?.[2]?.trim();
  return name === undefined || name === "" ? null : name;
}
