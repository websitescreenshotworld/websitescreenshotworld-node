import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

// npm runs the tests from the repository root. spec/ is the websitescreenshotworld-spec submodule, which holds
// the shared cases and the conformance server.
export const repoRoot = path.resolve(".");
export const specDir = path.join(repoRoot, "spec");

export function readJson(...segments: string[]): unknown {
  return JSON.parse(readFileSync(path.join(...segments), "utf8"));
}

export function jsonFilesIn(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

export const keys = readJson(specDir, "fixtures", "keys.json") as {
  instant_snap: string;
  auto_schedule: string;
};

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface FixtureResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  body_text?: string;
  body_base64?: string;
}

/** The shared playback server in spec/conformance/server.js. */
export interface ConformanceServer {
  url: string;
  load(responses: FixtureResponse[]): Promise<void>;
  requests(): Promise<RecordedRequest[]>;
  close(): Promise<void>;
}

export async function startConformanceServer(): Promise<ConformanceServer> {
  const child = spawn(
    process.execPath,
    [path.join(specDir, "conformance", "server.js")],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const lines = createInterface({ input: child.stdout });
  const firstLine = await new Promise<string>((resolve, reject) => {
    lines.once("line", resolve);
    child.once("error", reject);
    child.once("exit", (code) => {
      reject(new Error(`The conformance server exited with ${String(code)}.`));
    });
  });
  lines.close();
  const url = /listening on (\S+)/.exec(firstLine)?.[1];
  if (url === undefined) {
    child.kill();
    throw new Error(`Unexpected first line: ${firstLine}`);
  }

  return {
    url,
    async load(responses) {
      const answer = await fetch(`${url}/__load`, {
        method: "POST",
        body: JSON.stringify({ responses }),
      });
      await answer.text();
    },
    async requests() {
      const answer = await fetch(`${url}/__requests`);
      return (await answer.json()) as RecordedRequest[];
    },
    close() {
      return new Promise((resolve) => {
        child.once("exit", () => {
          resolve();
        });
        child.kill("SIGTERM");
      });
    },
  };
}

/** The name a wire field has on the objects the library returns. */
export function propertyName(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

/** Reads wire-form options (snake_case) into the library's camelCase options. */
export function optionsFromWire(value: unknown, verbatim = false): unknown {
  if (Array.isArray(value)) return value.map((item) => optionsFromWire(item));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      verbatim ? key : propertyName(key),
      optionsFromWire(inner, key === "headers" || key === "cookies"),
    ]),
  );
}
