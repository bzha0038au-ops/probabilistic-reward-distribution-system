import type {
  AppState,
  LiveDataState,
  PlayState,
  PlayStage,
  ScratchOutcome,
  ScratchSlot,
  StoredProgress,
} from "../app-types";
import { CONTINUE_LINES, REX_BUBBLES } from "../game-content";

export const STARTING_CASH = 20;

const DEFAULT_PROGRESS: StoredProgress = {
  bestTake: 40,
  runCount: 0,
  lastEnding: "Nobody has played yet.",
};

export function createInitialAppState(clientKey: string, storedProgress: StoredProgress): AppState {
  return createInitialAppStateWithLiveSeed(clientKey, storedProgress, {
    apiBaseUrl: "/api/user",
  });
}

export function createInitialAppStateWithLiveSeed(
  clientKey: string,
  storedProgress: StoredProgress,
  liveSeed: {
    apiBaseUrl: string;
    authToken?: string | null;
    rememberedEmail?: string;
  },
): AppState {
  return {
    activeTab: "play",
    runtimeMode: "preview",
    runtimeMessage: clientKey
      ? "Connecting to TikTok Minis runtime..."
      : "Running in local preview mode until you set a TikTok client key.",
    bestTake: storedProgress.bestTake,
    runCount: storedProgress.runCount,
    lastEnding: storedProgress.lastEnding,
    play: createIntroPlayState(STARTING_CASH),
    live: createInitialLiveDataState(liveSeed),
    eventLog: [],
  };
}

export function createInitialLiveDataState(seed: {
  apiBaseUrl: string;
  authToken?: string | null;
  rememberedEmail?: string;
}): LiveDataState {
  const hasSavedToken = Boolean(seed.authToken);

  return {
    apiBaseUrl: seed.apiBaseUrl,
    authToken: seed.authToken ?? null,
    rememberedEmail: seed.rememberedEmail ?? "",
    authStatus: hasSavedToken ? "loading" : "idle",
    authMessage: hasSavedToken
      ? "Restoring the last session from local storage."
      : "Sign in on the Profile tab to sync your real wallet and draw table.",
    dashboardStatus: "idle",
    dashboardMessage: hasSavedToken
      ? "Waking the wallet and draw engine."
      : "No live account connected yet.",
    drawStatus: "idle",
    drawMessage: "The live draw engine is standing by.",
    session: null,
    wallet: null,
    drawOverview: null,
    activity: [],
    notifications: [],
    notificationSummary: null,
    notificationPreferences: [],
    notificationFilter: "all",
    notificationUnreadOnly: false,
    notificationStatus: hasSavedToken ? "loading" : "idle",
    notificationMessage: hasSavedToken
      ? "Loading the notification queue and delivery rules."
      : "Sign in first before syncing alerts from the shared backend.",
    notificationMutating: false,
    rewardCenter: null,
    sessions: [],
    lastDraw: null,
    phoneDraft: "",
    phoneCodeDraft: "",
    phoneStatus: "idle",
    phoneMessage: hasSavedToken
      ? "Checking whether this account already cleared the phone gate."
      : "Sign in first, then add a phone number to unlock higher-trust actions.",
    phoneRequestSubmitting: false,
    phoneConfirmSubmitting: false,
    mfaSummary: null,
    mfaEnrollment: null,
    mfaCodeDraft: "",
    mfaStatus: hasSavedToken ? "loading" : "idle",
    mfaMessage: hasSavedToken
      ? "Checking whether MFA is already active on this account."
      : "Sign in first before opening a TOTP security lane.",
    mfaEnrollSubmitting: false,
    mfaVerifySubmitting: false,
    mfaDisableSubmitting: false,
  };
}

export function loadProgress(storage: Storage, storageKey: string): StoredProgress {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return DEFAULT_PROGRESS;
    }

    const parsed = JSON.parse(raw) as Partial<StoredProgress>;
    return {
      bestTake: typeof parsed.bestTake === "number" ? parsed.bestTake : DEFAULT_PROGRESS.bestTake,
      runCount: typeof parsed.runCount === "number" ? parsed.runCount : DEFAULT_PROGRESS.runCount,
      lastEnding: typeof parsed.lastEnding === "string" ? parsed.lastEnding : DEFAULT_PROGRESS.lastEnding,
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export function persistProgress(storage: Storage, storageKey: string, state: AppState): void {
  const payload: StoredProgress = {
    bestTake: state.bestTake,
    runCount: state.runCount,
    lastEnding: state.lastEnding,
  };

  storage.setItem(storageKey, JSON.stringify(payload));
}

export function createIntroPlayState(startingCash = STARTING_CASH): PlayState {
  return {
    stage: "intro",
    scenario: "bust",
    scratchTotal: startingCash,
    slots: [],
    continueLine: CONTINUE_LINES[0],
    rexStake: startingCash,
    rexCards: [
      { rank: "10", suit: "hearts" },
      { rank: "7", suit: "clubs" },
    ],
    yoyoCards: [
      { rank: "8", suit: "spades" },
      { rank: "6", suit: "diamonds" },
    ],
    rexDrawCard: { rank: "8", suit: "diamonds" },
    rexSpeech: REX_BUBBLES[0],
  };
}

export function createTicketPlayState(runSeed: number): PlayState {
  return createTicketPlayStateForScenario(runSeed, getScenarioForSeed(runSeed));
}

export function createPlayStateForStage(
  stage: PlayStage,
  options: {
    runCount: number;
    current: PlayState;
  },
): PlayState {
  const runSeed = Math.max(1, options.runCount || 1);
  const current = options.current;

  if (stage === "intro") {
    return createIntroPlayState(STARTING_CASH);
  }

  if (stage === "ticket") {
    return createTicketPlayStateForScenario(runSeed, resolveScenarioForStage(stage, current, runSeed));
  }

  if (stage === "decision") {
    const play = createTicketPlayStateForScenario(runSeed, resolveScenarioForStage(stage, current, runSeed));
    applyDecisionSnapshot(play);
    return play;
  }

  if (stage === "ticket-final") {
    const play = createTicketPlayStateForScenario(runSeed, resolveScenarioForStage(stage, current, runSeed));
    applyDecisionSnapshot(play);
    play.stage = "ticket-final";
    return play;
  }

  if (stage === "bust") {
    const play = createTicketPlayStateForScenario(runSeed, "bust");
    applyBustSnapshot(play);
    return play;
  }

  if (stage === "ticket-win") {
    const play = createTicketPlayStateForScenario(runSeed, "jackpot");
    applyTicketWinSnapshot(play);
    return play;
  }

  if (stage === "walk-away") {
    if (current.stage === "walk-away") {
      return clonePlayState(current);
    }

    if (current.stage === "ticket-win" || current.stage === "rex" || current.stage === "rex-win") {
      const play = clonePlayState(current);
      play.stage = "walk-away";
      play.scratchTotal = current.stage === "ticket-win" ? current.scratchTotal : current.rexStake;
      play.rexStake = play.scratchTotal;
      return play;
    }

    const play = createTicketPlayStateForScenario(runSeed, resolveScenarioForStage(stage, current, runSeed));
    applyDecisionSnapshot(play);
    play.stage = "walk-away";
    return play;
  }

  if (stage === "rex") {
    const play = createTicketPlayStateForScenario(runSeed, "jackpot");
    applyTicketWinSnapshot(play);
    play.stage = "rex";
    return play;
  }

  const play = createTicketPlayStateForScenario(runSeed, "jackpot");
  applyRexWinSnapshot(play);
  return play;
}

export function refreshBestTake(state: AppState, amount: number): void {
  if (amount > state.bestTake) {
    state.bestTake = amount;
  }
}

export function getDisplayCash(play: PlayState): number {
  switch (play.stage) {
    case "intro":
      return STARTING_CASH;
    case "ticket":
    case "decision":
    case "ticket-final":
    case "rex":
      return STARTING_CASH;
    case "bust":
      return 0;
    case "rex-win":
      return play.rexStake;
    default:
      return play.scratchTotal;
  }
}

export function getScratchableSlot(play: PlayState): ScratchSlot | undefined {
  return getNextScratchSlot(play.slots, play.stage);
}

export function getRevealedScratchCount(slots: ScratchSlot[]): number {
  return slots.filter((slot) => slot.revealed).length;
}

function createTicketPlayStateForScenario(runSeed: number, scenario: ScratchOutcome): PlayState {
  return {
    stage: "ticket",
    scenario,
    scratchTotal: 0,
    slots: createScratchSlots(scenario),
    continueLine: CONTINUE_LINES[(runSeed - 1) % CONTINUE_LINES.length],
    rexStake: 40,
    rexCards: [
      { rank: "10", suit: "hearts" },
      { rank: "7", suit: "clubs" },
    ],
    yoyoCards: [
      { rank: "8", suit: "spades" },
      { rank: "6", suit: "diamonds" },
    ],
    rexDrawCard: { rank: "8", suit: "diamonds" },
    rexSpeech: REX_BUBBLES[(runSeed - 1) % REX_BUBBLES.length],
  };
}

function clonePlayState(play: PlayState): PlayState {
  return {
    ...play,
    slots: play.slots.map((slot) => ({ ...slot })),
    rexCards: play.rexCards.map((card) => ({ ...card })),
    yoyoCards: play.yoyoCards.map((card) => ({ ...card })),
    rexDrawCard: { ...play.rexDrawCard },
  };
}

function resolveScenarioForStage(stage: PlayStage, current: PlayState, runSeed: number): ScratchOutcome {
  if (stage === "bust") {
    return "bust";
  }

  if (stage === "ticket-win" || stage === "rex" || stage === "rex-win") {
    return "jackpot";
  }

  if (current.stage !== "intro") {
    return current.scenario;
  }

  return getScenarioForSeed(Math.max(1, runSeed));
}

function getScenarioForSeed(runSeed: number): ScratchOutcome {
  return runSeed % 2 === 1 ? "bust" : "jackpot";
}

function applyDecisionSnapshot(play: PlayState): void {
  play.slots.forEach((slot) => {
    if (slot.id <= 1) {
      slot.revealed = true;
    }
  });
  play.scratchTotal = 40;
  play.stage = "decision";
}

function applyBustSnapshot(play: PlayState): void {
  applyDecisionSnapshot(play);
  const finalSlot = play.slots.find((slot) => slot.id === 2);
  if (finalSlot) {
    finalSlot.revealed = true;
  }
  play.scratchTotal = 0;
  play.stage = "bust";
}

function applyTicketWinSnapshot(play: PlayState): void {
  applyDecisionSnapshot(play);
  const finalSlot = play.slots.find((slot) => slot.id === 2);
  if (finalSlot) {
    finalSlot.revealed = true;
  }
  play.scratchTotal = 120;
  play.rexStake = 120;
  play.stage = "ticket-win";
}

function applyRexWinSnapshot(play: PlayState): void {
  applyTicketWinSnapshot(play);
  play.rexCards = [...play.rexCards, { ...play.rexDrawCard }];
  play.rexStake *= 2;
  play.stage = "rex-win";
}

function createScratchSlots(scenario: ScratchOutcome): ScratchSlot[] {
  return [
    { id: 0, label: "+$10", kind: "cash", amount: 10, revealed: false },
    { id: 1, label: "+$30", kind: "cash", amount: 30, revealed: false },
    {
      id: 2,
      label: scenario === "bust" ? "NOTHING" : "x3",
      kind: scenario === "bust" ? "bust" : "multiplier",
      amount: scenario === "bust" ? 0 : 3,
      revealed: false,
    },
  ];
}

function getNextScratchSlot(slots: ScratchSlot[], stage: PlayStage): ScratchSlot | undefined {
  if (stage === "decision") {
    return undefined;
  }

  if (stage === "ticket-final") {
    return slots.find((slot) => slot.id === 2 && !slot.revealed);
  }

  const revealedCount = getRevealedScratchCount(slots);
  if (revealedCount >= 2) {
    return undefined;
  }

  return slots.find((slot) => slot.id === revealedCount && !slot.revealed);
}
