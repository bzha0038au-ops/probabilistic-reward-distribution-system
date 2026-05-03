import type { AppState } from "../app-types";
import type { PlayActionContext } from "../actions";
import { hydrateScratchController } from "./scratch-controller";
import { getDisplayCash } from "../state";
import { syncTestingHooks } from "./testing-controller";
import { renderApp } from "../views";

interface RenderControllerOptions {
  appRoot: HTMLDivElement;
  state: AppState;
  getActionContext: () => PlayActionContext;
  getCurrentRouteHash: () => string;
}

export interface RenderController {
  render: () => void;
}

export function createRenderController(options: RenderControllerOptions): RenderController {
  const render = (): void => {
    options.appRoot.innerHTML = renderApp({
      state: options.state,
      displayCash: getDisplayCash(options.state.play),
    });
    syncTestingHooks({
      state: options.state,
      getCurrentRouteHash: options.getCurrentRouteHash,
      render,
    });
    window.requestAnimationFrame(() => {
      hydrateScratchController({
        appRoot: options.appRoot,
        getActionContext: options.getActionContext,
      });
    });
  };

  return { render };
}
