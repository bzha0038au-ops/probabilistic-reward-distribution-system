import type { AppState } from "../app-types";
import type { PlayActionContext } from "../actions";
import {
  createInitialAppStateWithLiveSeed,
  loadProgress,
  persistProgress as persistStoredProgress,
} from "../state";

interface SessionControllerOptions {
  clientKey: string;
  storage: Storage;
  storageKey: string;
  authTokenStorageKey: string;
  rememberedEmailStorageKey: string;
  userApiBaseUrl: string;
}

export interface SessionController {
  state: AppState;
  recordBeat: (message: string) => void;
  createActionContext: (navigateToCurrentState: () => void) => PlayActionContext;
}

export function createSessionController(options: SessionControllerOptions): SessionController {
  const storedProgress = loadProgress(options.storage, options.storageKey);
  const storedAuthToken = options.storage.getItem(options.authTokenStorageKey);
  const rememberedEmail = options.storage.getItem(options.rememberedEmailStorageKey) ?? "";
  const state = createInitialAppStateWithLiveSeed(options.clientKey, storedProgress, {
    apiBaseUrl: options.userApiBaseUrl,
    authToken: storedAuthToken,
    rememberedEmail,
  });

  const persistProgress = (): void => {
    persistStoredProgress(options.storage, options.storageKey, state);
  };

  const recordBeat = (message: string): void => {
    const stamp = new Date().toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
    });
    state.eventLog = [`${stamp} ${message}`, ...state.eventLog].slice(0, 6);
  };

  return {
    state,
    recordBeat,
    createActionContext: (navigateToCurrentState) => ({
      state,
      persistProgress,
      navigateToCurrentState,
      recordBeat,
    }),
  };
}
