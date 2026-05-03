import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { holdemTableEmojiValues } from "@reward/shared-types/holdem";
import type {
  HoldemAction,
  HoldemTableMessage,
  HoldemTableResponse,
  HoldemTablesResponse,
  HoldemTableType,
} from "@reward/shared-types/holdem";
import type {
  HandHistory,
  HoldemSignedEvidenceBundle,
} from "@reward/shared-types/hand-history";
import type {
  PlayModeSnapshot,
  PlayModeType,
} from "@reward/shared-types/play-mode";
import {
  buildHoldemReplayData,
  type HoldemRealtimeConnectionStatus,
} from "@reward/user-core";

import type { MobileRouteLabels, MobileRouteScreens } from "../route-copy";
import { mobilePalette as palette } from "../theme";
import type { PlayModeCopy } from "../ui";
import { PlayModeSelector, SectionCard } from "../ui";
import { HoldemRouteSummary } from "./holdem-route-screen.components";
import { HoldemReplayDetail } from "./holdem-replay-detail";
import {
  HoldemActiveTablePanel,
  HoldemLobbyPanel,
} from "./holdem-route-screen.sections";
import { holdemRouteScreenStyles as styles } from "./holdem-route-screen.styles";
import type { MobileAppRoute, MobileStyles } from "./types";

type HoldemRouteScreenProps = {
  styles: MobileStyles;
  currentRoute: MobileAppRoute;
  routeLabels: MobileRouteLabels;
  routeNavigationLocked: boolean;
  onOpenRoute: (route: MobileAppRoute) => void;
  verificationCallout: ReactNode;
  screenCopy: MobileRouteScreens["holdem"];
  balance: string;
  playModeCopy: PlayModeCopy;
  formatAmount: (value: string) => string;
  emailVerified: boolean;
  holdemPlayMode: PlayModeSnapshot | null;
  updatingHoldemPlayMode: boolean;
  holdemTables: HoldemTablesResponse | null;
  selectedHoldemTable: HoldemTableResponse | null;
  selectedHoldemReplayRoundId: string | null;
  selectedHoldemReplay: HandHistory | null;
  loadingHoldemLobby: boolean;
  loadingHoldemTable: boolean;
  loadingHoldemReplay: boolean;
  holdemReplayError: string | null;
  holdemRealtimeStatus: HoldemRealtimeConnectionStatus;
  actingHoldem:
    | "create"
    | "join"
    | "leave"
    | "start"
    | "sitOut"
    | "sitIn"
    | HoldemAction
    | null;
  holdemTableName: string;
  holdemBuyInAmount: string;
  holdemCreateTableType: HoldemTableType;
  holdemCreateMaxSeats: number;
  holdemTournamentStartingStackAmount: string;
  holdemTournamentPayoutPlaces: string;
  holdemActionAmount: string;
  holdemTableMessages: HoldemTableMessage[];
  loadingHoldemMessages: boolean;
  sendingHoldemMessage: boolean;
  onChangeHoldemTableName: (value: string) => void;
  onChangeHoldemBuyInAmount: (value: string) => void;
  onChangeHoldemCreateTableType: (value: HoldemTableType) => void;
  onChangeHoldemCreateMaxSeats: (value: number) => void;
  onChangeHoldemTournamentStartingStackAmount: (value: string) => void;
  onChangeHoldemTournamentPayoutPlaces: (value: string) => void;
  onChangeHoldemActionAmount: (value: string) => void;
  onChangeHoldemPlayMode: (type: PlayModeType) => void;
  onSelectHoldemTable: (tableId: number) => void;
  onCreateHoldemTable: () => void;
  onJoinHoldemTable: (tableId: number) => void;
  onLeaveHoldemTable: (tableId: number) => void;
  onSetHoldemSeatMode: (tableId: number, sittingOut: boolean) => void;
  onStartHoldemTable: (tableId: number) => void;
  onRefreshHoldemLobby: () => void;
  onRefreshHoldemTable: (tableId: number) => void;
  onActOnHoldemTable: (tableId: number, action: HoldemAction) => void;
  onSendHoldemChatMessage: (tableId: number, text: string) => Promise<boolean>;
  onSendHoldemEmoji: (
    tableId: number,
    emoji: (typeof holdemTableEmojiValues)[number],
  ) => Promise<boolean>;
  onOpenHoldemReplay: (roundId: string) => void;
  onCloseHoldemReplay: () => void;
  loadHoldemEvidenceBundle: (
    roundId: string,
  ) => Promise<HoldemSignedEvidenceBundle | null>;
};

export function HoldemRouteScreen(props: HoldemRouteScreenProps) {
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const [chatDraft, setChatDraft] = useState("");

  const activeTable = props.selectedHoldemTable?.table ?? null;
  const selectedReplay =
    props.selectedHoldemReplay &&
    props.selectedHoldemReplay.roundId === props.selectedHoldemReplayRoundId
      ? buildHoldemReplayData(props.selectedHoldemReplay)
      : null;
  const showingReplayDetail = props.selectedHoldemReplayRoundId !== null;
  const effectiveBuyInPreview = (() => {
    const numericBuyIn = Number(props.holdemBuyInAmount || "0");
    const multiplier = props.holdemPlayMode?.appliedMultiplier ?? 1;
    if (!Number.isFinite(numericBuyIn) || multiplier <= 1) {
      return null;
    }

    return props.formatAmount((numericBuyIn * multiplier).toFixed(2));
  })();
  const canStartActiveTable =
    activeTable === null
      ? false
      : Boolean(
          props.holdemTables?.tables.find((table) => table.id === activeTable.id)?.canStart,
        );
  const summaryStatus =
    props.loadingHoldemLobby || props.loadingHoldemTable
      ? props.screenCopy.summaryLoading
      : activeTable
        ? activeTable.status === "active"
          ? props.screenCopy.activeStatus
          : props.screenCopy.waitingStatus
        : "—";

  useEffect(() => {
    if (!activeTable?.pendingActorDeadlineAt) {
      return;
    }

    setClockNowMs(Date.now());
    const interval = setInterval(() => {
      setClockNowMs(Date.now());
    }, 250);
    return () => clearInterval(interval);
  }, [activeTable?.pendingActorDeadlineAt, activeTable?.pendingActorTimeBankStartsAt]);

  useEffect(() => {
    setChatDraft("");
  }, [activeTable?.id]);

  const handleSendChatDraft = () => {
    const nextDraft = chatDraft.trim();
    if (!activeTable || !nextDraft) {
      return;
    }

    void props.onSendHoldemChatMessage(activeTable.id, nextDraft).then((sent) => {
      if (sent) {
        setChatDraft("");
      }
    });
  };

  const handleSendHoldemEmoji = (
    emoji: (typeof holdemTableEmojiValues)[number],
  ) => {
    if (!activeTable) {
      return;
    }

    void props.onSendHoldemEmoji(activeTable.id, emoji);
  };

  const routeSummary = (
    <HoldemRouteSummary
      styles={props.styles}
      currentRoute={props.currentRoute}
      routeLabels={props.routeLabels}
      routeNavigationLocked={props.routeNavigationLocked}
      onOpenRoute={props.onOpenRoute}
      verificationCallout={props.verificationCallout}
      screenCopy={props.screenCopy}
      balance={props.balance}
      summaryStatus={summaryStatus}
      holdemRealtimeStatus={props.holdemRealtimeStatus}
      formatAmount={props.formatAmount}
    />
  );

  if (showingReplayDetail) {
    return (
      <>
        {routeSummary}

        <SectionCard title={props.screenCopy.replayDetailTitle}>
          {props.loadingHoldemReplay ? (
            <View style={styles.replayStatusCard}>
              <ActivityIndicator color={palette.accent} />
              <Text style={styles.replayStatusLabel}>
                {props.screenCopy.replayLoading}
              </Text>
            </View>
          ) : props.holdemReplayError ? (
            <View style={styles.replayErrorCard}>
              <Text style={styles.replayErrorLabel}>
                {props.holdemReplayError}
              </Text>
            </View>
          ) : props.selectedHoldemReplay ? (
            <HoldemReplayDetail
              history={props.selectedHoldemReplay}
              screenCopy={props.screenCopy}
              formatAmount={props.formatAmount}
              onBack={props.onCloseHoldemReplay}
              loadEvidenceBundle={props.loadHoldemEvidenceBundle}
            />
          ) : (
            <View style={styles.replayErrorCard}>
              <Text style={styles.replayErrorLabel}>
                {props.screenCopy.replayFailed}
              </Text>
            </View>
          )}
        </SectionCard>
      </>
    );
  }

  return (
    <>
      {routeSummary}

      <PlayModeSelector
        copy={props.playModeCopy}
        gameKey="holdem"
        snapshot={props.holdemPlayMode}
        disabled={props.updatingHoldemPlayMode || props.actingHoldem !== null}
        onSelect={props.onChangeHoldemPlayMode}
      />

      <SectionCard title={props.screenCopy.sectionTitle}>
        <HoldemLobbyPanel
          activeTableId={activeTable?.id ?? null}
          actingHoldem={props.actingHoldem}
          emailVerified={props.emailVerified}
          effectiveBuyInPreview={effectiveBuyInPreview}
          formatAmount={props.formatAmount}
          holdemBuyInAmount={props.holdemBuyInAmount}
          holdemCreateMaxSeats={props.holdemCreateMaxSeats}
          holdemCreateTableType={props.holdemCreateTableType}
          holdemTableName={props.holdemTableName}
          holdemTables={props.holdemTables}
          holdemTournamentPayoutPlaces={props.holdemTournamentPayoutPlaces}
          holdemTournamentStartingStackAmount={props.holdemTournamentStartingStackAmount}
          loadingHoldemLobby={props.loadingHoldemLobby}
          onChangeHoldemBuyInAmount={props.onChangeHoldemBuyInAmount}
          onChangeHoldemCreateMaxSeats={props.onChangeHoldemCreateMaxSeats}
          onChangeHoldemCreateTableType={props.onChangeHoldemCreateTableType}
          onChangeHoldemTableName={props.onChangeHoldemTableName}
          onChangeHoldemTournamentPayoutPlaces={props.onChangeHoldemTournamentPayoutPlaces}
          onChangeHoldemTournamentStartingStackAmount={
            props.onChangeHoldemTournamentStartingStackAmount
          }
          onCreateHoldemTable={props.onCreateHoldemTable}
          onRefreshHoldemLobby={props.onRefreshHoldemLobby}
          onSelectHoldemTable={props.onSelectHoldemTable}
          screenCopy={props.screenCopy}
          uiStyles={props.styles}
        />

        {activeTable ? (
          <HoldemActiveTablePanel
            activeTable={activeTable}
            balance={props.balance}
            canStart={canStartActiveTable}
            chatDraft={chatDraft}
            clockNowMs={clockNowMs}
            actingHoldem={props.actingHoldem}
            emailVerified={props.emailVerified}
            formatAmount={props.formatAmount}
            holdemActionAmount={props.holdemActionAmount}
            holdemReplayError={props.holdemReplayError}
            holdemTableMessages={props.holdemTableMessages}
            loadingHoldemMessages={props.loadingHoldemMessages}
            loadingHoldemReplay={props.loadingHoldemReplay}
            loadingHoldemTable={props.loadingHoldemTable}
            onActOnHoldemTable={props.onActOnHoldemTable}
            onChangeChatDraft={setChatDraft}
            onChangeHoldemActionAmount={props.onChangeHoldemActionAmount}
            onCloseHoldemReplay={props.onCloseHoldemReplay}
            onJoinHoldemTable={props.onJoinHoldemTable}
            onLeaveHoldemTable={props.onLeaveHoldemTable}
            onOpenHoldemReplay={props.onOpenHoldemReplay}
            onRefreshHoldemTable={props.onRefreshHoldemTable}
            onSendChatDraft={handleSendChatDraft}
            onSendEmoji={handleSendHoldemEmoji}
            onSetHoldemSeatMode={props.onSetHoldemSeatMode}
            onStartHoldemTable={props.onStartHoldemTable}
            screenCopy={props.screenCopy}
            selectedHoldemReplayRoundId={props.selectedHoldemReplayRoundId}
            selectedReplay={selectedReplay}
            sendingHoldemMessage={props.sendingHoldemMessage}
            uiStyles={props.styles}
          />
        ) : (
          <Text style={styles.emptyStateLabel}>{props.screenCopy.noSelection}</Text>
        )}
      </SectionCard>
    </>
  );
}
