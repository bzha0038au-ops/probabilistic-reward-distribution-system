import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  HOLDEM_CONFIG,
  HOLDEM_DEFAULT_PRESENCE_HEARTBEAT_MS,
  HOLDEM_REALTIME_LOBBY_TOPIC,
  HOLDEM_TABLE_MESSAGE_LIMIT,
  buildHoldemRealtimeTableTopic,
  type HoldemRealtimeObservationSurface,
  type HoldemAction,
  type HoldemTableType,
  type HoldemTableMessage,
  type HoldemTableMessageRequest,
  type HoldemTableResponse,
  type HoldemTablesResponse,
} from "@reward/shared-types/holdem";
import type {
  PlayModeSnapshot,
  PlayModeType,
} from "@reward/shared-types/play-mode";
import type {
  HandHistory,
  HoldemSignedEvidenceBundle,
} from "@reward/shared-types/hand-history";
import {
  applyHoldemTableMessage,
  applyHoldemPrivateRealtimeUpdate,
  applyHoldemRealtimeUpdate,
  createHoldemRealtimeClient,
  createUserApiClient,
  type HoldemRealtimeClient,
  type HoldemRealtimeConnectionStatus,
  type HoldemRealtimeObservation,
} from "@reward/user-core";

type UnauthorizedHandler = (message: string) => Promise<boolean>;
type IntervalHandle = ReturnType<typeof setInterval>;
type TimeoutHandle = ReturnType<typeof setTimeout>;
const DEFAULT_HOLDEM_TOURNAMENT_STARTING_STACK_AMOUNT = "1000.00";
const DEFAULT_HOLDEM_TOURNAMENT_PAYOUT_PLACES = "1";

type HoldemApi = Pick<
  ReturnType<typeof createUserApiClient>,
  | "getHoldemTables"
  | "getHoldemTable"
  | "getHoldemTableMessages"
  | "getHandHistory"
  | "getHandHistoryEvidenceBundle"
  | "postHoldemTableMessage"
  | "reportHoldemRealtimeObservations"
  | "getPlayMode"
  | "setPlayMode"
  | "touchHoldemTablePresence"
  | "setHoldemSeatMode"
  | "createHoldemTable"
  | "joinHoldemTable"
  | "leaveHoldemTable"
  | "startHoldemTable"
  | "actOnHoldemTable"
>;

type HoldemBusyAction =
  | "create"
  | "join"
  | "leave"
  | "start"
  | "sitOut"
  | "sitIn"
  | HoldemAction
  | null;

type HoldemCreateTableType = HoldemTableType;

type UseHoldemOptions = {
  api: HoldemApi;
  authTokenRef: MutableRefObject<string | null>;
  handleUnauthorizedRef: MutableRefObject<UnauthorizedHandler | null>;
  enabled: boolean;
  observabilitySurface: HoldemRealtimeObservationSurface;
  realtimeBaseUrl: string;
  refreshBalance: () => Promise<boolean>;
  resetFeedback: () => void;
  setError: (message: string | null) => void;
};

const HOLDEM_REALTIME_OBSERVATION_BATCH_SIZE = 20;
const HOLDEM_REALTIME_OBSERVATION_FLUSH_INTERVAL_MS = 5_000;
const HOLDEM_REALTIME_OBSERVATION_MAX_PENDING = 100;

export function useHoldem(options: UseHoldemOptions) {
  const {
    api,
    authTokenRef,
    handleUnauthorizedRef,
    enabled,
    observabilitySurface,
    realtimeBaseUrl,
    refreshBalance,
    resetFeedback,
    setError,
  } = options;

  const [holdemTables, setHoldemTables] = useState<HoldemTablesResponse | null>(
    null,
  );
  const [holdemPlayMode, setHoldemPlayModeState] =
    useState<PlayModeSnapshot | null>(null);
  const [updatingHoldemPlayMode, setUpdatingHoldemPlayMode] = useState(false);
  const [selectedHoldemTableId, setSelectedHoldemTableId] = useState<
    number | null
  >(null);
  const [selectedHoldemTable, setSelectedHoldemTable] =
    useState<HoldemTableResponse | null>(null);
  const [holdemTableName, setHoldemTableName] = useState("");
  const [holdemBuyInAmount, setHoldemBuyInAmount] = useState(
    HOLDEM_CONFIG.minimumBuyIn,
  );
  const [holdemCreateTableType, setHoldemCreateTableType] =
    useState<HoldemCreateTableType>("casual");
  const [holdemCreateMaxSeats, setHoldemCreateMaxSeats] = useState(2);
  const [
    holdemTournamentStartingStackAmount,
    setHoldemTournamentStartingStackAmount,
  ] = useState(DEFAULT_HOLDEM_TOURNAMENT_STARTING_STACK_AMOUNT);
  const [holdemTournamentPayoutPlaces, setHoldemTournamentPayoutPlaces] =
    useState(DEFAULT_HOLDEM_TOURNAMENT_PAYOUT_PLACES);
  const [holdemActionAmount, setHoldemActionAmount] = useState(
    HOLDEM_CONFIG.bigBlind,
  );
  const [loadingHoldemLobby, setLoadingHoldemLobby] = useState(false);
  const [loadingHoldemTable, setLoadingHoldemTable] = useState(false);
  const [loadingHoldemMessages, setLoadingHoldemMessages] = useState(false);
  const [actingHoldem, setActingHoldem] = useState<HoldemBusyAction>(null);
  const [sendingHoldemMessage, setSendingHoldemMessage] = useState(false);
  const [holdemTableMessages, setHoldemTableMessages] = useState<
    HoldemTableMessage[]
  >([]);
  const [selectedHoldemReplayRoundId, setSelectedHoldemReplayRoundId] =
    useState<string | null>(null);
  const [selectedHoldemReplay, setSelectedHoldemReplay] =
    useState<HandHistory | null>(null);
  const [loadingHoldemReplay, setLoadingHoldemReplay] = useState(false);
  const [holdemReplayError, setHoldemReplayError] = useState<string | null>(
    null,
  );
  const [holdemRealtimeStatus, setHoldemRealtimeStatus] =
    useState<HoldemRealtimeConnectionStatus>("connecting");
  const holdemTablesRef = useRef<HoldemTablesResponse | null>(null);
  const selectedHoldemTableRef = useRef<HoldemTableResponse | null>(null);
  const selectedHoldemTableIdRef = useRef<number | null>(null);
  const holdemRealtimeClientRef = useRef<HoldemRealtimeClient | null>(null);
  const holdemReplayCacheRef = useRef(new Map<string, HandHistory>());
  const holdemReplayRequestIdRef = useRef(0);
  const realtimeObservationDisposedRef = useRef(false);
  const realtimeObservationQueueRef = useRef<HoldemRealtimeObservation[]>([]);
  const realtimeObservationFlushTimerRef = useRef<TimeoutHandle | null>(null);
  const realtimeObservationFlushInFlightRef = useRef(false);

  const clearRealtimeObservationFlushTimer = useCallback(() => {
    if (realtimeObservationFlushTimerRef.current) {
      clearTimeout(realtimeObservationFlushTimerRef.current);
      realtimeObservationFlushTimerRef.current = null;
    }
  }, []);

  const flushRealtimeObservations = useCallback(async () => {
    if (
      realtimeObservationDisposedRef.current ||
      realtimeObservationFlushInFlightRef.current ||
      realtimeObservationQueueRef.current.length === 0
    ) {
      return;
    }

    clearRealtimeObservationFlushTimer();
    realtimeObservationFlushInFlightRef.current = true;
    const batch = realtimeObservationQueueRef.current.splice(
      0,
      HOLDEM_REALTIME_OBSERVATION_BATCH_SIZE,
    );

    try {
      const response = await api.reportHoldemRealtimeObservations({
        surface: observabilitySurface,
        observations: batch,
      });
      if (!response.ok && (response.status ?? 0) >= 500) {
        throw new Error(response.error.message);
      }
    } catch {
      if (!realtimeObservationDisposedRef.current) {
        realtimeObservationQueueRef.current = [
          ...batch,
          ...realtimeObservationQueueRef.current,
        ].slice(-HOLDEM_REALTIME_OBSERVATION_MAX_PENDING);
      }
    } finally {
      realtimeObservationFlushInFlightRef.current = false;
      if (
        !realtimeObservationDisposedRef.current &&
        realtimeObservationQueueRef.current.length > 0
      ) {
        realtimeObservationFlushTimerRef.current = setTimeout(() => {
          void flushRealtimeObservations();
        }, HOLDEM_REALTIME_OBSERVATION_FLUSH_INTERVAL_MS);
      }
    }
  }, [api, clearRealtimeObservationFlushTimer, observabilitySurface]);

  const enqueueRealtimeObservation = useCallback(
    (observation: HoldemRealtimeObservation) => {
      if (realtimeObservationDisposedRef.current) {
        return;
      }

      realtimeObservationQueueRef.current.push(observation);
      if (
        realtimeObservationQueueRef.current.length >
        HOLDEM_REALTIME_OBSERVATION_MAX_PENDING
      ) {
        realtimeObservationQueueRef.current.splice(
          0,
          realtimeObservationQueueRef.current.length -
            HOLDEM_REALTIME_OBSERVATION_MAX_PENDING,
        );
      }

      if (
        realtimeObservationQueueRef.current.length >=
        HOLDEM_REALTIME_OBSERVATION_BATCH_SIZE
      ) {
        void flushRealtimeObservations();
        return;
      }

      if (!realtimeObservationFlushTimerRef.current) {
        realtimeObservationFlushTimerRef.current = setTimeout(() => {
          void flushRealtimeObservations();
        }, HOLDEM_REALTIME_OBSERVATION_FLUSH_INTERVAL_MS);
      }
    },
    [flushRealtimeObservations],
  );

  const resetHoldem = useCallback(() => {
    setHoldemTables(null);
    setHoldemPlayModeState(null);
    setUpdatingHoldemPlayMode(false);
    setSelectedHoldemTableId(null);
    setSelectedHoldemTable(null);
    setHoldemTableName("");
    setHoldemBuyInAmount(HOLDEM_CONFIG.minimumBuyIn);
    setHoldemCreateTableType("casual");
    setHoldemCreateMaxSeats(2);
    setHoldemTournamentStartingStackAmount(
      DEFAULT_HOLDEM_TOURNAMENT_STARTING_STACK_AMOUNT,
    );
    setHoldemTournamentPayoutPlaces(DEFAULT_HOLDEM_TOURNAMENT_PAYOUT_PLACES);
    setHoldemActionAmount(HOLDEM_CONFIG.bigBlind);
    setLoadingHoldemLobby(false);
    setLoadingHoldemTable(false);
    setLoadingHoldemMessages(false);
    setActingHoldem(null);
    setSendingHoldemMessage(false);
    setHoldemTableMessages([]);
    setSelectedHoldemReplayRoundId(null);
    setSelectedHoldemReplay(null);
    setLoadingHoldemReplay(false);
    setHoldemReplayError(null);
    setHoldemRealtimeStatus("connecting");
    holdemReplayCacheRef.current.clear();
    holdemReplayRequestIdRef.current += 1;
  }, []);

  useEffect(() => {
    return () => {
      realtimeObservationDisposedRef.current = true;
      clearRealtimeObservationFlushTimer();
      realtimeObservationQueueRef.current = [];
    };
  }, [clearRealtimeObservationFlushTimer]);

  useEffect(() => {
    holdemTablesRef.current = holdemTables;
  }, [holdemTables]);

  useEffect(() => {
    selectedHoldemTableRef.current = selectedHoldemTable;
  }, [selectedHoldemTable]);

  useEffect(() => {
    selectedHoldemTableIdRef.current = selectedHoldemTableId;
  }, [selectedHoldemTableId]);

  const handleUnauthorized = useCallback(async () => {
    const onUnauthorized = handleUnauthorizedRef.current;
    if (onUnauthorized) {
      await onUnauthorized("Session expired or was revoked. Sign in again.");
    }
  }, [handleUnauthorizedRef]);

  const refreshHoldemPlayMode = useCallback(async () => {
    if (!authTokenRef.current) {
      return false;
    }

    const response = await api.getPlayMode("holdem");
    if (!response.ok) {
      if (response.status === 401) {
        await handleUnauthorized();
        return false;
      }

      setError(response.error?.message ?? "Failed to load Hold'em play mode.");
      return false;
    }

    startTransition(() => {
      setHoldemPlayModeState(response.data.snapshot);
    });
    return true;
  }, [api, authTokenRef, handleUnauthorized, setError]);

  const setHoldemPlayMode = useCallback(
    async (type: PlayModeType) => {
      setUpdatingHoldemPlayMode(true);
      const response = await api.setPlayMode("holdem", { type });
      setUpdatingHoldemPlayMode(false);

      if (!response.ok) {
        if (response.status === 401) {
          await handleUnauthorized();
          return false;
        }

        setError(response.error?.message ?? "Failed to update Hold'em play mode.");
        return false;
      }

      startTransition(() => {
        setHoldemPlayModeState(response.data.snapshot);
      });
      return true;
    },
    [api, handleUnauthorized, setError],
  );

  const refreshHoldemLobby = useCallback(
    async (preferredTableId?: number | null) => {
      if (!authTokenRef.current) {
        return false;
      }

      setLoadingHoldemLobby(true);
      const response = await api.getHoldemTables();
      setLoadingHoldemLobby(false);

      if (!response.ok) {
        if (response.status === 401) {
          await handleUnauthorized();
          return false;
        }

        setError(response.error?.message ?? "Failed to load Hold'em tables.");
        return false;
      }

      startTransition(() => {
        setHoldemTables(response.data);
        setSelectedHoldemTableId((current) => {
          const tableIds = new Set(response.data.tables.map((table) => table.id));
          const candidates = [
            preferredTableId,
            current,
            response.data.activeTableIds[0] ?? null,
            response.data.currentTableId,
            response.data.tables[0]?.id ?? null,
          ];

          for (const candidate of candidates) {
            if (candidate !== null && candidate !== undefined && tableIds.has(candidate)) {
              return candidate;
            }
          }

          return null;
        });
      });

      return true;
    },
    [api, authTokenRef, handleUnauthorized, setError],
  );

  const refreshHoldemTable = useCallback(
    async (tableId: number) => {
      if (!authTokenRef.current) {
        return false;
      }

      setLoadingHoldemTable(true);
      const response = await api.getHoldemTable(tableId);
      setLoadingHoldemTable(false);

      if (!response.ok) {
        if (response.status === 401) {
          await handleUnauthorized();
          return false;
        }

        setError(response.error?.message ?? "Failed to load Hold'em table.");
        return false;
      }

      startTransition(() => {
        setSelectedHoldemTable(response.data);
        setSelectedHoldemTableId(response.data.table.id);
      });
      return true;
    },
    [api, authTokenRef, handleUnauthorized, setError],
  );

  const refreshHoldemTableMessages = useCallback(
    async (tableId: number) => {
      if (!authTokenRef.current) {
        return false;
      }

      setLoadingHoldemMessages(true);
      const response = await api.getHoldemTableMessages(tableId);
      setLoadingHoldemMessages(false);

      if (!response.ok) {
        if (response.status === 401) {
          await handleUnauthorized();
          return false;
        }

        setError(
          response.error?.message ?? "Failed to load Hold'em table messages.",
        );
        return false;
      }

      startTransition(() => {
        setHoldemTableMessages(response.data.messages);
      });
      return true;
    },
    [api, authTokenRef, handleUnauthorized, setError],
  );

  const closeHoldemReplay = useCallback(() => {
    holdemReplayRequestIdRef.current += 1;
    setSelectedHoldemReplayRoundId(null);
    setSelectedHoldemReplay(null);
    setLoadingHoldemReplay(false);
    setHoldemReplayError(null);
  }, []);

  const openHoldemReplay = useCallback(
    async (roundId: string) => {
      if (!authTokenRef.current) {
        return false;
      }

      if (selectedHoldemReplayRoundId === roundId) {
        closeHoldemReplay();
        return true;
      }

      const cachedReplay = holdemReplayCacheRef.current.get(roundId) ?? null;
      const requestId = holdemReplayRequestIdRef.current + 1;
      holdemReplayRequestIdRef.current = requestId;

      setSelectedHoldemReplayRoundId(roundId);
      setHoldemReplayError(null);

      if (cachedReplay) {
        setSelectedHoldemReplay(cachedReplay);
        setLoadingHoldemReplay(false);
        return true;
      }

      setSelectedHoldemReplay(null);
      setLoadingHoldemReplay(true);

      const response = await api.getHandHistory(roundId);
      if (requestId !== holdemReplayRequestIdRef.current) {
        return false;
      }

      setLoadingHoldemReplay(false);

      if (!response.ok) {
        if (response.status === 401) {
          await handleUnauthorized();
          return false;
        }

        setHoldemReplayError(response.error?.message ?? "Failed to load replay.");
        return false;
      }

      holdemReplayCacheRef.current.set(roundId, response.data);
      startTransition(() => {
        setSelectedHoldemReplay(response.data);
      });
      return true;
    },
    [
      api,
      authTokenRef,
      closeHoldemReplay,
      handleUnauthorized,
      selectedHoldemReplayRoundId,
    ],
  );

  useEffect(() => {
    if (!selectedHoldemReplayRoundId) {
      return;
    }

    const availableRoundIds = new Set(
      selectedHoldemTable?.table.recentHands
        .map((hand) => hand.roundId)
        .filter((roundId): roundId is string => Boolean(roundId)) ?? [],
    );

    if (!availableRoundIds.has(selectedHoldemReplayRoundId)) {
      closeHoldemReplay();
    }
  }, [closeHoldemReplay, selectedHoldemReplayRoundId, selectedHoldemTable]);

  const getHoldemEvidenceBundle = useCallback(
    async (roundId: string): Promise<HoldemSignedEvidenceBundle | null> => {
      if (!authTokenRef.current) {
        return null;
      }

      const response = await api.getHandHistoryEvidenceBundle(roundId);
      if (!response.ok) {
        if (response.status === 401) {
          await handleUnauthorized();
          return null;
        }

        setError(
          response.error?.message ?? "Failed to load signed evidence bundle.",
        );
        return null;
      }

      return response.data;
    },
    [api, authTokenRef, handleUnauthorized, setError],
  );

  const syncAuthoritativeHoldemState = useCallback(
    async (options?: {
      refreshLobby?: boolean;
      refreshTableId?: number | null;
      refreshMessagesTableId?: number | null;
      markRealtimeSynchronized?: boolean;
    }) => {
      const tasks: Array<Promise<unknown>> = [];

      if (options?.refreshLobby !== false) {
        tasks.push(refreshHoldemLobby(selectedHoldemTableIdRef.current));
      }
      if (options?.refreshTableId !== null && options?.refreshTableId !== undefined) {
        tasks.push(refreshHoldemTable(options.refreshTableId));
      }
      if (
        options?.refreshMessagesTableId !== null &&
        options?.refreshMessagesTableId !== undefined
      ) {
        tasks.push(refreshHoldemTableMessages(options.refreshMessagesTableId));
      }

      const results = await Promise.all(tasks);

      if (
        options?.markRealtimeSynchronized &&
        results.every((result) => Boolean(result))
      ) {
        holdemRealtimeClientRef.current?.markSynchronized();
      }
    },
    [refreshHoldemLobby, refreshHoldemTable, refreshHoldemTableMessages],
  );

  const applySuccessfulTableResponse = useCallback(
    async (
      response: HoldemTableResponse,
      options?: {
        refreshWallet?: boolean;
      },
    ) => {
      startTransition(() => {
        setSelectedHoldemTable(response);
        setSelectedHoldemTableId(response.table.id);
      });
      await refreshHoldemLobby(response.table.id);
      await refreshHoldemTableMessages(response.table.id);

      if (options?.refreshWallet) {
        await refreshBalance();
      }
    },
    [refreshBalance, refreshHoldemLobby, refreshHoldemTableMessages],
  );

  const runHoldemMutation = useCallback(
    async (
      action: Exclude<HoldemBusyAction, null>,
      task: () => Promise<
        | Awaited<ReturnType<HoldemApi["createHoldemTable"]>>
        | Awaited<ReturnType<HoldemApi["joinHoldemTable"]>>
        | Awaited<ReturnType<HoldemApi["leaveHoldemTable"]>>
        | Awaited<ReturnType<HoldemApi["startHoldemTable"]>>
        | Awaited<ReturnType<HoldemApi["setHoldemSeatMode"]>>
        | Awaited<ReturnType<HoldemApi["actOnHoldemTable"]>>
      >,
      options?: {
        refreshWallet?: boolean;
      },
    ) => {
      resetFeedback();
      setActingHoldem(action);

      const response = await task();

      setActingHoldem(null);

      if (!response.ok) {
        if (response.status === 401) {
          await handleUnauthorized();
          return false;
        }

        setError(response.error?.message ?? "Hold'em request failed.");
        return false;
      }

      await applySuccessfulTableResponse(response.data, options);
      return true;
    },
    [
      applySuccessfulTableResponse,
      handleUnauthorized,
      resetFeedback,
      setError,
    ],
  );

  const createHoldemTable = useCallback(
    async () =>
      runHoldemMutation(
        "create",
        () =>
          api.createHoldemTable({
            tableName: holdemTableName.trim() || undefined,
            buyInAmount: holdemBuyInAmount.trim(),
            tableType: holdemCreateTableType,
            maxSeats: holdemCreateMaxSeats,
            tournament:
              holdemCreateTableType === "tournament"
                ? {
                    startingStackAmount:
                      holdemTournamentStartingStackAmount.trim() || undefined,
                    payoutPlaces: (() => {
                      const parsed = Number.parseInt(
                        holdemTournamentPayoutPlaces.trim(),
                        10,
                      );
                      return Number.isFinite(parsed) && parsed > 0
                        ? parsed
                        : undefined;
                    })(),
                  }
                : undefined,
          }),
        { refreshWallet: true },
      ),
    [
      api,
      holdemBuyInAmount,
      holdemCreateMaxSeats,
      holdemCreateTableType,
      holdemTableName,
      holdemTournamentPayoutPlaces,
      holdemTournamentStartingStackAmount,
      runHoldemMutation,
    ],
  );

  const joinHoldemTable = useCallback(
    async (tableId: number) =>
      runHoldemMutation(
        "join",
        () =>
          api.joinHoldemTable(tableId, {
            buyInAmount: holdemBuyInAmount.trim(),
          }),
        { refreshWallet: true },
      ),
    [api, holdemBuyInAmount, runHoldemMutation],
  );

  const leaveHoldemTable = useCallback(
    async (tableId: number) =>
      runHoldemMutation("leave", () => api.leaveHoldemTable(tableId), {
        refreshWallet: true,
      }),
    [api, runHoldemMutation],
  );

  const startHoldemTable = useCallback(
    async (tableId: number) =>
      runHoldemMutation("start", () => api.startHoldemTable(tableId)),
    [api, runHoldemMutation],
  );

  const setHoldemSeatMode = useCallback(
    async (tableId: number, sittingOut: boolean) =>
      runHoldemMutation(
        sittingOut ? "sitOut" : "sitIn",
        () => api.setHoldemSeatMode(tableId, { sittingOut }),
      ),
    [api, runHoldemMutation],
  );

  const actOnHoldemTable = useCallback(
    async (tableId: number, action: HoldemAction) =>
      runHoldemMutation(action, () =>
        api.actOnHoldemTable(tableId, {
          action,
          amount:
            action === "bet" || action === "raise"
              ? holdemActionAmount.trim()
              : undefined,
        }),
      ),
    [api, holdemActionAmount, runHoldemMutation],
  );

  const sendHoldemTableMessage = useCallback(
    async (tableId: number, payload: HoldemTableMessageRequest) => {
      resetFeedback();
      setSendingHoldemMessage(true);

      const response = await api.postHoldemTableMessage(tableId, payload);

      setSendingHoldemMessage(false);

      if (!response.ok) {
        if (response.status === 401) {
          await handleUnauthorized();
          return false;
        }

        setError(response.error?.message ?? "Hold'em chat request failed.");
        return false;
      }

      startTransition(() => {
        setHoldemTableMessages((currentMessages) =>
          applyHoldemTableMessage({
            currentMessages,
            message: response.data,
            maxMessages: HOLDEM_TABLE_MESSAGE_LIMIT,
          }),
        );
      });
      return true;
    },
    [api, handleUnauthorized, resetFeedback, setError],
  );

  useEffect(() => {
    if (!selectedHoldemTableId || !authTokenRef.current) {
      setSelectedHoldemTable(null);
      setHoldemTableMessages([]);
      return;
    }

    void refreshHoldemTable(selectedHoldemTableId);
    void refreshHoldemTableMessages(selectedHoldemTableId);
  }, [
    authTokenRef,
    refreshHoldemTable,
    refreshHoldemTableMessages,
    selectedHoldemTableId,
  ]);

  useEffect(() => {
    if (
      !enabled ||
      !authTokenRef.current
    ) {
      return;
    }

    const intervalHandle: IntervalHandle = setInterval(() => {
      void refreshHoldemLobby(selectedHoldemTableId);
      if (selectedHoldemTableId !== null) {
        void refreshHoldemTable(selectedHoldemTableId);
        void refreshHoldemTableMessages(selectedHoldemTableId);
      }
    }, 30_000);

    return () => clearInterval(intervalHandle);
  }, [
    authTokenRef,
    enabled,
    refreshHoldemLobby,
    refreshHoldemTable,
    refreshHoldemTableMessages,
    selectedHoldemTableId,
  ]);

  useEffect(() => {
    const activeTableIds = holdemTables?.activeTableIds ?? [];
    if (!enabled || !authTokenRef.current || activeTableIds.length === 0) {
      return;
    }

    let cancelled = false;

    const touchPresence = async () => {
      for (const tableId of activeTableIds) {
        const response = await api.touchHoldemTablePresence(tableId);
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          if (response.status === 401) {
            await handleUnauthorized();
            return;
          }

          if (response.status !== 409) {
            setError(response.error?.message ?? "Hold'em presence refresh failed.");
            return;
          }
        }
      }
    };

    void touchPresence();
    const intervalHandle: IntervalHandle = setInterval(() => {
      void touchPresence();
    }, HOLDEM_DEFAULT_PRESENCE_HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalHandle);
    };
  }, [
    api,
    authTokenRef,
    enabled,
    handleUnauthorized,
    holdemTables?.activeTableIds,
    setError,
  ]);

  useEffect(() => {
    if (!enabled || !authTokenRef.current) {
      return;
    }

    let disposed = false;
    let refreshTimer: TimeoutHandle | null = null;

    const clearRefreshTimer = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    };

    const scheduleRefresh = (options?: {
      markRealtimeSynchronized?: boolean;
      refreshLobby?: boolean;
      refreshTableId?: number | null;
      refreshMessagesTableId?: number | null;
    }) => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        void syncAuthoritativeHoldemState({
          refreshLobby: options?.refreshLobby,
          refreshTableId:
            options?.refreshTableId ?? selectedHoldemTableIdRef.current,
          refreshMessagesTableId:
            options?.refreshMessagesTableId ?? selectedHoldemTableIdRef.current,
          markRealtimeSynchronized: options?.markRealtimeSynchronized,
        });
      }, 90);
    };

    const client = createHoldemRealtimeClient({
      baseUrl: realtimeBaseUrl,
      getAuthToken: async () => authTokenRef.current,
      onConnectionStatusChange: (status) => {
        if (!disposed) {
          setHoldemRealtimeStatus(status);
        }
      },
      onSyncNeeded: () => {
        scheduleRefresh({
          markRealtimeSynchronized: true,
        });
      },
      onUnauthorized: handleUnauthorized,
      onPublicUpdate: (update) => {
        const currentSelectedHoldemTable = selectedHoldemTableRef.current;
        const nextState = applyHoldemRealtimeUpdate({
          holdemTables: holdemTablesRef.current,
          selectedHoldemTable: currentSelectedHoldemTable,
          selectedHoldemTableId: selectedHoldemTableIdRef.current,
          update,
        });

        startTransition(() => {
          if (nextState.nextLobby !== null) {
            setHoldemTables(nextState.nextLobby);
          }
          if (nextState.patchedSelectedTable && nextState.nextTable) {
            setSelectedHoldemTable(nextState.nextTable);
          }
        });
      },
      onPrivateUpdate: (update) => {
        const nextTable = applyHoldemPrivateRealtimeUpdate({
          selectedHoldemTable: selectedHoldemTableRef.current,
          selectedHoldemTableId: selectedHoldemTableIdRef.current,
          update,
        });

        if (nextTable) {
          startTransition(() => {
            setSelectedHoldemTable(nextTable);
          });
        }
      },
      onTableMessage: (message) => {
        if (selectedHoldemTableIdRef.current !== message.tableId) {
          return;
        }

        startTransition(() => {
          setHoldemTableMessages((currentMessages) =>
            applyHoldemTableMessage({
              currentMessages,
              message,
              maxMessages: HOLDEM_TABLE_MESSAGE_LIMIT,
            }),
          );
        });
      },
      onObservation: enqueueRealtimeObservation,
      onWarning: (message) => {
        if (!disposed) {
          setError(message);
        }
      },
    });

    holdemRealtimeClientRef.current = client;
    client.syncTopics([
      HOLDEM_REALTIME_LOBBY_TOPIC,
      ...new Set(
        [
          ...(holdemTablesRef.current?.activeTableIds ?? []),
          ...(selectedHoldemTableIdRef.current !== null
            ? [selectedHoldemTableIdRef.current]
            : []),
        ].map((tableId) => buildHoldemRealtimeTableTopic(tableId)),
      ),
    ]);
    client.start();

    return () => {
      disposed = true;
      clearRefreshTimer();
      if (holdemRealtimeClientRef.current === client) {
        holdemRealtimeClientRef.current = null;
      }
      client.stop();
    };
  }, [
    authTokenRef,
    enabled,
    handleUnauthorized,
    enqueueRealtimeObservation,
    realtimeBaseUrl,
    setError,
    syncAuthoritativeHoldemState,
  ]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    holdemRealtimeClientRef.current?.syncTopics([
      HOLDEM_REALTIME_LOBBY_TOPIC,
      ...new Set(
        [
          ...(holdemTables?.activeTableIds ?? []),
          ...(selectedHoldemTableId !== null ? [selectedHoldemTableId] : []),
        ].map((tableId) => buildHoldemRealtimeTableTopic(tableId)),
      ),
    ]);
  }, [enabled, selectedHoldemTableId, holdemTables?.activeTableIds]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refreshHoldemPlayMode();
  }, [enabled, refreshHoldemPlayMode]);

  return {
    actingHoldem,
    actOnHoldemTable,
    closeHoldemReplay,
    createHoldemTable,
    getHoldemEvidenceBundle,
    holdemActionAmount,
    holdemBuyInAmount,
    holdemCreateMaxSeats,
    holdemCreateTableType,
    holdemTournamentPayoutPlaces,
    holdemTournamentStartingStackAmount,
    holdemPlayMode,
    holdemReplayError,
    holdemRealtimeStatus,
    holdemTableName,
    holdemTableMessages,
    holdemTables,
    joinHoldemTable,
    leaveHoldemTable,
    loadingHoldemMessages,
    loadingHoldemReplay,
    loadingHoldemLobby,
    loadingHoldemTable,
    openHoldemReplay,
    refreshHoldemLobby,
    refreshHoldemPlayMode,
    refreshHoldemTableMessages,
    refreshHoldemTable,
    resetHoldem,
    selectedHoldemReplay,
    selectedHoldemReplayRoundId,
    selectedHoldemTable,
    selectedHoldemTableId,
    sendHoldemTableMessage,
    sendingHoldemMessage,
    setHoldemActionAmount,
    setHoldemBuyInAmount,
    setHoldemCreateMaxSeats,
    setHoldemCreateTableType,
    setHoldemTournamentPayoutPlaces,
    setHoldemTournamentStartingStackAmount,
    setHoldemPlayMode,
    setHoldemTableName,
    setHoldemSeatMode,
    setSelectedHoldemTableId,
    startHoldemTable,
    updatingHoldemPlayMode,
  };
}
