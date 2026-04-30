import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  holdemTableEmojiValues,
  type HoldemCardView,
  type HoldemTable,
  type HoldemTableMessage,
} from "@reward/shared-types/holdem";
import type {
  HoldemRealtimeConnectionStatus,
  HoldemReplayData,
} from "@reward/user-core";

import type { MobileRouteLabels } from "../route-copy";
import { buildTestId } from "../testing";
import { mobilePalette as palette } from "../theme";
import { ActionButton, SectionCard } from "../ui";
import { RouteSwitcher } from "./route-switcher";
import { holdemRouteScreenStyles as styles } from "./holdem-route-screen.styles";
import {
  describeReplayEvent,
  formatReplayTimestamp,
  getRealtimeStatusLabel,
  getReplaySeatLabel,
  getReplayStageLabel,
  getSeatStatusLabel,
  type HoldemAmountFormatter,
  type HoldemScreenCopy,
} from "./holdem-route-screen.helpers";
import type { MobileAppRoute, MobileStyles } from "./types";

const suitSymbols = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
} as const;

function isRedSuit(card: HoldemCardView) {
  return card.suit === "hearts" || card.suit === "diamonds";
}

export function PlayingCard(props: { card: HoldemCardView }) {
  const hidden = props.card.hidden || !props.card.rank || !props.card.suit;
  const suit = props.card.suit ? suitSymbols[props.card.suit] : "•";

  return (
    <View
      style={[
        styles.playingCard,
        hidden ? styles.playingCardHidden : null,
      ]}
    >
      {hidden ? (
        <Text style={styles.playingCardBack}>HOLD</Text>
      ) : (
        <>
          <Text
            style={[
              styles.playingCardLabel,
              isRedSuit(props.card) ? styles.playingCardLabelRed : null,
            ]}
          >
            {props.card.rank}
          </Text>
          <Text
            style={[
              styles.playingCardSuit,
              isRedSuit(props.card) ? styles.playingCardLabelRed : null,
            ]}
          >
            {suit}
          </Text>
        </>
      )}
    </View>
  );
}

function StatusChip(props: { active?: boolean; children: string }) {
  return (
    <View
      style={[
        styles.statusChip,
        props.active ? styles.statusChipActive : null,
      ]}
    >
      <Text
        style={[
          styles.statusChipLabel,
          props.active ? styles.statusChipLabelActive : null,
        ]}
      >
        {props.children}
      </Text>
    </View>
  );
}

export function SelectionChip(props: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{
        disabled: props.disabled ?? false,
        selected: props.active,
      }}
      testID={props.testID}
      style={[
        styles.choiceChip,
        props.active ? styles.choiceChipActive : null,
        props.disabled ? styles.choiceChipDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.choiceChipLabel,
          props.active ? styles.choiceChipLabelActive : null,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

export function SeatCard(props: {
  table: HoldemTable;
  seat: HoldemTable["seats"][number];
  copy: HoldemScreenCopy;
  formatAmount: HoldemAmountFormatter;
}) {
  const isOpen = props.seat.userId === null;
  const title = isOpen
    ? `${props.copy.openSeat} ${props.seat.seatIndex + 1}`
    : `${props.seat.displayName ?? `Seat ${props.seat.seatIndex + 1}`}${
        props.table.heroSeatIndex === props.seat.seatIndex
          ? ` · ${props.copy.you}`
          : ""
      }`;

  return (
    <View
      style={[
        styles.seatCard,
        isOpen
          ? styles.seatCardOpen
          : props.seat.winner
            ? styles.seatCardWinner
            : props.seat.isCurrentTurn
              ? styles.seatCardTurn
              : null,
      ]}
    >
      <View style={styles.seatHeader}>
        <View style={styles.seatHeaderBody}>
          <Text style={styles.seatTitle}>{title}</Text>
          {!isOpen ? (
            <View style={styles.seatBadgeRow}>
              <StatusChip active={props.seat.isDealer}>
                {props.copy.dealer}
              </StatusChip>
              <StatusChip active={props.seat.isSmallBlind}>
                {props.copy.smallBlind}
              </StatusChip>
              <StatusChip active={props.seat.isBigBlind}>
                {props.copy.bigBlind}
              </StatusChip>
              <StatusChip active={props.seat.isCurrentTurn}>
                {props.copy.turn}
              </StatusChip>
            </View>
          ) : null}
        </View>
        {!isOpen ? (
          <Text style={styles.seatStateLabel}>
            {getSeatStatusLabel(props.seat, props.copy)}
          </Text>
        ) : null}
      </View>

      {!isOpen ? (
        <>
          <View style={styles.cardRow}>
            {props.seat.cards.length > 0 ? (
              props.seat.cards.map((card, index) => (
                <PlayingCard
                  key={`${props.seat.seatIndex}-${card.rank ?? "hidden"}-${index}`}
                  card={card}
                />
              ))
            ) : (
              <View style={styles.placeholderCard}>
                <Text style={styles.placeholderCardLabel}>
                  {props.copy.waitingStatus}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.seatMetaGrid}>
            <View style={styles.seatMetaCard}>
              <Text style={styles.seatMetaLabel}>{props.copy.stack}</Text>
              <Text style={styles.seatMetaValue}>
                {props.formatAmount(props.seat.stackAmount)}
              </Text>
            </View>
            <View style={styles.seatMetaCard}>
              <Text style={styles.seatMetaLabel}>
                {props.copy.streetCommitted}
              </Text>
              <Text style={styles.seatMetaValue}>
                {props.formatAmount(props.seat.committedAmount)}
              </Text>
            </View>
            <View style={styles.seatMetaCard}>
              <Text style={styles.seatMetaLabel}>
                {props.copy.totalCommitted}
              </Text>
              <Text style={styles.seatMetaValue}>
                {props.formatAmount(props.seat.totalCommittedAmount)}
              </Text>
            </View>
          </View>

          {props.seat.bestHand ? (
            <Text style={styles.bestHandLabel}>{props.seat.bestHand.label}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function HoldemRouteSummary(props: {
  styles: MobileStyles;
  currentRoute: MobileAppRoute;
  routeLabels: MobileRouteLabels;
  routeNavigationLocked: boolean;
  onOpenRoute: (route: MobileAppRoute) => void;
  verificationCallout: ReactNode;
  screenCopy: HoldemScreenCopy;
  balance: string;
  summaryStatus: string;
  holdemRealtimeStatus: HoldemRealtimeConnectionStatus;
  formatAmount: HoldemAmountFormatter;
}) {
  return (
    <SectionCard
      title={props.screenCopy.routeTitle}
      subtitle={props.screenCopy.routeSubtitle}
    >
      <RouteSwitcher
        styles={props.styles}
        currentRoute={props.currentRoute}
        labels={props.routeLabels}
        navigationLocked={props.routeNavigationLocked}
        onOpenRoute={props.onOpenRoute}
      />
      <View style={props.styles.routeSummaryRow}>
        <View style={props.styles.routeSummaryCard}>
          <Text style={props.styles.routeSummaryLabel}>
            {props.screenCopy.summaryBalance}
          </Text>
          <Text style={props.styles.routeSummaryValue}>
            {props.formatAmount(props.balance)}
          </Text>
        </View>
        <View style={props.styles.routeSummaryCard}>
          <Text style={props.styles.routeSummaryLabel}>
            {props.screenCopy.summaryStatus}
          </Text>
          <Text style={props.styles.routeSummaryValue}>{props.summaryStatus}</Text>
        </View>
      </View>
      <View style={styles.realtimeBanner}>
        <Text style={styles.realtimeBannerLabel}>
          {getRealtimeStatusLabel(props.holdemRealtimeStatus, props.screenCopy)}
        </Text>
      </View>
      {props.verificationCallout}
    </SectionCard>
  );
}

export function HoldemTableChatCard(props: {
  chatDraft: string;
  heroSeatIndex: number | null;
  loadingHoldemMessages: boolean;
  onChangeChatDraft: (value: string) => void;
  onSendChatDraft: () => void;
  onSendEmoji: (emoji: (typeof holdemTableEmojiValues)[number]) => void;
  screenCopy: HoldemScreenCopy;
  sendingHoldemMessage: boolean;
  tableMessages: HoldemTableMessage[];
  inputStyle: MobileStyles["input"];
}) {
  const seated = props.heroSeatIndex !== null;
  const interactionDisabled = !seated || props.sendingHoldemMessage;

  return (
    <View style={styles.tableChatCard}>
      <View style={styles.tableChatHeader}>
        <Text style={styles.tableChatTitle}>
          {props.screenCopy.tableChat}
        </Text>
        {props.loadingHoldemMessages ? (
          <Text style={styles.tableChatMeta}>{props.screenCopy.summaryLoading}</Text>
        ) : null}
      </View>

      {props.tableMessages.length > 0 ? (
        <View style={styles.tableChatList}>
          {props.tableMessages.map((entry) => (
            <View key={`holdem-message-${entry.id}`} style={styles.tableChatBubble}>
              <View style={styles.tableChatBubbleHeader}>
                <Text style={styles.tableChatAuthor}>
                  {entry.displayName} · #{entry.seatIndex + 1}
                </Text>
                <Text style={styles.tableChatMeta}>
                  {formatReplayTimestamp(entry.createdAt)}
                </Text>
              </View>
              <Text style={styles.tableChatBody}>
                {entry.kind === "chat" ? entry.text : entry.emoji}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyStateLabel}>
          {props.screenCopy.tableChatEmpty}
        </Text>
      )}

      <View style={styles.tableChatEmojiRow}>
        {holdemTableEmojiValues.map((emoji) => (
          <Pressable
            key={emoji}
            onPress={() => props.onSendEmoji(emoji)}
            disabled={interactionDisabled}
            style={[
              styles.tableChatEmojiButton,
              interactionDisabled ? styles.tableChatEmojiButtonDisabled : null,
            ]}
          >
            <Text style={styles.tableChatEmojiLabel}>{emoji}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.tableChatHint}>
        {seated
          ? props.screenCopy.tableChatReactions
          : props.screenCopy.tableChatSeatOnly}
      </Text>

      <View style={styles.tableChatComposer}>
        <TextInput
          value={props.chatDraft}
          onChangeText={props.onChangeChatDraft}
          style={[props.inputStyle, styles.tableChatInput]}
          autoCorrect={false}
          maxLength={180}
          editable={!interactionDisabled}
          placeholder={props.screenCopy.tableChatPlaceholder}
          placeholderTextColor={palette.textMuted}
        />
        <ActionButton
          label={
            props.sendingHoldemMessage
              ? props.screenCopy.tableChatSending
              : props.screenCopy.tableChatSend
          }
          onPress={props.onSendChatDraft}
          disabled={interactionDisabled || props.chatDraft.trim().length === 0}
          compact
        />
      </View>
    </View>
  );
}

export function HoldemRecentHandsPanel(props: {
  activeTableName: string;
  formatAmount: HoldemAmountFormatter;
  loadingHoldemReplay: boolean;
  holdemReplayError: string | null;
  onCloseHoldemReplay: () => void;
  onOpenHoldemReplay: (roundId: string) => void;
  recentHands: HoldemTable["recentHands"];
  screenCopy: HoldemScreenCopy;
  selectedHoldemReplayRoundId: string | null;
  selectedReplay: HoldemReplayData | null;
}) {
  const replay = props.selectedReplay;

  return (
    <View style={styles.recentHandsList}>
      <Text style={styles.recentHandsTitle}>
        {props.screenCopy.recentHands}
      </Text>
      {props.recentHands.length > 0 ? (
        props.recentHands.map((hand) => {
          const roundId = hand.roundId;

          return (
            <View
              key={`hand-${hand.handNumber}`}
              style={styles.recentHandCard}
            >
              <View style={styles.recentHandHeader}>
                <Text style={styles.recentHandTitle}>
                  {props.screenCopy.hand} #{hand.handNumber}
                </Text>
                <View style={styles.recentHandHeaderActions}>
                  <Text style={styles.recentHandPot}>
                    {props.formatAmount(hand.potAmount)}
                  </Text>
                  {roundId ? (
                    <ActionButton
                      label={
                        props.selectedHoldemReplayRoundId === roundId
                          ? props.screenCopy.hideReplay
                          : props.screenCopy.viewReplay
                      }
                      onPress={() =>
                        props.selectedHoldemReplayRoundId === roundId
                          ? props.onCloseHoldemReplay()
                          : props.onOpenHoldemReplay(roundId)
                      }
                      variant="secondary"
                      compact
                    />
                  ) : null}
                </View>
              </View>
              <Text style={styles.recentHandMeta}>
                {props.screenCopy.winners}: {hand.winnerLabels.join(", ") || "--"}
              </Text>
              <Text style={styles.recentHandMeta}>
                {props.screenCopy.replayRake}:{" "}
                {props.formatAmount(hand.rakeAmount)}
              </Text>
              <View style={styles.cardRow}>
                {hand.boardCards.map((card, index) => (
                  <PlayingCard
                    key={`recent-${hand.handNumber}-${index}`}
                    card={{
                      rank: card.rank,
                      suit: card.suit,
                      hidden: false,
                    }}
                  />
                ))}
              </View>
            </View>
          );
        })
      ) : (
        <Text style={styles.emptyStateLabel}>
          {props.screenCopy.noRecentHands}
        </Text>
      )}

      {props.loadingHoldemReplay ? (
        <View style={styles.replayStatusCard}>
          <ActivityIndicator color={palette.accent} />
          <Text style={styles.replayStatusLabel}>
            {props.screenCopy.replayLoading}
          </Text>
        </View>
      ) : null}

      {props.holdemReplayError ? (
        <View style={styles.replayErrorCard}>
          <Text style={styles.replayErrorLabel}>
            {props.holdemReplayError}
          </Text>
        </View>
      ) : null}

      {replay ? (
        <View style={styles.replayCard}>
          <View style={styles.replayHeader}>
            <View style={styles.replayHeaderBody}>
              <Text style={styles.replaySectionLabel}>
                {props.screenCopy.replaySummary}
              </Text>
              <Text style={styles.replayTitle}>
                {props.screenCopy.hand} #{replay.handNumber ?? "--"} ·{" "}
                {getReplayStageLabel(replay.stage, props.screenCopy)}
              </Text>
              <Text style={styles.replaySubtitle}>
                {replay.tableName ?? props.activeTableName}
              </Text>
            </View>
            <ActionButton
              label={props.screenCopy.hideReplay}
              onPress={props.onCloseHoldemReplay}
              variant="secondary"
              compact
            />
          </View>

          <View style={styles.replayMetaGrid}>
            <View style={styles.replayMetaCard}>
              <Text style={styles.replayMetaLabel}>
                {props.screenCopy.replayStake}
              </Text>
              <Text style={styles.replayMetaValue}>
                {props.formatAmount(replay.stakeAmount)}
              </Text>
            </View>
            <View style={styles.replayMetaCard}>
              <Text style={styles.replayMetaLabel}>
                {props.screenCopy.replayPayout}
              </Text>
              <Text style={styles.replayMetaValue}>
                {props.formatAmount(replay.payoutAmount)}
              </Text>
            </View>
            <View style={styles.replayMetaCard}>
              <Text style={styles.replayMetaLabel}>
                {props.screenCopy.replayStartedAt}
              </Text>
              <Text style={styles.replayMetaValue}>
                {formatReplayTimestamp(replay.startedAt)}
              </Text>
            </View>
            <View style={styles.replayMetaCard}>
              <Text style={styles.replayMetaLabel}>
                {props.screenCopy.replaySettledAt}
              </Text>
              <Text style={styles.replayMetaValue}>
                {formatReplayTimestamp(replay.settledAt)}
              </Text>
            </View>
          </View>

          <View style={styles.replayFairnessCard}>
            <Text style={styles.replayMetaLabel}>
              {props.screenCopy.fairness}
            </Text>
            <Text style={styles.replayFairnessValue}>
              {replay.fairnessCommitHash ?? "--"}
            </Text>
          </View>

          <View style={styles.replayBlock}>
            <Text style={styles.replaySectionLabel}>
              {props.screenCopy.blinds}
            </Text>
            <Text style={styles.replaySummaryRow}>
              {props.formatAmount(replay.blinds.smallBlind ?? "0.00")} /{" "}
              {props.formatAmount(replay.blinds.bigBlind ?? "0.00")}
            </Text>
          </View>

          <View style={styles.replayBlock}>
            <Text style={styles.replaySectionLabel}>
              {props.screenCopy.board}
            </Text>
            <View style={styles.cardRow}>
              {replay.boardCards.length > 0 ? (
                replay.boardCards.map((card, index) => (
                  <PlayingCard
                    key={`replay-board-${index}`}
                    card={card}
                  />
                ))
              ) : (
                <Text style={styles.emptyStateLabel}>
                  {props.screenCopy.stagePreflop}
                </Text>
              )}
            </View>
          </View>

          {replay.pots.length > 0 ? (
            <View style={styles.replayPotGrid}>
              {replay.pots.map((pot) => (
                <View
                  key={`replay-pot-${pot.kind}-${pot.potIndex}`}
                  style={styles.replayPotCard}
                >
                  <Text style={styles.replayMetaLabel}>
                    {pot.kind === "main"
                      ? props.screenCopy.mainPot
                      : `${props.screenCopy.sidePot} ${pot.potIndex}`}
                  </Text>
                  <Text style={styles.replayMetaValue}>
                    {props.formatAmount(pot.amount)}
                  </Text>
                  <Text style={styles.recentHandMeta}>
                    {props.screenCopy.replayRake}:{" "}
                    {props.formatAmount(pot.rakeAmount)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.replayBlock}>
            <Text style={styles.replaySectionLabel}>
              {props.screenCopy.replayParticipants}
            </Text>
            <View style={styles.replayParticipantList}>
              {replay.participants.map((participant) => (
                <View
                  key={`replay-participant-${participant.seatIndex}`}
                  style={styles.replayParticipantCard}
                >
                  <View style={styles.replayParticipantHeader}>
                    <View style={styles.replayParticipantHeaderBody}>
                      <Text style={styles.replayParticipantTitle}>
                        {getReplaySeatLabel(
                          replay,
                          participant.seatIndex,
                          props.screenCopy,
                        )}
                      </Text>
                      <Text style={styles.replayParticipantMeta}>
                        {participant.bestHandLabel ?? participant.lastAction ?? "--"}
                      </Text>
                    </View>
                    {participant.winner ? (
                      <Text style={styles.replayParticipantWinner}>
                        {props.screenCopy.winners}
                      </Text>
                    ) : null}
                  </View>

                  {participant.holeCards.length > 0 ? (
                    <View style={styles.cardRow}>
                      {participant.holeCards.map((card, index) => (
                        <PlayingCard
                          key={`replay-hole-${participant.seatIndex}-${index}`}
                          card={card}
                        />
                      ))}
                    </View>
                  ) : null}

                  <View style={styles.replayMetaGrid}>
                    <View style={styles.replayMetaCard}>
                      <Text style={styles.replayMetaLabel}>
                        {props.screenCopy.totalCommitted}
                      </Text>
                      <Text style={styles.replayMetaValue}>
                        {participant.contributionAmount
                          ? props.formatAmount(participant.contributionAmount)
                          : "--"}
                      </Text>
                    </View>
                    <View style={styles.replayMetaCard}>
                      <Text style={styles.replayMetaLabel}>
                        {props.screenCopy.replayPayout}
                      </Text>
                      <Text style={styles.replayMetaValue}>
                        {participant.payoutAmount
                          ? props.formatAmount(participant.payoutAmount)
                          : "--"}
                      </Text>
                    </View>
                    <View style={styles.replayMetaCard}>
                      <Text style={styles.replayMetaLabel}>
                        {props.screenCopy.stack}
                      </Text>
                      <Text style={styles.replayMetaValue}>
                        {participant.stackAfter
                          ? props.formatAmount(participant.stackAfter)
                          : "--"}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.replayBlock}>
            <Text style={styles.replaySectionLabel}>
              {props.screenCopy.replayTimeline}
            </Text>
            <View style={styles.replayEventList}>
              {replay.events.map((event) => {
                const description = describeReplayEvent(
                  replay,
                  event,
                  props.screenCopy,
                );

                return (
                  <View
                    key={`replay-event-${event.sequence}`}
                    style={styles.replayEventCard}
                  >
                    <View style={styles.replayEventHeader}>
                      <View style={styles.replayEventHeaderBody}>
                        <Text style={styles.replayEventTitle}>
                          {description.title}
                        </Text>
                        <Text style={styles.replayEventMeta}>
                          {description.detail || "--"}
                        </Text>
                      </View>
                      <View style={styles.replayEventStamp}>
                        <Text style={styles.replayEventStampText}>
                          #{event.sequence}
                        </Text>
                        <Text style={styles.replayEventStampText}>
                          {formatReplayTimestamp(event.createdAt)}
                        </Text>
                      </View>
                    </View>

                    {description.cards.length > 0 ? (
                      <View style={styles.cardRow}>
                        {description.cards.map((card, index) => (
                          <PlayingCard
                            key={`replay-event-card-${event.sequence}-${index}`}
                            card={card}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
