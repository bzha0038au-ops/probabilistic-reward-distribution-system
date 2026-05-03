import type { AppRoute, PlayStage } from "../app-types";
import { buildRouteHash, parseHashRoute } from "../routes";

interface RouterControllerOptions {
  getFallbackStage: () => PlayStage;
  getCurrentRoute: () => AppRoute;
  applyRoute: (route: AppRoute) => void;
  render: () => void;
}

interface NavigateOptions {
  replace?: boolean;
}

export interface RouterController {
  start: () => void;
  navigateToRoute: (route: AppRoute, options?: NavigateOptions) => void;
  navigateToCurrentState: (options?: NavigateOptions) => void;
  getCurrentRouteHash: () => string;
}

export function createRouterController(options: RouterControllerOptions): RouterController {
  let pendingHashSync: string | null = null;

  const handleHashChange = (): void => {
    if (pendingHashSync && window.location.hash === pendingHashSync) {
      pendingHashSync = null;
      return;
    }

    pendingHashSync = null;
    const route = parseHashRoute(window.location.hash, options.getFallbackStage()) ?? options.getCurrentRoute();
    options.applyRoute(route);
    options.render();
  };

  const navigateToRoute = (route: AppRoute, navigateOptions: NavigateOptions = {}): void => {
    const nextHash = buildRouteHash(route, options.getFallbackStage());

    if (window.location.hash === nextHash) {
      pendingHashSync = null;
      options.applyRoute(route);
      options.render();
      return;
    }

    options.applyRoute(route);

    if (navigateOptions.replace) {
      const nextUrl = new URL(window.location.href);
      nextUrl.hash = nextHash;
      window.history.replaceState(null, "", nextUrl);
      pendingHashSync = null;
      options.render();
      return;
    }

    pendingHashSync = nextHash;
    window.location.hash = nextHash;
    options.render();
  };

  return {
    start: () => {
      window.addEventListener("hashchange", handleHashChange);
      const route = parseHashRoute(window.location.hash, options.getFallbackStage()) ?? options.getCurrentRoute();
      const shouldReplace = !window.location.hash || parseHashRoute(window.location.hash, options.getFallbackStage()) === null;
      navigateToRoute(route, { replace: shouldReplace });
    },
    navigateToRoute,
    navigateToCurrentState: (navigateOptions: NavigateOptions = {}) => {
      navigateToRoute(options.getCurrentRoute(), navigateOptions);
    },
    getCurrentRouteHash: () => buildRouteHash(options.getCurrentRoute(), options.getFallbackStage()),
  };
}
