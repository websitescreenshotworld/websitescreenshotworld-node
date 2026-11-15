import type { Product } from "./tokens.js";

/** Whose API key this is: what `account()` answers. It never includes the key itself. */
export interface Account {
  /** The name given to the key in the dashboard (Developer Tools, API Keys), or null if it has none. */
  keyName: string | null;
  /** The key's public prefix, as the dashboard shows it. Not enough to use the key. */
  keyPrefix: string;
  /** The API the key belongs to: `instant_snap` or `auto_schedule`. */
  product: Product;
  /** The email of the member who created the key, or null when they are no longer a member. */
  email: string | null;
}

export interface WireAccount {
  key_name?: string | null;
  key_prefix: string;
  product: string;
  email?: string | null;
}

export function parseAccount(wire: WireAccount): Account {
  return {
    keyName: wire.key_name ?? null,
    keyPrefix: wire.key_prefix,
    product: wire.product,
    email: wire.email ?? null,
  };
}
