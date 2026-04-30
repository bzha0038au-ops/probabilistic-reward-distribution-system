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
  return (
    <>
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

        <View style={props.uiStyles.inlineActions}>
          <ActionButton
            label={
              props.actingHoldem === "create"
                ? props.screenCopy.creatingTable
                : props.screenCopy.createTable
            }
            onPress={props.onCreateHoldemTable}
            disabled={props.actingHoldem !== null || !props.emailVerified}
            testID="holdem-create-table-button"
          />
          <ActionButton
            label={
              props.loadingHoldemLobby
                ? props.screenCopy.refreshingTable
                : props.screenCopy.refreshTable
            }
            onPress={props.onRefreshHoldemLobby}
            variant="secondary"
            compact
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
        ) : props.holdemTables?.tables.length ? (
          props.holdemTables.tables.map((table) => (
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
                  <Text style={styles.lobbyCardTitle}>{table.name}</Text>
                  <Text style={styles.lobbyCardMeta}>
                    {props.screenCopy.summaryStatus}:{" "}
                    {table.status === "active"
                      ? props.screenCopy.activeStatus
                      : props.screenCopy.waitingStatus}
                  </Text>
                </View>
                <Text style={styles.lobbyCardCount}>
                  {table.occupiedSeats}/{table.maxSeats}
                </Text>
              </View>
              <Text style={styles.lobbyCardMeta}>
                {props.screenCopy.blinds} {props.formatAmount(table.smallBlind)} /{" "}
                {props.formatAmount(table.bigBlind)}
              </Text>
              <Text style={styles.lobbyCardMeta}>
                {props.screenCopy.tableType}:{" "}
                {formatTableTypeLabel(props.screenCopy, table.tableType)}
              </Text>
              <Text style={styles.lobbyCardMeta}>
                {props.screenCopy.rakePolicy}:{" "}
                {formatRakePolicyLabel({
                  copy: props.screenCopy,
                  formatAmount: props.formatAmount,
                  table,
                })}
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
  const pendingActorTimeBankMs = resolveSeatTimeBankRemainingMs(
    props.activeTable,
    pendingActorSeat,
    props.clockNowMs,
  );

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
              {props.screenCopy.blinds}
            </Text>
            <Text style={styles.tableMetaValue}>
              {props.formatAmount(props.activeTable.smallBlind)} /{" "}
              {props.formatAmount(props.activeTable.bigBlind)}
            </Text>
          </View>
          <View style={styles.tableMetaCard}>
            <Text style={styles.tableMetaLabel}>
              {props.screenCopy.tableType}
            </Text>
            <Text style={styles.tableMetaValue}>
              {formatTableTypeLabel(props.screenCopy, props.activeTable.tableType)}
            </Text>
          </View>
          <View style={styles.tableMetaCard}>
            <Text style={styles.tableMetaLabel}>
              {props.screenCopy.rakePolicy}
            </Text>
            <Text style={styles.tableMetaValue}>
              {formatRakePolicyLabel({
                copy: props.screenCopy,
                formatAmount: props.formatAmount,
                table: props.activeTable,
              })}
            </Text>
          </View>
          <View style={styles.tableMetaCard}>
            <Text style={styles.tableMetaLabel}>
              {props.screenCopy.fairness}
            </Text>
            <Text style={styles.tableMetaValue}>
              {props.activeTable.fairness?.commitHash.slice(0, 12) ?? "--"}
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
              {formatDurationMs(pendingActorTimeBankMs)}
            </Text>
          </View>
        </View>

        <View style={styles.boardRow}>
          {Array.from({ length: 5 }, (_, index) => (
            <PlayingCard
              key={`board-${index}`}
              card={
                props.activeTable.communityCards[index] ?? {
                  rank: null,
                  suit: null,
                  hidden: true,
                }
              }
            />
          ))}
        </View>

        <View style={styles.potGrid}>
          {props.activeTable.pots.length > 0 ? (
            props.activeTable.pots.map((pot) => (
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
            ))
          ) : (
            <View style={styles.potCardWide}>
              <Text style={styles.emptyStateLabel}>
                {props.screenCopy.noRecentHands}
              </Text>
            </View>
          )}
        </View>
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
        {!heroSeated ? (
          <ActionButton
            label={
              props.actingHoldem === "join"
                ? props.screenCopy.joiningTable
                : props.screenCopy.joinTable
            }
            onPress={() => props.onJoinHoldemTable(props.activeTable.id)}
            disabled={props.actingHoldem !== null || !props.emailVerified}
            testID="holdem-join-table-button"
          />
        ) : (
          <View style={props.uiStyles.inlineActions}>
            <ActionButton
              label={
                props.actingHoldem === "leave"
                  ? props.screenCopy.leavingTable
                  : props.screenCopy.leaveTable
              }
              onPress={() => props.onLeaveHoldemTable(props.activeTable.id)}
              disabled={props.actingHoldem !== null}
              variant="secondary"
              testID="holdem-leave-table-button"
            />
            {heroSeat ? (
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
                testID="holdem-toggle-seat-mode-button"
              />
            ) : null}
            {props.activeTable.status === "waiting" && props.canStart ? (
              <ActionButton
                label={
                  props.actingHoldem === "start"
                    ? props.screenCopy.startingHand
                    : props.screenCopy.startHand
                }
                onPress={() => props.onStartHoldemTable(props.activeTable.id)}
                disabled={props.actingHoldem !== null}
                testID="holdem-start-hand-button"
              />
            ) : null}
          </View>
        )}

        {heroSeat ? (
          <View style={styles.tableMetaRow}>
            <View style={styles.tableMetaCard}>
              <Text style={styles.tableMetaLabel}>
                {props.screenCopy.timeBank}
              </Text>
              <Text style={styles.tableMetaValue}>
                {formatDurationMs(heroTimeBankMs)}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={props.uiStyles.field}>
          <Text style={props.uiStyles.fieldLabel}>
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

        {props.activeTable.availableActions ? (
          <>
            <View style={styles.tableMetaRow}>
              <View style={styles.tableMetaCard}>
                <Text style={styles.tableMetaLabel}>
                  {props.screenCopy.toCall}
                </Text>
                <Text style={styles.tableMetaValue}>
                  {props.formatAmount(props.activeTable.availableActions.toCall)}
                </Text>
              </View>
              <View style={styles.tableMetaCard}>
                <Text style={styles.tableMetaLabel}>
                  {props.screenCopy.minRaiseTo}
                </Text>
                <Text style={styles.tableMetaValue}>
                  {props.activeTable.availableActions.minimumRaiseTo
                    ? props.formatAmount(
                        props.activeTable.availableActions.minimumRaiseTo,
                      )
                    : "--"}
                </Text>
              </View>
            </View>

            <View style={styles.actionButtonGrid}>
              {props.activeTable.availableActions.actions.map((action) => (
                <ActionButton
                  key={action}
                  label={getActionLabel(action, props.screenCopy)}
                  onPress={() => props.onActOnHoldemTable(props.activeTable.id, action)}
                  disabled={props.actingHoldem !== null}
                  variant={action === "fold" ? "secondary" : "primary"}
                  compact
                  testID={buildTestId("holdem-action-button", action)}
                />
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
