import type { AppRoute, AppTab, PlayStage } from "../app-types";

export const PLAY_STAGES: readonly PlayStage[] = [
  "intro",
  "ticket",
  "decision",
  "ticket-final",
  "bust",
  "ticket-win",
  "walk-away",
  "rex",
  "rex-win",
];

export function isAppTab(value: string | undefined): value is AppTab {
  return (
    value === "play" ||
    value === "story" ||
    value === "wallet" ||
    value === "notifications" ||
    value === "profile"
  );
}

export function isPlayStage(value: string | undefined): value is PlayStage {
  return typeof value === "string" && PLAY_STAGES.includes(value as PlayStage);
}

export function getPlayRoute(stage: PlayStage): AppRoute {
  return {
    tab: "play",
    stage,
  };
}

export function buildRouteHash(route: AppRoute, fallbackStage: PlayStage): string {
  if (route.tab !== "play") {
    return `#/${route.tab}`;
  }

  return `#/play/${route.stage ?? fallbackStage}`;
}

export function parseHashRoute(hash: string, fallbackStage: PlayStage): AppRoute | null {
  const trimmed = hash.replace(/^#\/?/, "").trim();
  if (!trimmed) {
    return null;
  }

  const [first, second] = trimmed.split("/").filter(Boolean);
  if (!isAppTab(first)) {
    return null;
  }

  if (first !== "play") {
    return { tab: first };
  }

  if (!second) {
    return { tab: "play", stage: fallbackStage };
  }

  if (!isPlayStage(second)) {
    return null;
  }

  return {
    tab: "play",
    stage: second,
  };
}
