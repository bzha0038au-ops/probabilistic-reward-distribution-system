const asObject = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value;
};
const readString = (value) => typeof value === "string" ? value : null;
const readNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
const readBoolean = (value) => typeof value === "boolean" ? value : false;
const readDateLikeString = (value) => {
    if (typeof value === "string") {
        return value;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    return null;
};
const toSerializableUnknown = (value) => {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.map((entry) => toSerializableUnknown(entry));
    }
    if (!value || typeof value !== "object") {
        return value;
    }
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
        output[key] = toSerializableUnknown(entry);
    }
    return output;
};
const toSerializableRecord = (value) => {
    const serialized = toSerializableUnknown(value);
    if (!serialized || typeof serialized !== "object" || Array.isArray(serialized)) {
        return null;
    }
    return serialized;
};
const readNumberArray = (value) => Array.isArray(value)
    ? value.filter((entry) => typeof entry === "number" && Number.isInteger(entry))
    : [];
const toCardView = (value) => {
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
    };
};
const toCardViews = (value) => Array.isArray(value)
    ? value
        .map((entry) => toCardView(entry))
        .filter((entry) => entry !== null)
    : [];
const toReplayPot = (value) => {
    const pot = asObject(value);
    const kind = readString(pot?.kind);
    const amount = readString(pot?.amount);
    const potIndex = readNumber(pot?.potIndex);
    if ((kind !== "main" && kind !== "side") ||
        amount === null ||
        potIndex === null) {
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
const toReplayPots = (value) => Array.isArray(value)
    ? value
        .map((entry) => toReplayPot(entry))
        .filter((entry) => entry !== null)
    : [];
const toReplayParticipant = (value) => {
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
const toReplayParticipants = (value) => Array.isArray(value)
    ? value
        .map((entry) => toReplayParticipant(entry))
        .filter((entry) => entry !== null)
        .sort((left, right) => left.seatIndex - right.seatIndex)
    : [];
const toReplayEvent = (event) => {
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
const toReplayTableEvent = (event) => {
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
export const buildHoldemReplayData = (history) => {
    if (history.roundType !== "holdem") {
        return null;
    }
    const summary = asObject(history.summary);
    const fairness = asObject(history.fairness);
    const participants = toReplayParticipants(summary?.participants);
    const viewerSeatIndex = participants.find((participant) => participant.userId === history.userId)
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
export const buildHoldemDisputePayload = (history) => {
    const replay = buildHoldemReplayData(history);
    if (!replay) {
        return null;
    }
    return {
        schemaVersion: "holdem_dispute_payload_v1",
        exportedAt: new Date().toISOString(),
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
export const buildHoldemHandEvidence = (history) => {
    const replay = buildHoldemReplayData(history);
    const disputePayload = buildHoldemDisputePayload(history);
    if (!replay || !disputePayload) {
        return null;
    }
    return {
        schemaVersion: "holdem_hand_evidence_v1",
        exportedAt: disputePayload.exportedAt,
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
export const findReplayParticipant = (replay, seatIndex) => seatIndex === null
    ? null
    : replay.participants.find((participant) => participant.seatIndex === seatIndex) ??
        null;
