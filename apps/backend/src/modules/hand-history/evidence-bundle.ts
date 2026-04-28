import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import type {
  HandHistory,
  HandHistoryEvent,
  HandHistoryEventPayload,
  HoldemDisputePayload,
  HoldemHandEvidence,
  HoldemReplayData,
  HoldemReplayParticipant,
  HoldemReplayPot,
  HoldemSignedEvidenceBundle,
} from "@reward/shared-types/hand-history";
import { HoldemSignedEvidenceBundleSchema } from "@reward/shared-types/hand-history";
import type { HoldemCardView } from "@reward/shared-types/holdem";

import { internalInvariantError, notFoundError } from "../../shared/errors";
import { parseSchema } from "../../shared/validation";
import { getHandHistory } from "./service";

const EVIDENCE_BUNDLE_KEY_ID_DEFAULT = "holdem-hand-history-evidence-v1";

const readSecret = (name: string) => (process.env[name] ?? "").trim();

const getEvidenceSigningSecret = () => {
  const dedicatedSecret = readSecret("HAND_HISTORY_EVIDENCE_SIGNING_SECRET");
  const fallbackSecret = readSecret("USER_JWT_SECRET");
  const rawSecret = dedicatedSecret || fallbackSecret;

  if (!rawSecret) {
    throw internalInvariantError(
      "HAND_HISTORY_EVIDENCE_SIGNING_SECRET or USER_JWT_SECRET must be set.",
    );
  }

  if (process.env.NODE_ENV === "production" && !dedicatedSecret) {
    throw internalInvariantError(
      "HAND_HISTORY_EVIDENCE_SIGNING_SECRET must be set in production.",
    );
  }

  return rawSecret;
};

const getEvidenceSigningKeyId = () =>
  readSecret("HAND_HISTORY_EVIDENCE_SIGNING_KEY_ID") ||
  EVIDENCE_BUNDLE_KEY_ID_DEFAULT;

const asObject = (
  value: unknown,
): Record<string, unknown> | HandHistoryEventPayload | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const readString = (value: unknown) =>
  typeof value === "string" ? value : null;

const readNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const readBoolean = (value: unknown) =>
  typeof value === "boolean" ? value : false;

const readDateLikeString = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
};

const toSerializableUnknown = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toSerializableUnknown(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = toSerializableUnknown(entry);
  }
  return output;
};

const toSerializableRecord = (value: unknown): Record<string, unknown> | null => {
  const serialized = toSerializableUnknown(value);
  if (!serialized || typeof serialized !== "object" || Array.isArray(serialized)) {
    return null;
  }
  return serialized as Record<string, unknown>;
};

const readNumberArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is number =>
          typeof entry === "number" && Number.isInteger(entry),
      )
    : [];

const toCardView = (value: unknown): HoldemCardView | null => {
  const card = asObject(value);
  const rank = readString(card?.rank);
  const suit = readString(card?.suit);
  if (!rank || !suit) {
    return null;
  }

  return {
    rank,
    suit,
    hidden: false,
  } as HoldemCardView;
};

const toCardViews = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((entry) => toCardView(entry))
        .filter((entry): entry is HoldemCardView => entry !== null)
    : [];

const toReplayPot = (value: unknown): HoldemReplayPot | null => {
  const pot = asObject(value);
  const kind = readString(pot?.kind);
  const amount = readString(pot?.amount);
  const potIndex = readNumber(pot?.potIndex);
  if (
    (kind !== "main" && kind !== "side") ||
    amount === null ||
    potIndex === null
  ) {
    return null;
  }

  return {
    potIndex,
    kind,
    amount,
    rakeAmount: readString(pot?.rakeAmount) ?? "0.00",
    eligibleSeatIndexes: readNumberArray(pot?.eligibleSeatIndexes),
    winnerSeatIndexes: readNumberArray(pot?.winnerSeatIndexes),
  };
};

const toReplayPots = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((entry) => toReplayPot(entry))
        .filter((entry): entry is HoldemReplayPot => entry !== null)
    : [];

const toReplayParticipant = (
  value: unknown,
): HoldemReplayParticipant | null => {
  const participant = asObject(value);
  const seatIndex = readNumber(participant?.seatIndex);
  if (seatIndex === null) {
    return null;
  }

  const bestHand = asObject(participant?.bestHand);
  return {
    seatIndex,
    userId: readNumber(participant?.userId),
    displayName: readString(participant?.displayName),
    contributionAmount: readString(participant?.contributionAmount),
    payoutAmount: readString(participant?.payoutAmount),
    stackBefore: readString(participant?.stackBefore),
    stackAfter: readString(participant?.stackAfter),
    winner: readBoolean(participant?.winner),
    status: readString(participant?.status),
    holeCards: toCardViews(participant?.holeCards),
    bestHandLabel: readString(bestHand?.label),
    lastAction: readString(participant?.lastAction),
  };
};

const toReplayParticipants = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((entry) => toReplayParticipant(entry))
        .filter((entry): entry is HoldemReplayParticipant => entry !== null)
        .sort((left, right) => left.seatIndex - right.seatIndex)
    : [];

const toReplayEvent = (
  event: HandHistoryEvent,
): HoldemReplayData["events"][number] => {
  const payload = asObject(event.payload);

  return {
    sequence: event.sequence,
    type: event.type,
    actor: event.actor,
    createdAt: readDateLikeString(event.createdAt) ?? "",
    stage: readString(payload?.stage) ?? readString(payload?.phase),
    seatIndex: readNumber(payload?.seatIndex),
    userId: readNumber(payload?.userId),
    action: readString(payload?.action),
    timeoutAction: readString(payload?.timeoutAction),
    amount: readString(payload?.amount),
    stackAmount: readString(payload?.stackAmount),
    committedAmount: readString(payload?.committedAmount),
    totalCommittedAmount: readString(payload?.totalCommittedAmount),
    lastAction: readString(payload?.lastAction),
    turnDeadlineAt: readString(payload?.turnDeadlineAt),
    turnTimeBankStartsAt: readString(payload?.turnTimeBankStartsAt),
    timeBankConsumedMs: readNumber(payload?.timeBankConsumedMs),
    timeBankRemainingMs: readNumber(payload?.timeBankRemainingMs),
    boardCards: toCardViews(payload?.boardCards),
    newCards: toCardViews(payload?.newCards),
    winnerSeatIndexes: readNumberArray(payload?.winnerSeatIndexes),
    revealedSeatIndexes: readNumberArray(payload?.revealedSeatIndexes),
    pots: toReplayPots(payload?.pots),
    participants: toReplayParticipants(payload?.participants),
  };
};

const toReplayTableEvent = (
  event: HandHistory["tableEvents"][number],
) => {
  const payload = asObject(event.payload);

  return {
    sequence: event.sequence,
    type: event.type,
    actor: event.actor,
    createdAt: readDateLikeString(event.createdAt) ?? "",
    phase: event.phase,
    seatIndex: event.seatIndex,
    userId: event.userId,
    handHistoryId: event.handHistoryId,
    action: readString(payload?.action),
    amount: readString(payload?.amount),
    turnDeadlineAt: readString(payload?.turnDeadlineAt),
    turnTimeBankStartsAt: readString(payload?.turnTimeBankStartsAt),
    timeBankConsumedMs: readNumber(payload?.timeBankConsumedMs),
    timeBankRemainingMs: readNumber(payload?.timeBankRemainingMs),
    winnerSeatIndexes: readNumberArray(payload?.winnerSeatIndexes),
    revealedSeatIndexes: readNumberArray(payload?.revealedSeatIndexes),
  };
};

const buildHoldemReplayData = (history: HandHistory): HoldemReplayData | null => {
  if (history.roundType !== "holdem") {
    return null;
  }

  const summary = asObject(history.summary);
  const fairness = asObject(history.fairness);
  const participants = toReplayParticipants(summary?.participants);
  const viewerSeatIndex =
    participants.find((participant) => participant.userId === history.userId)
      ?.seatIndex ?? null;

  return {
    roundId: history.roundId,
    userId: history.userId,
    startedAt: readDateLikeString(history.startedAt) ?? "",
    settledAt: readDateLikeString(history.settledAt),
    handNumber: readNumber(summary?.handNumber),
    tableId: readNumber(summary?.tableId),
    tableName: readString(summary?.tableName),
    status: history.status,
    stage: readString(summary?.stage),
    fairnessCommitHash: readString(fairness?.commitHash),
    totalRakeAmount: readString(summary?.totalRakeAmount),
    blinds: {
      smallBlind: readString(asObject(summary?.blinds)?.smallBlind),
      bigBlind: readString(asObject(summary?.blinds)?.bigBlind),
    },
    dealerSeatIndex: readNumber(summary?.dealerSeatIndex),
    smallBlindSeatIndex: readNumber(summary?.smallBlindSeatIndex),
    bigBlindSeatIndex: readNumber(summary?.bigBlindSeatIndex),
    pendingActorSeatIndex: readNumber(summary?.pendingActorSeatIndex),
    winnerSeatIndexes: readNumberArray(summary?.winnerSeatIndexes),
    revealedSeatIndexes: readNumberArray(summary?.revealedSeatIndexes),
    boardCards: toCardViews(summary?.boardCards),
    pots: toReplayPots(summary?.pots),
    participants,
    events: history.events.map((event) => toReplayEvent(event)),
    viewerSeatIndex,
    stakeAmount: history.stakeAmount,
    payoutAmount: history.payoutAmount,
  };
};

const buildHoldemDisputePayload = (
  history: HandHistory,
  exportedAt: string,
): HoldemDisputePayload | null => {
  const replay = buildHoldemReplayData(history);
  if (!replay) {
    return null;
  }

  return {
    schemaVersion: "holdem_dispute_payload_v1",
    exportedAt,
    roundId: history.roundId,
    referenceId: history.referenceId,
    userId: history.userId,
    status: history.status,
    stakeAmount: history.stakeAmount,
    totalStake: history.totalStake,
    payoutAmount: history.payoutAmount,
    startedAt: replay.startedAt,
    settledAt: replay.settledAt,
    tableId: replay.tableId,
    tableName: replay.tableName,
    handNumber: replay.handNumber,
    stage: replay.stage,
    fairnessCommitHash: replay.fairnessCommitHash,
    viewerSeatIndex: replay.viewerSeatIndex,
    eventCount: replay.events.length,
    tableEventCount: history.tableEvents.length,
    participantCount: replay.participants.length,
    winnerSeatIndexes: replay.winnerSeatIndexes,
    totalRakeAmount: replay.totalRakeAmount,
    pots: replay.pots,
    participants: replay.participants.map((participant) => ({
      seatIndex: participant.seatIndex,
      userId: participant.userId,
      displayName: participant.displayName,
      contributionAmount: participant.contributionAmount,
      payoutAmount: participant.payoutAmount,
      winner: participant.winner,
      bestHandLabel: participant.bestHandLabel,
      lastAction: participant.lastAction,
    })),
    events: replay.events.map((event) => ({
      sequence: event.sequence,
      type: event.type,
      actor: event.actor,
      createdAt: event.createdAt,
      stage: event.stage,
      seatIndex: event.seatIndex,
      userId: event.userId,
      action: event.action,
      timeoutAction: event.timeoutAction,
      amount: event.amount,
      turnTimeBankStartsAt: event.turnTimeBankStartsAt,
      timeBankConsumedMs: event.timeBankConsumedMs,
      timeBankRemainingMs: event.timeBankRemainingMs,
      winnerSeatIndexes: event.winnerSeatIndexes,
      revealedSeatIndexes: event.revealedSeatIndexes,
    })),
    tableEvents: history.tableEvents.map((event) => toReplayTableEvent(event)),
  };
};

const buildHoldemHandEvidence = (
  history: HandHistory,
  exportedAt: string,
): HoldemHandEvidence | null => {
  const replay = buildHoldemReplayData(history);
  const disputePayload = buildHoldemDisputePayload(history, exportedAt);
  if (!replay || !disputePayload) {
    return null;
  }

  return {
    schemaVersion: "holdem_hand_evidence_v1",
    exportedAt,
    disputePayload,
    replay,
    history: {
      roundId: history.roundId,
      roundType: history.roundType,
      referenceId: history.referenceId,
      userId: history.userId,
      status: history.status,
      stakeAmount: history.stakeAmount,
      totalStake: history.totalStake,
      payoutAmount: history.payoutAmount,
      fairness: toSerializableRecord(history.fairness),
      summary: toSerializableRecord(history.summary),
      startedAt: readDateLikeString(history.startedAt) ?? "",
      settledAt: readDateLikeString(history.settledAt),
      events: history.events.map((event) => ({
        sequence: event.sequence,
        type: event.type,
        actor: event.actor,
        payload: toSerializableRecord(event.payload) ?? {},
        createdAt: readDateLikeString(event.createdAt) ?? "",
      })),
      tableEvents: history.tableEvents.map((event) => ({
        sequence: event.sequence,
        type: event.type,
        actor: event.actor,
        seatIndex: event.seatIndex,
        userId: event.userId,
        handHistoryId: event.handHistoryId,
        phase: event.phase,
        payload: toSerializableRecord(event.payload) ?? {},
        createdAt: readDateLikeString(event.createdAt) ?? "",
      })),
    },
  };
};

const formatSeatLabel = (
  replay: HoldemReplayData,
  seatIndex: number | null,
) => {
  if (seatIndex === null) {
    return "—";
  }

  const participant =
    replay.participants.find((entry) => entry.seatIndex === seatIndex) ?? null;
  const label = participant?.displayName || `Seat ${seatIndex + 1}`;
  return replay.viewerSeatIndex === seatIndex ? `${label} (viewer)` : label;
};

const buildSummaryPage = (params: {
  history: HandHistory;
  replay: HoldemReplayData;
  exportedAt: string;
}) => {
  const { history, replay, exportedAt } = params;
  const handLabel =
    replay.handNumber !== null ? `Hand #${replay.handNumber}` : "Hand";
  const tableLabel =
    replay.tableName ??
    (replay.tableId !== null ? `Table #${replay.tableId}` : "Hold'em table");
  const winnerLabels = replay.winnerSeatIndexes.map((seatIndex) =>
    formatSeatLabel(replay, seatIndex),
  );
  const viewerLabel = formatSeatLabel(replay, replay.viewerSeatIndex);
  const overview = [
    { label: "Round id", value: history.roundId },
    { label: "Reference id", value: String(history.referenceId) },
    { label: "Table", value: tableLabel },
    { label: "Status", value: history.status },
    { label: "Viewer seat", value: viewerLabel },
    { label: "Stake", value: history.stakeAmount },
    { label: "Payout", value: history.payoutAmount },
    {
      label: "Fairness commit",
      value: replay.fairnessCommitHash ?? "Unavailable",
    },
    { label: "Event count", value: String(history.events.length) },
    { label: "Table event count", value: String(history.tableEvents.length) },
  ];
  const highlights = [
    `${handLabel} on ${tableLabel} ${replay.settledAt ? `settled at ${replay.settledAt}` : "is archived"} with status ${history.status}.`,
    `Viewer stake ${history.stakeAmount}, payout ${history.payoutAmount}${replay.totalRakeAmount ? `, rake ${replay.totalRakeAmount}` : ""}.`,
    winnerLabels.length > 0
      ? `Winning seats: ${winnerLabels.join(", ")}.`
      : "Winning seats were not recorded.",
  ];
  const markdown = [
    "# Hold'em Evidence Summary",
    "",
    `${handLabel} · ${tableLabel}`,
    "",
    "## Overview",
    ...overview.map((entry) => `- ${entry.label}: ${entry.value}`),
    "",
    "## Highlights",
    ...highlights.map((entry) => `- ${entry}`),
    "",
    "## Timeline",
    ...history.events.map(
      (event) =>
        `- [${readDateLikeString(event.createdAt) ?? "unknown"}] ${event.type}`,
    ),
    "",
    "## Table Context",
    ...history.tableEvents.map(
      (event) =>
        `- [${readDateLikeString(event.createdAt) ?? "unknown"}] ${event.type}`,
    ),
  ].join("\n");

  return {
    title: "Hold'em Evidence Summary",
    subtitle: `${handLabel} · ${tableLabel}`,
    generatedAt: exportedAt,
    overview,
    highlights,
    markdown,
  };
};

const canonicalizeJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeJson(entry)).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(
      ([key, entry]) => `${JSON.stringify(key)}:${canonicalizeJson(entry)}`,
    )
    .join(",")}}`;
};

const createEvidenceBundleSignature = (payload: {
  schemaVersion: HoldemSignedEvidenceBundle["schemaVersion"];
  roundId: string;
  referenceId: number;
  exportedAt: string;
  summaryPage: HoldemSignedEvidenceBundle["summaryPage"];
  disputePayload: HoldemDisputePayload;
  evidence: HoldemHandEvidence;
}) => {
  const canonicalPayload = canonicalizeJson(payload);
  const payloadDigest = createHash("sha256")
    .update(canonicalPayload, "utf8")
    .digest("hex");
  const signature = createHmac("sha256", getEvidenceSigningSecret())
    .update(canonicalPayload, "utf8")
    .digest("hex");

  return {
    algorithm: "hmac-sha256" as const,
    keyId: getEvidenceSigningKeyId(),
    payloadDigest,
    signature,
  };
};

const toVerificationBuffer = (value: string) => Buffer.from(value, "hex");

export const buildHoldemSignedEvidenceBundle = (
  history: HandHistory,
  exportedAt = new Date(),
): HoldemSignedEvidenceBundle => {
  const replay = buildHoldemReplayData(history);
  const exportedAtIso = exportedAt.toISOString();
  const disputePayload = buildHoldemDisputePayload(history, exportedAtIso);
  const evidence = buildHoldemHandEvidence(history, exportedAtIso);

  if (!replay || !disputePayload || !evidence) {
    throw notFoundError("Evidence bundle not available.");
  }

  const summaryPage = buildSummaryPage({
    history,
    replay,
    exportedAt: exportedAtIso,
  });
  const signature = createEvidenceBundleSignature({
    schemaVersion: "holdem_signed_evidence_bundle_v1",
    roundId: history.roundId,
    referenceId: history.referenceId,
    exportedAt: exportedAtIso,
    summaryPage,
    disputePayload,
    evidence,
  });

  const parsed = parseSchema(HoldemSignedEvidenceBundleSchema, {
    schemaVersion: "holdem_signed_evidence_bundle_v1",
    roundId: history.roundId,
    referenceId: history.referenceId,
    exportedAt: exportedAtIso,
    summaryPage,
    disputePayload,
    evidence,
    signature,
  });

  if (!parsed.isValid) {
    throw internalInvariantError("Failed to build signed holdem evidence bundle.");
  }

  return parsed.data;
};

export const verifyHoldemSignedEvidenceBundle = (
  bundle: HoldemSignedEvidenceBundle,
) => {
  const unsignedPayload = {
    schemaVersion: bundle.schemaVersion,
    roundId: bundle.roundId,
    referenceId: bundle.referenceId,
    exportedAt: bundle.exportedAt,
    summaryPage: bundle.summaryPage,
    disputePayload: bundle.disputePayload,
    evidence: bundle.evidence,
  };
  const canonicalPayload = canonicalizeJson(unsignedPayload);
  const payloadDigest = createHash("sha256")
    .update(canonicalPayload, "utf8")
    .digest("hex");
  const signature = createHmac("sha256", getEvidenceSigningSecret())
    .update(canonicalPayload, "utf8")
    .digest("hex");
  const expectedBuffer = toVerificationBuffer(signature);
  const actualBuffer = toVerificationBuffer(bundle.signature.signature);

  return (
    bundle.signature.payloadDigest === payloadDigest &&
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

export const getHandHistoryEvidenceBundle = async (
  userId: number,
  roundId: string,
) => {
  const history = await getHandHistory(userId, roundId);

  if (history.roundType !== "holdem") {
    throw notFoundError("Evidence bundle not available.");
  }

  return buildHoldemSignedEvidenceBundle(history);
};
