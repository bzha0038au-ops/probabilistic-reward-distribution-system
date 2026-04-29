import {
  HOLDEM_REALTIME_LOBBY_EVENT,
  HOLDEM_REALTIME_LOBBY_TOPIC,
  HOLDEM_REALTIME_PRIVATE_TABLE_EVENT,
  HOLDEM_REALTIME_TABLE_EVENT,
  HOLDEM_REALTIME_TABLE_MESSAGE_EVENT,
  HoldemRealtimePrivateUpdateSchema,
  HoldemRealtimeTableMessageSchema,
  HoldemRealtimeUpdateSchema,
  buildHoldemRealtimeTableTopic,
  type HoldemRealtimeTableMessage,
  type HoldemRealtimePrivateUpdate,
  type HoldemRealtimeUpdate,
} from "@reward/shared-types/holdem";
import type { RealtimeJsonValue } from "@reward/shared-types/realtime";

import { publishRealtimeToTopic, publishRealtimeToUser } from "../../realtime";
import { serializeHoldemTable } from "./engine";
import type { HoldemTableState } from "./model";

export type HoldemRealtimePrivateTarget = {
  userId: number;
  update: HoldemRealtimePrivateUpdate;
};

export type HoldemRealtimeFanout = {
  publicUpdate: HoldemRealtimeUpdate;
  privateUpdates: HoldemRealtimePrivateTarget[];
};

const buildHoldemRealtimePrivateUpdate = (params: {
  state: HoldemTableState;
  userId: number;
  update: HoldemRealtimeUpdate;
}): HoldemRealtimePrivateUpdate =>
  HoldemRealtimePrivateUpdateSchema.parse({
    table: JSON.parse(
      JSON.stringify(serializeHoldemTable(params.state, params.userId)),
    ) as unknown,
    handHistoryId: params.update.handHistoryId,
    roundId: params.update.roundId,
    actorSeatIndex: params.update.actorSeatIndex,
    action: params.update.action,
    timedOut: params.update.timedOut,
    eventTypes: params.update.eventTypes,
  });

export const buildHoldemRealtimeFanout = (params: {
  state: HoldemTableState;
  update: HoldemRealtimeUpdate;
}): HoldemRealtimeFanout => {
  const publicUpdate = HoldemRealtimeUpdateSchema.parse(params.update);

  return {
    publicUpdate,
    privateUpdates: params.state.seats.map((seat) => ({
      userId: seat.userId,
      update: buildHoldemRealtimePrivateUpdate({
        state: params.state,
        userId: seat.userId,
        update: publicUpdate,
      }),
    })),
  };
};

export const publishHoldemRealtimeUpdate = (
  payload: HoldemRealtimeFanout | HoldemRealtimeUpdate,
) => {
  const fanout =
    "publicUpdate" in payload
      ? payload
      : {
          publicUpdate: HoldemRealtimeUpdateSchema.parse(payload),
          privateUpdates: [],
        };
  const update = fanout.publicUpdate;
  const publicPayload = JSON.parse(JSON.stringify(update)) as RealtimeJsonValue;

  publishRealtimeToTopic({
    topic: HOLDEM_REALTIME_LOBBY_TOPIC,
    event: HOLDEM_REALTIME_LOBBY_EVENT,
    data: publicPayload,
  });
  publishRealtimeToTopic({
    topic: buildHoldemRealtimeTableTopic(update.table.id),
    event: HOLDEM_REALTIME_TABLE_EVENT,
    data: publicPayload,
  });

  for (const privateUpdate of fanout.privateUpdates) {
    publishRealtimeToUser({
      userId: privateUpdate.userId,
      event: HOLDEM_REALTIME_PRIVATE_TABLE_EVENT,
      data: JSON.parse(
        JSON.stringify(privateUpdate.update),
      ) as RealtimeJsonValue,
    });
  }
};

export const publishHoldemRealtimeTableMessage = (
  message: HoldemRealtimeTableMessage,
) => {
  publishRealtimeToTopic({
    topic: buildHoldemRealtimeTableTopic(message.tableId),
    event: HOLDEM_REALTIME_TABLE_MESSAGE_EVENT,
    data: JSON.parse(
      JSON.stringify(HoldemRealtimeTableMessageSchema.parse(message)),
    ) as RealtimeJsonValue,
  });
};
