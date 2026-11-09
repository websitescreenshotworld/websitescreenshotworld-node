import { AuthenticationError } from "./errors.js";
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
    const { apiKey, baseUrl, transport, timeout } = this.#config;
    if (apiKey === undefined) {
      throw new AuthenticationError(
        "No Auto Schedule API key: pass autoScheduleApiKey to the client or set WSW_AUTO_SCHEDULE_API_KEY.",
      );
    }
    const wire = await transport.json({
      method: "POST",
      url: `${baseUrl}/auto-schedule/v1/web-pages/${encodeURIComponent(webPageId)}/trigger-now`,
      apiKey,
      timeout: requestOptions.timeout ?? timeout,
      signal: requestOptions.signal,
    });
    return parseTriggerResult(wire as WireTriggerResult);
  }
}
