import { z } from "zod";

const DateLikeSchema = z.union([z.string(), z.date()]);

export const dealerEventKindValues = [
  "action",
  "message",
  "pace_hint",
] as const;
export const dealerEventSourceValues = ["rule", "llm"] as const;
export const dealerPaceValues = ["normal", "expedite", "pause"] as const;

export const DEALER_EVENT_FEED_LIMIT = 12;
export const DEALER_REALTIME_ACTION_EVENT = "dealer.action";
export const DEALER_REALTIME_MESSAGE_EVENT = "dealer.message";
export const DEALER_REALTIME_PACE_HINT_EVENT = "dealer.pace_hint";

export const DealerEventKindSchema = z.enum(dealerEventKindValues);
export type DealerEventKind = z.infer<typeof DealerEventKindSchema>;

export const DealerEventSourceSchema = z.enum(dealerEventSourceValues);
export type DealerEventSource = z.infer<typeof DealerEventSourceSchema>;

export const DealerPaceSchema = z.enum(dealerPaceValues);
export type DealerPace = z.infer<typeof DealerPaceSchema>;

export const DealerEventSchema = z.object({
  id: z.string().trim().min(1).max(128),
  kind: DealerEventKindSchema,
  source: DealerEventSourceSchema,
  gameType: z.string().trim().min(1).max(64),
  tableId: z.number().int().positive().nullable().default(null),
  tableRef: z.string().trim().min(1).max(128),
  roundId: z.string().trim().min(1).max(128).nullable().default(null),
  referenceId: z.number().int().positive().nullable().default(null),
  phase: z.string().trim().min(1).max(64).nullable().default(null),
  seatIndex: z.number().int().nonnegative().nullable().default(null),
  actionCode: z.string().trim().min(1).max(64).nullable().default(null),
  pace: DealerPaceSchema.nullable().default(null),
  text: z.string().trim().min(1).max(280).nullable().default(null),
  metadata: z.record(z.unknown()).nullable().default(null),
  createdAt: DateLikeSchema,
});
export type DealerEvent = z.infer<typeof DealerEventSchema>;

export const DealerFeedSchema = z.array(DealerEventSchema).max(
  DEALER_EVENT_FEED_LIMIT,
);
export type DealerFeed = z.infer<typeof DealerFeedSchema>;

export const resolveDealerRealtimeEventName = (
  kind: DealerEventKind,
): string => {
  switch (kind) {
    case "action":
      return DEALER_REALTIME_ACTION_EVENT;
    case "message":
      return DEALER_REALTIME_MESSAGE_EVENT;
    case "pace_hint":
      return DEALER_REALTIME_PACE_HINT_EVENT;
  }
};
