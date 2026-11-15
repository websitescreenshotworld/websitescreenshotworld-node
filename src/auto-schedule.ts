import { AuthenticationError } from "./errors.js";
import {
  parseAccount,
  type Account,
  type WireAccount,
} from "./models/account.js";
import {
  parseTriggerResult,
  type TriggerResult,
  type WireTriggerResult,
} from "./models/trigger-result.js";
import type { RequestOptions, Transport } from "./transport.js";

/** What {@link AutoSchedule} needs from the client. */
export interface AutoScheduleConfig {
  transport: Transport;
  apiKey: string | undefined;
  baseUrl: string;
  timeout: number;
}

/** Scheduled captures of the web pages set up in the dashboard. */
export class AutoSchedule {
  readonly #config: AutoScheduleConfig;

  /** @internal Use `client.autoSchedule`. */
  constructor(config: AutoScheduleConfig) {
    this.#config = config;
  }

  /**
   * Starts a web page's capture now. The outcome arrives by webhook. Calling again while that
   * capture is pending starts nothing new and answers `already_pending`.
   *
   * @param webPageId - The web page's id, which webhooks call `scheduleId`.
   */
  async triggerNow(
    webPageId: string,
    requestOptions: RequestOptions = {},
  ): Promise<TriggerResult> {
    const { baseUrl, transport, timeout } = this.#config;
    const apiKey = this.#apiKey();
    const wire = await transport.json({
      method: "POST",
      url: `${baseUrl}/auto-schedule/v1/web-pages/${encodeURIComponent(webPageId)}/trigger-now`,
      apiKey,
      timeout: requestOptions.timeout ?? timeout,
      signal: requestOptions.signal,
    });
    return parseTriggerResult(wire as WireTriggerResult);
  }

  /**
   * Whose key this is: its name and prefix, its product and the member who created it. Costs no
   * capture, so it is also a cheap way to check a key works.
   */
  async account(requestOptions: RequestOptions = {}): Promise<Account> {
    const { baseUrl, transport, timeout } = this.#config;
    const wire = await transport.json({
      method: "GET",
      url: `${baseUrl}/auto-schedule/v1/account`,
      apiKey: this.#apiKey(),
      timeout: requestOptions.timeout ?? timeout,
      signal: requestOptions.signal,
    });
    return parseAccount(wire as WireAccount);
  }

  #apiKey(): string {
    const { apiKey } = this.#config;
    if (apiKey === undefined) {
      throw new AuthenticationError(
        "No Auto Schedule API key: pass autoScheduleApiKey to the client or set WSW_AUTO_SCHEDULE_API_KEY.",
      );
    }
    return apiKey;
  }
}
