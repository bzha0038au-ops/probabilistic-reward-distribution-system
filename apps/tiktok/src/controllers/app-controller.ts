import { createPlayStateController } from "./play-state-controller";
import { createRenderController } from "./render-controller";
import { createRouterController } from "./router-controller";
import type { RouterController } from "./router-controller";
import { bindInteractionController } from "./interaction-controller";
import { bootstrapRuntimeController } from "./runtime-controller";
import { createSessionController } from "./session-controller";
import { createLiveDataController } from "./live-data-controller";
import { resolveUserApiBaseUrl } from "../api/user-client";

const STORAGE_KEY = "last-chance-progress";
const AUTH_TOKEN_STORAGE_KEY = "last-chance-user-token";
const REMEMBERED_EMAIL_STORAGE_KEY = "last-chance-remembered-email";
const CAT_NAV_BG = "#12081d";

interface AppControllerOptions {
  appRoot: HTMLDivElement;
  clientKey: string;
}

export function startAppController(options: AppControllerOptions): void {
  const sessionController = createSessionController({
    clientKey: options.clientKey,
    storage: window.localStorage,
    storageKey: STORAGE_KEY,
    authTokenStorageKey: AUTH_TOKEN_STORAGE_KEY,
    rememberedEmailStorageKey: REMEMBERED_EMAIL_STORAGE_KEY,
    userApiBaseUrl: resolveUserApiBaseUrl(),
  });
  const { state } = sessionController;
  const playStateController = createPlayStateController({ state });
  let routerController!: RouterController;
  const renderController = createRenderController({
    appRoot: options.appRoot,
    state,
    getActionContext,
    getCurrentRouteHash: () => routerController.getCurrentRouteHash(),
  });
  const liveDataController = createLiveDataController({
    state,
    storage: window.localStorage,
    authTokenStorageKey: AUTH_TOKEN_STORAGE_KEY,
    rememberedEmailStorageKey: REMEMBERED_EMAIL_STORAGE_KEY,
    render: renderController.render,
    recordBeat: sessionController.recordBeat,
  });
  routerController = createRouterController({
    getFallbackStage: playStateController.getFallbackStage,
    getCurrentRoute: playStateController.getCurrentRoute,
    applyRoute: playStateController.applyRoute,
    render: renderController.render,
  });

  bindInteractionController({
    appRoot: options.appRoot,
    state,
    getActionContext,
    liveDataController,
    navigateToRoute: (route) => routerController.navigateToRoute(route),
    render: renderController.render,
  });

  routerController.start();
  void liveDataController.start();
  void bootstrapRuntimeController({
    clientKey: options.clientKey,
    state,
    render: renderController.render,
    recordBeat: sessionController.recordBeat,
    navigationBarColor: CAT_NAV_BG,
  });

  function getActionContext() {
    return sessionController.createActionContext(() => routerController.navigateToCurrentState());
  }
}
