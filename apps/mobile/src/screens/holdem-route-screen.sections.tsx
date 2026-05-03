import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  HOLD_EM_CREATE_MAX_SEAT_OPTIONS,
  HOLDEM_CONFIG,
  holdemTableEmojiValues,
} from "@reward/shared-types/holdem";
import type {
  HoldemAction,
  HoldemTable,
  HoldemTableMessage,
  HoldemTablesResponse,
  HoldemTableType,
} from "@reward/shared-types/holdem";
import type { HoldemReplayData } from "@reward/user-core";

import { buildTestId } from "../testing";
import { mobilePalette as palette } from "../theme";
import { ActionButton } from "../ui";
import {
  HoldemRecentHandsPanel,
  HoldemTableChatCard,
  PlayingCard,
  SeatCard,
  SelectionChip,
} from "./holdem-route-screen.components";
import {
  createTableTypeOptions,
  formatDurationMs,
  formatRakePolicyLabel,
  formatTableTypeLabel,
  getActionLabel,
  getSeatStatusLabel,
  parseTimeMs,
  resolveSeatTimeBankRemainingMs,
  type HoldemAmountFormatter,
  type HoldemScreenCopy,
} from "./holdem-route-screen.helpers";
import { holdemRouteScreenStyles as styles } from "./holdem-route-screen.styles";
import type { MobileStyles } from "./types";

type HoldemActingState =
  | "create"
  | "join"
  | "leave"
  | "start"
  | "sitOut"
  | "sitIn"
  | HoldemAction
  | null;
type HoldemEmoji = (typeof holdemTableEmojiValues)[number];

type HoldemLobbyPanelProps = {
  activeTableId: number | null;
  actingHoldem: HoldemActingState;
  emailVerified: boolean;
  effectiveBuyInPreview: string | null;
  formatAmount: HoldemAmountFormatter;
  holdemBuyInAmount: string;
  holdemCreateMaxSeats: number;
  holdemCreateTableType: HoldemTableType;
  holdemTableName: string;
  holdemTables: HoldemTablesResponse | null;
  holdemTournamentPayoutPlaces: string;
  holdemTournamentStartingStackAmount: string;
  loadingHoldemLobby: boolean;
  onChangeHoldemBuyInAmount: (value: string) => void;
  onChangeHoldemCreateMaxSeats: (value: number) => void;
  onChangeHoldemCreateTableType: (value: HoldemTableType) => void;
  onChangeHoldemTableName: (value: string) => void;
  onChangeHoldemTournamentPayoutPlaces: (value: string) => void;
  onChangeHoldemTournamentStartingStackAmount: (value: string) => void;
  onCreateHoldemTable: () => void;
  onRefreshHoldemLobby: () => void;
  onSelectHoldemTable: (tableId: number) => void;
  screenCopy: HoldemScreenCopy;
  uiStyles: MobileStyles;
};

export function HoldemLobbyPanel(props: HoldemLobbyPanelProps) {
  const lobbyTables = props.holdemTables?.tables ?? [];
  const activeTableCount = lobbyTables.filter(
    (table) => table.status === "active",
  ).length;
  const waitingTableCount = lobbyTables.filter(
    (table) => table.status !== "active",
  ).length;
  const availableSeatCount = lobbyTables.reduce(
    (sum, table) => sum + Math.max(table.maxSeats - table.occupiedSeats, 0),
    0,
  );

  return (
    <>
      {lobbyTables.length > 0 ? (
        <View style={styles.lobbySummaryRow}>
          <View style={[styles.lobbySummaryCard, styles.lobbySummaryCardGold]}>
            <Text style={styles.lobbySummaryLabel}>
              {props.screenCopy.activeStatus}
            </Text>
            <Text style={styles.lobbySummaryValue}>{activeTableCount}</Text>
          </View>
          <View style={styles.lobbySummaryCard}>
            <Text style={styles.lobbySummaryLabel}>
              {props.screenCopy.waitingStatus}
            </Text>
            <Text style={styles.lobbySummaryValue}>{waitingTableCount}</Text>
          </View>
          <View style={styles.lobbySummaryCard}>
            <Text style={styles.lobbySummaryLabel}>
              {props.screenCopy.seatCount}
            </Text>
            <Text style={styles.lobbySummaryValue}>{availableSeatCount}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.fieldStack}>
        <View style={props.uiStyles.field}>
          <Text style={props.uiStyles.fieldLabel}>
            {props.screenCopy.tableMode}
          </Text>
          <View style={styles.choiceRow}>
            {createTableTypeOptions.map((tableType) => (
              <SelectionChip
                key={tableType}
                label={
                  tableType === "casual"
                    ? props.screenCopy.casualTable
                    : tableType === "tournament"
                      ? props.screenCopy.tournamentTable
                      : props.screenCopy.cashTable
                }
                active={props.holdemCreateTableType === tableType}
                disabled={props.actingHoldem !== null}
                onPress={() => props.onChangeHoldemCreateTableType(tableType)}
                testID={`holdem-create-table-type-${tableType}-button`}
              />
            ))}
          </View>
          <Text style={props.uiStyles.gachaHint}>
            {props.holdemCreateTableType === "casual"
              ? props.screenCopy.casualTableHint
              : props.holdemCreateTableType === "tournament"
                ? props.screenCopy.tournamentTableHint
                : props.screenCopy.cashTableHint}
          </Text>
        </View>

        <View style={props.uiStyles.field}>
          <Text style={props.uiStyles.fieldLabel}>
            {props.screenCopy.seatCount}
          </Text>
          <View style={styles.choiceRow}>
            {HOLD_EM_CREATE_MAX_SEAT_OPTIONS.map((seatCount) => (
              <SelectionChip
                key={seatCount}
                label={String(seatCount)}
                active={props.holdemCreateMaxSeats === seatCount}
                disabled={props.actingHoldem !== null}
                onPress={() => props.onChangeHoldemCreateMaxSeats(seatCount)}
                testID={`holdem-create-max-seats-${seatCount}-button`}
              />
            ))}
          </View>
        </View>

        <View style={props.uiStyles.field}>
          <Text style={props.uiStyles.fieldLabel}>
            {props.screenCopy.tableName}
          </Text>
          <TextInput
            value={props.holdemTableName}
            onChangeText={props.onChangeHoldemTableName}
            style={props.uiStyles.input}
            autoCorrect={false}
            autoCapitalize="words"
            placeholder={props.screenCopy.tableName}
            placeholderTextColor={palette.textMuted}
            testID="holdem-table-name-input"
          />
        </View>

        <View style={props.uiStyles.field}>
          <Text style={props.uiStyles.fieldLabel}>
            {props.screenCopy.buyInAmount}
          </Text>
          <TextInput
            value={props.holdemBuyInAmount}
            onChangeText={props.onChangeHoldemBuyInAmount}
            style={props.uiStyles.input}
            keyboardType="decimal-pad"
            autoCorrect={false}
            placeholderTextColor={palette.textMuted}
            testID="holdem-buy-in-input"
          />
          <Text style={props.uiStyles.gachaHint}>
            {props.holdemCreateTableType === "tournament"
              ? props.screenCopy.tournamentTableHint
              : props.screenCopy.buyInRange(
                  HOLDEM_CONFIG.minimumBuyIn,
                  HOLDEM_CONFIG.maximumBuyIn,
                )}
          </Text>
          {props.effectiveBuyInPreview ? (
            <Text style={props.uiStyles.gachaHint}>
              {props.screenCopy.effectiveBuyInPreview(props.effectiveBuyInPreview)}
            </Text>
          ) : null}
        </View>

        {props.holdemCreateTableType === "tournament" ? (
          <>
            <View style={props.uiStyles.field}>
              <Text style={props.uiStyles.fieldLabel}>
                {props.screenCopy.tournamentStartingStack}
              </Text>
              <TextInput
                value={props.holdemTournamentStartingStackAmount}
                onChangeText={props.onChangeHoldemTournamentStartingStackAmount}
                style={props.uiStyles.input}
                keyboardType="decimal-pad"
                autoCorrect={false}
                placeholder={props.screenCopy.tournamentStartingStack}
                placeholderTextColor={palette.textMuted}
                testID="holdem-tournament-starting-stack-input"
              />
            </View>

            <View style={props.uiStyles.field}>
              <Text style={props.uiStyles.fieldLabel}>
                {props.screenCopy.tournamentPayoutPlaces}
              </Text>
              <TextInput
                value={props.holdemTournamentPayoutPlaces}
                onChangeText={props.onChangeHoldemTournamentPayoutPlaces}
                style={props.uiStyles.input}
                keyboardType="number-pad"
                autoCorrect={false}
                placeholder={props.screenCopy.tournamentPayoutPlaces}
                placeholderTextColor={palette.textMuted}
                testID="holdem-tournament-payout-places-input"
              />
              <Text style={props.uiStyles.gachaHint}>
                {props.screenCopy.tournamentPayoutPlacesHint}
              </Text>
            </View>
          </>
        ) : null}

        <View style={styles.lobbyActionStack}>
          <ActionButton
            label={
              props.actingHoldem === "create"
                ? props.screenCopy.creatingTable
                : props.screenCopy.createTable
            }
            onPress={props.onCreateHoldemTable}
            disabled={props.actingHoldem !== null || !props.emailVerified}
            fullWidth
            testID="holdem-create-table-button"
          />
          <View style={styles.lobbyActionMetaRow}>
            <View style={styles.lobbyActionMetaCard}>
              <Text style={styles.lobbyActionMetaLabel}>
                {props.screenCopy.tableType}
              </Text>
              <Text style={styles.lobbyActionMetaValue}>
                {formatTableTypeLabel(
                  props.screenCopy,
                  props.holdemCreateTableType,
                )}
              </Text>
            </View>
            <View style={styles.lobbyActionMetaCard}>
              <Text style={styles.lobbyActionMetaLabel}>
                {props.screenCopy.buyInAmount}
              </Text>
              <Text style={styles.lobbyActionMetaValue}>
                {props.effectiveBuyInPreview ??
                  props.formatAmount(props.holdemBuyInAmount || "0.00")}
              </Text>
            </View>
          </View>
          <ActionButton
            label={
              props.loadingHoldemLobby
                ? props.screenCopy.refreshingTable
                : props.screenCopy.refreshTable
            }
            onPress={props.onRefreshHoldemLobby}
            variant="secondary"
            fullWidth
            testID="holdem-refresh-lobby-button"
          />
        </View>
      </View>

      <View style={styles.lobbyList}>
        {props.loadingHoldemLobby ? (
          <View style={props.uiStyles.loaderRow}>
            <ActivityIndicator color={palette.accent} />
            <Text style={props.uiStyles.loaderText}>
              {props.screenCopy.refreshingTable}
            </Text>
          </View>
        ) : lobbyTables.length ? (
          lobbyTables.map((table) => (
            <Pressable
              key={`table-${table.id}`}
              onPress={() => props.onSelectHoldemTable(table.id)}
              accessibilityRole="button"
              accessibilityLabel={`${table.name} ${table.id}`}
              testID={buildTestId("holdem-lobby-card", table.name)}
              style={[
                styles.lobbyCard,
                props.activeTableId === table.id ? styles.lobbyCardActive : null,
              ]}
            >
              <View style={styles.lobbyCardHeader}>
                <View style={styles.lobbyCardBody}>
                  <View style={styles.lobbyCardTitleRow}>
                    <Text style={styles.lobbyCardTitle}>{table.name}</Text>
                    <View
                      style={[
                        styles.lobbyStatusChip,
                        table.status === "active"
                          ? styles.lobbyStatusChipActive
                          : styles.lobbyStatusChipWaiting,
                      ]}
                    >
                      <Text style={styles.lobbyStatusChipLabel}>
                        {table.status === "active"
                          ? props.screenCopy.activeStatus
                          : props.screenCopy.waitingStatus}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.lobbyCardMeta}>
                    {props.screenCopy.tableType}:{" "}
                    {formatTableTypeLabel(props.screenCopy, table.tableType)}
                  </Text>
                </View>
                <View style={styles.lobbyCardCountBadge}>
                  <Text style={styles.lobbyCardCount}>
                    {table.occupiedSeats}/{table.maxSeats}
                  </Text>
                  <Text style={styles.lobbyCardCountLabel}>
                    {props.screenCopy.seatCount}
                  </Text>
                </View>
              </View>
              <View style={styles.lobbyCardMetaRow}>
                <View style={styles.lobbyCardMetaCard}>
                  <Text style={styles.lobbyCardMetaLabel}>
                    {props.screenCopy.blinds}
                  </Text>
                  <Text style={styles.lobbyCardMetaValue}>
                    {props.formatAmount(table.smallBlind)} /{" "}
                    {props.formatAmount(table.bigBlind)}
                  </Text>
                </View>
                <View style={styles.lobbyCardMetaCard}>
                  <Text style={styles.lobbyCardMetaLabel}>
                    {props.screenCopy.rakePolicy}
                  </Text>
                  <Text style={styles.lobbyCardMetaValue}>
                    {formatRakePolicyLabel({
                      copy: props.screenCopy,
                      formatAmount: props.formatAmount,
                      table,
                    })}
                  </Text>
                </View>
              </View>
              <Text style={styles.lobbyCardMeta}>
                {props.screenCopy.summaryStatus}:{" "}
                {table.status === "active"
                  ? props.screenCopy.activeStatus
                  : props.screenCopy.waitingStatus}
              </Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.emptyStateLabel}>{props.screenCopy.noTables}</Text>
        )}
      </View>
    </>
  );
}

type HoldemActiveTablePanelProps = {
  activeTable: HoldemTable;
  balance: string;
  canStart: boolean;
  chatDraft: string;
  clockNowMs: number;
  actingHoldem: HoldemActingState;
  emailVerified: boolean;
  formatAmount: HoldemAmountFormatter;
  holdemActionAmount: string;
  holdemReplayError: string | null;
  holdemTableMessages: HoldemTableMessage[];
  loadingHoldemMessages: boolean;
  loadingHoldemReplay: boolean;
  loadingHoldemTable: boolean;
  onActOnHoldemTable: (tableId: number, action: HoldemAction) => void;
  onChangeChatDraft: (value: string) => void;
  onChangeHoldemActionAmount: (value: string) => void;
  onCloseHoldemReplay: () => void;
  onJoinHoldemTable: (tableId: number) => void;
  onLeaveHoldemTable: (tableId: number) => void;
  onOpenHoldemReplay: (roundId: string) => void;
  onRefreshHoldemTable: (tableId: number) => void;
  onSendChatDraft: () => void;
  onSendEmoji: (emoji: HoldemEmoji) => void;
  onSetHoldemSeatMode: (tableId: number, sittingOut: boolean) => void;
  onStartHoldemTable: (tableId: number) => void;
  screenCopy: HoldemScreenCopy;
  selectedHoldemReplayRoundId: string | null;
  selectedReplay: HoldemReplayData | null;
  sendingHoldemMessage: boolean;
  uiStyles: MobileStyles;
};

export function HoldemActiveTablePanel(props: HoldemActiveTablePanelProps) {
  const heroSeated = props.activeTable.heroSeatIndex !== null;
  const heroSeat =
    props.activeTable.heroSeatIndex !== null
      ? props.activeTable.seats[props.activeTable.heroSeatIndex] ?? null
      : null;
  const pendingActorSeat =
    props.activeTable.pendingActorSeatIndex !== null
      ? props.activeTable.seats[props.activeTable.pendingActorSeatIndex] ?? null
      : null;
  const pendingActorClockMs = (() => {
    const deadlineAtMs = parseTimeMs(props.activeTable.pendingActorDeadlineAt);
    return deadlineAtMs === null ? null : Math.max(0, deadlineAtMs - props.clockNowMs);
  })();
  const heroTimeBankMs = resolveSeatTimeBankRemainingMs(
    props.activeTable,
    heroSeat,
    props.clockNowMs,
  );
  const featuredOpponent =
    pendingActorSeat &&
    pendingActorSeat.userId !== null &&
    pendingActorSeat.seatIndex !== props.activeTable.heroSeatIndex
      ? pendingActorSeat
      : props.activeTable.seats.find(
          (seat) =>
            seat.userId !== null &&
            seat.seatIndex !== props.activeTable.heroSeatIndex,
        ) ?? null;
  const mainPot =
    props.activeTable.pots.find((pot) => pot.kind === "main") ??
    props.activeTable.pots[0] ??
    null;
  const sidePots = mainPot
    ? props.activeTable.pots.filter((pot) => pot !== mainPot)
    : props.activeTable.pots;
  const heroCards =
    heroSeat?.cards.length && heroSeat.cards.length > 0
      ? heroSeat.cards
      : [
          { rank: null, suit: null, hidden: true },
          { rank: null, suit: null, hidden: true },
        ];
  const opponentCards =
    featuredOpponent?.cards.length && featuredOpponent.cards.length > 0
      ? featuredOpponent.cards
      : [
          { rank: null, suit: null, hidden: true },
          { rank: null, suit: null, hidden: true },
        ];
  const availableActions = props.activeTable.availableActions;
  const actionAmountValue = (() => {
    const value = Number(props.holdemActionAmount || "0");
    return Number.isFinite(value) && value > 0
      ? props.formatAmount(value.toFixed(2))
      : null;
  })();
  const showActionAmountField = Boolean(
    availableActions?.actions.some(
      (action) => action === "raise" || action === "bet",
    ),
  );
  const getActionButtonLabel = (action: HoldemAction) => {
    if (action === "call") {
      const toCall = availableActions?.toCall ?? "0.00";
      return toCall === "0.00"
        ? props.screenCopy.call
        : `${props.screenCopy.call}\n${props.formatAmount(toCall)}`;
    }
    if (action === "raise") {
      return `${props.screenCopy.raise}\n${
        actionAmountValue ??
        (availableActions?.minimumRaiseTo
          ? props.formatAmount(availableActions.minimumRaiseTo)
          : "--")
      }`;
    }
    if (action === "bet") {
      return `${props.screenCopy.bet}\n${actionAmountValue ?? "--"}`;
    }
    if (action === "all_in") {
      return heroSeat
        ? `${props.screenCopy.allIn}\n${props.formatAmount(heroSeat.stackAmount)}`
        : props.screenCopy.allIn;
    }

    return getActionLabel(action, props.screenCopy);
  };
  const tableActionStatus = heroSeat
    ? getSeatStatusLabel(heroSeat, props.screenCopy)
    : props.screenCopy.noSelection;
  return (
    <>
      <View style={styles.tableHero}>
        <View style={styles.tableHeroHeader}>
          <View>
            <Text style={styles.tableHeroTitle}>{props.activeTable.name}</Text>
            <Text style={styles.tableHeroSubtitle}>
              {props.activeTable.status === "active"
                ? props.screenCopy.activeStatus
                : props.screenCopy.waitingStatus}
            </Text>
          </View>
          <ActionButton
            label={
              props.loadingHoldemTable
                ? props.screenCopy.refreshingTable
                : props.screenCopy.refreshTable
            }
            onPress={() => props.onRefreshHoldemTable(props.activeTable.id)}
            variant="secondary"
            compact
            testID="holdem-refresh-table-button"
          />
        </View>

        <View style={styles.stageChipRow}>
          <View style={[styles.stageChip, styles.stageChipGold]}>
            <Text style={styles.stageChipText}>
              {props.screenCopy.blinds} {props.formatAmount(props.activeTable.smallBlind)} /{" "}
              {props.formatAmount(props.activeTable.bigBlind)}
            </Text>
          </View>
          <View style={styles.stageChip}>
            <Text style={styles.stageChipText}>
              {props.screenCopy.tableType}:{" "}
              {formatTableTypeLabel(props.screenCopy, props.activeTable.tableType)}
            </Text>
          </View>
          <View style={styles.stageChip}>
            <Text style={styles.stageChipText}>
              {props.screenCopy.rakePolicy}:{" "}
              {formatRakePolicyLabel({
                copy: props.screenCopy,
                formatAmount: props.formatAmount,
                table: props.activeTable,
              })}
            </Text>
          </View>
        </View>

        <View style={styles.tableSurface}>
          <View style={styles.tableSurfaceInner} />
          <View style={styles.tableSurfaceFairnessBadge}>
            <Text style={styles.tableSurfaceFairnessKicker}>
              {props.screenCopy.fairness}
            </Text>
            <Text style={styles.tableSurfaceFairnessValue}>
              {props.activeTable.fairness?.commitHash.slice(0, 12) ?? "--"}
            </Text>
          </View>
          {featuredOpponent ? (
            <View style={styles.tableSurfaceTopSeat}>
              <View style={styles.tableSurfaceTopAvatar}>
                <Text style={styles.tableSurfaceTopAvatarLabel}>
                  {(featuredOpponent.displayName ?? "P").slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.tableSurfaceTopName}>
                <Text style={styles.tableHeroTitle}>
                  {featuredOpponent.displayName ?? `Seat ${featuredOpponent.seatIndex + 1}`}
                </Text>
              </View>
              <View style={styles.tableSurfaceTopStack}>
                <Text style={styles.tableMetaValue}>
                  {props.formatAmount(featuredOpponent.stackAmount)}
                </Text>
              </View>
              <View style={styles.tableSurfaceTopCards}>
                {opponentCards.slice(0, 2).map((card, index) => (
                  <View
                    key={`featured-opponent-card-${featuredOpponent.seatIndex}-${index}`}
                    style={
                      index === 0
                        ? styles.tableSurfaceTiltLeft
                        : styles.tableSurfaceTiltRight
                    }
                  >
                    <PlayingCard card={card} size="compact" />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.tablePotBadge}>
            <Text style={styles.tablePotLabel}>
              {mainPot?.kind === "main"
                ? props.screenCopy.mainPot
                : props.screenCopy.currentBet}
            </Text>
            <Text style={styles.tablePotValue}>
              {props.formatAmount(
                mainPot?.amount ??
                  props.activeTable.availableActions?.currentBet ??
                  "0.00",
              )}
            </Text>
          </View>

          <View style={styles.boardWrap}>
            <View style={styles.boardRow}>
              {Array.from({ length: 5 }, (_, index) => (
                props.activeTable.communityCards[index] ? (
                  <PlayingCard
                    key={`board-${index}`}
                    card={props.activeTable.communityCards[index]}
                  />
                ) : (
                  <View
                    key={`board-placeholder-${index}`}
                    style={styles.boardPlaceholderCard}
                  >
                    <Text style={styles.boardPlaceholderLabel}>?</Text>
                  </View>
                )
              ))}
            </View>
          </View>

          {heroSeat ? (
            <View style={styles.tableSurfaceHeroSeat}>
              <View style={styles.tableSurfaceHeroCards}>
                {heroCards.slice(0, 2).map((card, index) => (
                  <View
                    key={`hero-card-${heroSeat.seatIndex}-${index}`}
                    style={
                      index === 0
                        ? styles.tableSurfaceHeroTiltLeft
                        : styles.tableSurfaceHeroTiltRight
                    }
                  >
                    <PlayingCard card={card} size="hero" />
                  </View>
                ))}
              </View>
              <View style={styles.tableSurfaceHeroAvatar}>
                <Text style={styles.tableSurfaceHeroAvatarGlyph}>
                  {props.screenCopy.you.slice(0, 1)}
                </Text>
              </View>
              <View style={styles.tableSurfaceHeroLabel}>
                <Text style={styles.tableHeroTitle}>
                  {heroSeat.displayName ?? props.screenCopy.you}
                </Text>
              </View>
              <View style={styles.tableSurfaceHeroStatus}>
                <Text style={styles.stageChipText}>{tableActionStatus}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.tableHeroJoinPrompt}>
              <Text style={styles.tableHeroJoinPromptText}>
                {props.screenCopy.noSelection}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.tableMetaRow}>
          <View style={styles.tableMetaCard}>
            <Text style={styles.tableMetaLabel}>
              {props.screenCopy.currentBet}
            </Text>
            <Text style={styles.tableMetaValue}>
              {props.formatAmount(
                props.activeTable.availableActions?.currentBet ?? "0.00",
              )}
            </Text>
          </View>
          <View style={styles.tableMetaCard}>
            <Text style={styles.tableMetaLabel}>
              {props.screenCopy.actionClock}
            </Text>
            <Text style={styles.tableMetaValue}>
              {formatDurationMs(pendingActorClockMs)}
            </Text>
          </View>
          <View style={styles.tableMetaCard}>
            <Text style={styles.tableMetaLabel}>
              {props.screenCopy.timeBank}
            </Text>
            <Text style={styles.tableMetaValue}>
              {formatDurationMs(heroTimeBankMs)}
            </Text>
          </View>
          <View style={styles.tableMetaCard}>
            <Text style={styles.tableMetaLabel}>
              {props.screenCopy.summaryStatus}
            </Text>
            <Text style={styles.tableMetaValue}>
              {pendingActorSeat?.displayName ??
                (pendingActorSeat
                  ? `${props.screenCopy.openSeat} ${pendingActorSeat.seatIndex + 1}`
                  : "—")}
            </Text>
          </View>
        </View>

        {sidePots.length > 0 ? (
          <View style={styles.potGrid}>
            {sidePots.map((pot) => (
              <View
                key={`${pot.kind}-${pot.potIndex}`}
                style={styles.potCard}
              >
                <Text style={styles.potLabel}>
                  {pot.kind === "main"
                    ? props.screenCopy.mainPot
                    : `${props.screenCopy.sidePot} ${pot.potIndex}`}
                </Text>
                <Text style={styles.potValue}>
                  {props.formatAmount(pot.amount)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.seatList}>
        {props.activeTable.seats.map((seat) => (
          <SeatCard
            key={`seat-${seat.seatIndex}`}
            table={props.activeTable}
            seat={seat}
            copy={props.screenCopy}
            formatAmount={props.formatAmount}
          />
        ))}
      </View>

      <View style={styles.actionPanel}>
        <View style={styles.actionSummaryRow}>
          <View style={styles.actionSummaryCard}>
            <Text style={styles.actionSummaryLabel}>
              {props.screenCopy.summaryBalance}
            </Text>
            <Text style={styles.actionSummaryValue}>
              {props.formatAmount(props.balance)}
            </Text>
          </View>
          <View style={[styles.actionSummaryCard, styles.actionSummaryCardGold]}>
            <Text style={styles.actionSummaryLabel}>{props.screenCopy.toCall}</Text>
            <Text style={[styles.actionSummaryValue, styles.actionSummaryValueGold]}>
              {props.formatAmount(availableActions?.toCall ?? "0.00")}
            </Text>
          </View>
        </View>

        {!heroSeated ? (
          <ActionButton
            label={
              props.actingHoldem === "join"
                ? props.screenCopy.joiningTable
                : props.screenCopy.joinTable
            }
            onPress={() => props.onJoinHoldemTable(props.activeTable.id)}
            disabled={props.actingHoldem !== null || !props.emailVerified}
            fullWidth
            testID="holdem-join-table-button"
          />
        ) : (
          <View style={styles.tableControlGrid}>
            <View style={styles.actionButtonCellWide}>
              <ActionButton
                label={
                  props.actingHoldem === "leave"
                    ? props.screenCopy.leavingTable
                    : props.screenCopy.leaveTable
                }
                onPress={() => props.onLeaveHoldemTable(props.activeTable.id)}
                disabled={props.actingHoldem !== null}
                variant="secondary"
                fullWidth
                testID="holdem-leave-table-button"
              />
            </View>
            {heroSeat ? (
              <View style={styles.actionButtonCellWide}>
                <ActionButton
                  label={
                    heroSeat.sittingOut
                      ? props.actingHoldem === "sitIn"
                        ? props.screenCopy.sittingInTable
                        : props.screenCopy.sitInTable
                      : props.actingHoldem === "sitOut"
                        ? props.screenCopy.sittingOutTable
                        : props.screenCopy.sitOutTable
                  }
                  onPress={() =>
                    props.onSetHoldemSeatMode(
                      props.activeTable.id,
                      !heroSeat.sittingOut,
                    )
                  }
                  disabled={props.actingHoldem !== null}
                  variant="secondary"
                  fullWidth
                  testID="holdem-toggle-seat-mode-button"
                />
              </View>
            ) : null}
            {props.activeTable.status === "waiting" && props.canStart ? (
              <View style={styles.actionButtonCellWide}>
                <ActionButton
                  label={
                    props.actingHoldem === "start"
                      ? props.screenCopy.startingHand
                      : props.screenCopy.startHand
                  }
                  onPress={() => props.onStartHoldemTable(props.activeTable.id)}
                  disabled={props.actingHoldem !== null}
                  fullWidth
                  testID="holdem-start-hand-button"
                />
              </View>
            ) : null}
          </View>
        )}

        {showActionAmountField ? (
          <View style={styles.actionAmountCard}>
            <Text style={styles.actionAmountLabel}>
              {props.screenCopy.actionAmount}
            </Text>
            <TextInput
              value={props.holdemActionAmount}
              onChangeText={props.onChangeHoldemActionAmount}
              style={props.uiStyles.input}
              keyboardType="decimal-pad"
              autoCorrect={false}
              placeholderTextColor={palette.textMuted}
              testID="holdem-action-amount-input"
            />
            <Text style={props.uiStyles.gachaHint}>
              {props.screenCopy.amountHint}
            </Text>
          </View>
        ) : null}

        {availableActions ? (
          <>
            <View style={styles.actionButtonGrid}>
              {availableActions.actions.map((action) => (
                <View
                  key={action}
                  style={[
                    action === "raise" ||
                    action === "bet" ||
                    action === "all_in"
                      ? styles.actionButtonCellWide
                      : styles.actionButtonCell,
                  ]}
                >
                  <ActionButton
                    label={getActionButtonLabel(action)}
                    onPress={() =>
                      props.onActOnHoldemTable(props.activeTable.id, action)
                    }
                    disabled={props.actingHoldem !== null}
                    variant={
                      action === "fold"
                        ? "secondary"
                        : action === "check" || action === "call"
                          ? "gold"
                          : "primary"
                    }
                    fullWidth
                    testID={buildTestId("holdem-action-button", action)}
                  />
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>

      <HoldemTableChatCard
        chatDraft={props.chatDraft}
        heroSeatIndex={props.activeTable.heroSeatIndex}
        loadingHoldemMessages={props.loadingHoldemMessages}
        onChangeChatDraft={props.onChangeChatDraft}
        onSendChatDraft={props.onSendChatDraft}
        onSendEmoji={props.onSendEmoji}
        screenCopy={props.screenCopy}
        sendingHoldemMessage={props.sendingHoldemMessage}
        tableMessages={props.holdemTableMessages}
        inputStyle={props.uiStyles.input}
      />

      <HoldemRecentHandsPanel
        activeTableName={props.activeTable.name}
        formatAmount={props.formatAmount}
        loadingHoldemReplay={props.loadingHoldemReplay}
        holdemReplayError={props.holdemReplayError}
        onCloseHoldemReplay={props.onCloseHoldemReplay}
        onOpenHoldemReplay={props.onOpenHoldemReplay}
        recentHands={props.activeTable.recentHands}
        screenCopy={props.screenCopy}
        selectedHoldemReplayRoundId={props.selectedHoldemReplayRoundId}
        selectedReplay={props.selectedReplay}
      />
    </>
  );
}
