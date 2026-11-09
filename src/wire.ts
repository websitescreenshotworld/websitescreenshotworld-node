/** A JSON object as the API sends or receives it, with snake_case keys. */
export type WireObject = Record<string, unknown>;

/** Maps whose keys are data, not field names, and so are never re-cased. */
const VERBATIM_KEYS = new Set(["headers", "cookies"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function snakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function camelCase(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

function withoutUnset(map: Record<string, unknown>): WireObject {
  return Object.fromEntries(
    Object.entries(map).filter(([, value]) => value !== undefined),
  );
}

/**
 * Turns camelCase options into the API's snake_case body. Options left `undefined` or `null` are not
 * sent; `false`, `0` and `""` are.
 */
export function toWire(options: object): WireObject {
  const body: WireObject = {};
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null) continue;
    if (VERBATIM_KEYS.has(key) && isPlainObject(value)) {
      body[snakeCase(key)] = withoutUnset(value);
    } else if (isPlainObject(value)) {
      body[snakeCase(key)] = toWire(value);
    } else {
      body[snakeCase(key)] = value;
    }
  }
  return body;
}

/** Re-cases the keys of an object the library does not model field by field. */
export function camelCaseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelCaseKeys);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      camelCase(key),
      camelCaseKeys(inner),
    ]),
  );
}

const ISO_DATE_TIME =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:[.,](\d+))?(Z|[+-]\d{2}(?::?\d{2})?)$/i;

/**
 * Parses an ISO 8601 date-time with any number of fraction digits and either `Z` or an offset.
 * Returns `null` for `null` or a missing value.
 */
export function parseDate(value: string): Date;
export function parseDate(value: string | null | undefined): Date | null;
export function parseDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const match = ISO_DATE_TIME.exec(value);
  if (match === null) return new Date(value);
  const [, date = "", time = "", fraction = "", zone = ""] = match;
  const milliseconds = fraction.padEnd(3, "0").slice(0, 3);
  return new Date(
    `${date}T${time}.${milliseconds}${normalizeZone(zone.toUpperCase())}`,
  );
}

function normalizeZone(zone: string): string {
  if (zone === "Z") return zone;
  const digits = zone.slice(1).replace(":", "");
  return `${zone[0] ?? "+"}${digits.slice(0, 2)}:${digits.slice(2, 4).padEnd(2, "0")}`;
}
