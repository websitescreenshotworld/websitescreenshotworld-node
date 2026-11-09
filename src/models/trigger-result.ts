import { parseDate } from "../wire.js";
import type { TriggerStatus, TriggeredBy } from "./tokens.js";

/** What `autoSchedule.triggerNow` did. The capture's outcome arrives later by webhook. */
export interface TriggerResult {
  /** `triggered`, or `already_pending` when a capture was already queued or running. */
  status: TriggerStatus;
  webPageId: string;
  triggeredBy: TriggeredBy;
  /** When the capture was queued; for `already_pending`, when the earlier trigger was. */
  triggeredAt: Date;
  /** One sentence for a person. */
  message: string;
}

export interface WireTriggerResult {
  status: string;
  web_page_id: string;
  triggered_by: string;
  triggered_at: string;
  message: string;
}

export function parseTriggerResult(wire: WireTriggerResult): TriggerResult {
  return {
    status: wire.status,
    webPageId: wire.web_page_id,
    triggeredBy: wire.triggered_by,
    triggeredAt: parseDate(wire.triggered_at),
    message: wire.message,
  };
}
