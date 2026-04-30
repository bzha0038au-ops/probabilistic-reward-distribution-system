import Decimal from "decimal.js";
import type { AssetCode } from "@reward/shared-types/economy";
import {
  HOLDEM_CONFIG,
  HOLDEM_DEFAULT_CASUAL_MAX_SEATS,
  HOLDEM_MAX_BOT_PLAYERS,
  type HoldemCreateTableRequest,
  type HoldemTableType,
  type HoldemTournamentCreateConfig,
  type HoldemTournamentStanding,
} from "@reward/shared-types/holdem";

import {
  badRequestError,
  conflictError,
  internalInvariantError,
} from "../../shared/errors";
import { toDecimal, toMoneyString } from "../../shared/money";
import { HOLDEM_ROUND_TYPE, buildRoundId } from "../hand-history/round-id";
import {
  isBotSeat,
  resolveSeatDisplayName,
  type HoldemTableState,
} from "./model";

export type LockedWalletRow = {
  userId: number;
  withdrawableBalance: string | number;
  bonusBalance: string | number;
  lockedBalance: string | number;
};

export const HOLDEM_REFERENCE_TYPE = "holdem_table";
export const HOLDEM_CASUAL_ASSET_CODE: AssetCode = "B_LUCK";
const DEFAULT_HOLDEM_TOURNAMENT_STARTING_STACK_AMOUNT = "1000.00";

export type HoldemTableFundingSource = "withdrawable" | "bonus";

export type HoldemTournamentMetadata = NonNullable<
  HoldemTableState["metadata"]["tournament"]
>;
export type HoldemSeatTournamentMetadata = NonNullable<
  HoldemTableState["seats"][number]["metadata"]["tournament"]
>;

export type HoldemEventActor = "player" | "dealer" | "system";

export type HoldemHandEventInput = {
  type: string;
  actor: HoldemEventActor;
  userId?: number | null;
  payload?: Record<string, unknown> | null;
};

export type HoldemTableEventInput = {
  eventType: string;
  actor: HoldemEventActor;
  userId?: number | null;
  seatIndex?: number | null;
  handHistoryId?: number | null;
  phase?: string | null;
  payload?: Record<string, unknown> | null;
};

export type PersistedHoldemTableEvent = {
  eventType: string;
  actor: HoldemEventActor;
  userId: number | null;
  seatIndex: number | null;
  handHistoryId: number | null;
  phase: string | null;
  payload: Record<string, unknown>;
  eventIndex: number;
  createdAt: Date;
};

export const parseAmount = (value: string, label: string) => {
  let amount;
  try {
    amount = toDecimal(value);
  } catch {
    throw badRequestError(`Invalid ${label} amount.`);
  }

  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) {
    throw badRequestError(`Invalid ${label} amount.`);
  }
  return amount;
};

export const isTournamentTable = (state: Pick<HoldemTableState, "metadata">) =>
  state.metadata.tableType === "tournament";

export const isCashTableType = (tableType: HoldemTableType) => tableType === "cash";

export const isCasualTableType = (tableType: HoldemTableType) =>
  tableType === "casual";

export const ensureTournamentMetadata = (
  state: Pick<HoldemTableState, "metadata">,
): HoldemTournamentMetadata => {
  const tournament = state.metadata.tournament;
  if (!isTournamentTable(state) || !tournament) {
    throw conflictError("This holdem table is not a tournament.");
  }

  return tournament;
};

export const resolveHoldemCreateTableType = (
  params: Pick<HoldemCreateTableRequest, "tableType">,
): HoldemTableType => params.tableType ?? "cash";

export const resolveHoldemCreateMaxSeats = (
  params: Pick<HoldemCreateTableRequest, "tableType" | "maxSeats">,
) =>
  params.maxSeats ??
  (isCasualTableType(resolveHoldemCreateTableType(params))
    ? HOLDEM_DEFAULT_CASUAL_MAX_SEATS
    : HOLDEM_CONFIG.maxSeats);

export const resolveHoldemFundingSource = (
  tableType: HoldemTableType,
): HoldemTableFundingSource =>
  isCasualTableType(tableType) ? "bonus" : "withdrawable";

export const usesHoldemEarnedAsset = (balanceType: HoldemTableFundingSource) =>
  balanceType === "bonus";

export const resolveTournamentStartingStackAmount = (
  config?: HoldemTournamentCreateConfig,
) =>
  toMoneyString(
    parseAmount(
      config?.startingStackAmount ?? DEFAULT_HOLDEM_TOURNAMENT_STARTING_STACK_AMOUNT,
      "tournament starting stack",
    ),
  );

export const resolveTournamentPayoutPlaces = (
  registeredCount: number,
  requestedPayoutPlaces?: number | null,
) => {
  const safeRegisteredCount = Math.max(0, registeredCount);
  if (safeRegisteredCount <= 1) {
    return 1;
  }

  const defaultPlaces =
    safeRegisteredCount <= 2 ? 1 : safeRegisteredCount <= 5 ? 2 : 3;
  const requested = requestedPayoutPlaces ?? defaultPlaces;
  return Math.max(1, Math.min(safeRegisteredCount, 3, requested));
};

const getTournamentPayoutRatios = (payoutPlaces: number) => {
  const safePayoutPlaces = Math.max(1, Math.min(3, Math.floor(payoutPlaces)));
  switch (safePayoutPlaces) {
    case 1:
      return [10_000];
    case 2:
      return [6_500, 3_500];
    default:
      return [5_000, 3_000, 2_000];
  }
};

export const distributeTournamentPayouts = (
  prizePoolAmount: string,
  payoutPlaces: number,
) => {
  const total = toDecimal(prizePoolAmount);
  const basisPoints = getTournamentPayoutRatios(payoutPlaces);
  let remaining = total;

  return basisPoints.map((ratio, index) => {
    const amount =
      index === basisPoints.length - 1
        ? remaining
        : total
            .mul(ratio)
            .div(10_000)
            .toDecimalPlaces(2, Decimal.ROUND_DOWN);
    remaining = remaining.minus(amount);
    return toMoneyString(amount);
  });
};

export const ensureSeatTournamentMetadata = (
  seat: HoldemTableState["seats"][number],
): HoldemSeatTournamentMetadata => {
  const tournament = seat.metadata.tournament;
  if (!tournament) {
    throw conflictError("Tournament seat metadata is missing.");
  }

  return tournament;
};

const upsertTournamentStanding = (
  tournament: HoldemTournamentMetadata,
  standing: HoldemTournamentStanding,
) => {
  const existingIndex = tournament.standings.findIndex(
    (entry) => entry.userId === standing.userId,
  );
  if (existingIndex >= 0) {
    tournament.standings[existingIndex] = standing;
    return;
  }

  tournament.standings.push(standing);
};

const sortTournamentStandings = (standings: HoldemTournamentStanding[]) =>
  standings.sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    if (left.active && right.active) {
      const stackComparison = toDecimal(right.stackAmount).cmp(left.stackAmount);
      if (stackComparison !== 0) {
        return stackComparison;
      }
      return (left.seatIndex ?? 0) - (right.seatIndex ?? 0);
    }

    if (
      left.finishingPlace !== null &&
      right.finishingPlace !== null &&
      left.finishingPlace !== right.finishingPlace
    ) {
      return left.finishingPlace - right.finishingPlace;
    }

    return (left.seatIndex ?? 0) - (right.seatIndex ?? 0);
  });

export const buildTournamentStandingForSeat = (
  seat: HoldemTableState["seats"][number],
): HoldemTournamentStanding => {
  const tournamentSeat = ensureSeatTournamentMetadata(seat);
  return {
    userId: seat.userId,
    displayName: resolveSeatDisplayName(
      seat.userId,
      seat.userEmail,
      seat.metadata,
    ),
    seatIndex: seat.seatIndex,
    stackAmount: toMoneyString(seat.stackAmount),
    active: toDecimal(seat.stackAmount).gt(0) && tournamentSeat.finishingPlace === null,
    finishingPlace: tournamentSeat.finishingPlace,
    eliminatedAt: tournamentSeat.eliminatedAt,
    prizeAmount: tournamentSeat.prizeAmount,
  };
};

export const syncTournamentStandings = (state: HoldemTableState) => {
  if (!isTournamentTable(state)) {
    return;
  }

  const tournament = ensureTournamentMetadata(state);
  for (const seat of state.seats) {
    upsertTournamentStanding(tournament, buildTournamentStandingForSeat(seat));
  }
  sortTournamentStandings(tournament.standings);
  tournament.registeredCount = tournament.standings.length;
  tournament.prizePoolAmount = toMoneyString(
    toDecimal(tournament.buyInAmount).mul(tournament.registeredCount),
  );
  tournament.payoutPlaces = resolveTournamentPayoutPlaces(
    tournament.registeredCount,
    tournament.payoutPlaces,
  );
};

export const removeTournamentStanding = (
  state: HoldemTableState,
  userId: number,
) => {
  if (!isTournamentTable(state)) {
    return;
  }

  const tournament = ensureTournamentMetadata(state);
  tournament.standings = tournament.standings.filter(
    (entry) => entry.userId !== userId,
  );
  tournament.registeredCount = tournament.standings.length;
  tournament.prizePoolAmount = toMoneyString(
    toDecimal(tournament.buyInAmount).mul(tournament.registeredCount),
  );
  if (tournament.registeredCount <= 0) {
    tournament.payoutPlaces = null;
    return;
  }

  tournament.payoutPlaces = resolveTournamentPayoutPlaces(
    tournament.registeredCount,
    tournament.payoutPlaces,
  );
};

export const assertBuyInWithinRange = (
  amount: ReturnType<typeof toDecimal>,
  state?: Pick<HoldemTableState, "minimumBuyIn" | "maximumBuyIn">,
) => {
  const minimum = toDecimal(state?.minimumBuyIn ?? HOLDEM_CONFIG.minimumBuyIn);
  const maximum = toDecimal(state?.maximumBuyIn ?? HOLDEM_CONFIG.maximumBuyIn);
  if (amount.lt(minimum) || amount.gt(maximum)) {
    throw conflictError("Buy-in amount is outside the allowed range.");
  }
};

export const cloneTableState = (state: HoldemTableState): HoldemTableState =>
  JSON.parse(JSON.stringify(state)) as HoldemTableState;

export const isSettledHoldemState = (state: HoldemTableState) =>
  state.status === "waiting" && state.metadata.stage === "showdown";

export const buildHoldemRoundId = (handHistoryId: number) =>
  buildRoundId({
    roundType: HOLDEM_ROUND_TYPE,
    roundEntityId: handHistoryId,
  });

export const buildHoldemRiskTableId = (tableId: number) => `holdem:${tableId}`;

export const buildHoldemTableRef = (tableId: number) => `holdem:${tableId}`;

export const countHumanSeats = (state: HoldemTableState) =>
  state.seats.filter((seat) => !isBotSeat(seat)).length;

export const countBotSeats = (state: HoldemTableState) =>
  state.seats.filter((seat) => isBotSeat(seat)).length;

export const assertHoldemBotTableInvariant = (state: HoldemTableState) => {
  if (countBotSeats(state) === 0) {
    return;
  }

  if (state.metadata.tableType !== "casual") {
    throw internalInvariantError("Seat-level holdem bots are only allowed on casual tables.");
  }
};

export const resolveCreateBotCount = (
  params: Pick<HoldemCreateTableRequest, "botCount" | "maxSeats" | "tableType">,
) => {
  const requested = params.botCount ?? 0;
  if (requested <= 0) {
    return 0;
  }
  const tableType = params.tableType ?? "cash";
  if (tableType !== "casual") {
    throw badRequestError("Seat-level bots are only available on casual holdem tables.");
  }
  return requested;
};

export const assertBotSeatMutationAllowed = (params: {
  state: HoldemTableState;
  requestedCount: number;
}) => {
  assertHoldemBotTableInvariant(params.state);
  if (params.state.metadata.tableType !== "casual") {
    throw conflictError("Seat-level bots are only available on casual holdem tables.");
  }
  if (params.state.status !== "waiting") {
    throw conflictError("Add or remove holdem bots only while the table is waiting.");
  }
  if (params.requestedCount < 1 || params.requestedCount > HOLDEM_MAX_BOT_PLAYERS) {
    throw badRequestError("Invalid holdem bot seat count.");
  }
  if (countHumanSeats(params.state) <= 0) {
    throw conflictError("At least one human seat is required before adding holdem bots.");
  }
  const openSeatCount = Math.max(0, params.state.maxSeats - params.state.seats.length);
  if (params.requestedCount > openSeatCount) {
    throw conflictError("Not enough open seats remain for the requested holdem bots.");
  }
};

export const countHoldemActiveSeats = (state: HoldemTableState) =>
  state.seats.filter((seat) => seat.status === "active").length;

export const resolveSettledHoldemEventType = (state: HoldemTableState) =>
  state.metadata.revealedSeatIndexes.length > 1 ||
  (state.metadata.revealedSeatIndexes.length === 1 &&
    state.metadata.resolvedPots.length === 0)
    ? "showdown_resolved"
    : "hand_won_by_fold";

export const getPendingActorSeat = (state: HoldemTableState) =>
  state.metadata.pendingActorSeatIndex === null
    ? null
    : state.seats.find(
        (seat) => seat.seatIndex === state.metadata.pendingActorSeatIndex,
      ) ?? null;
