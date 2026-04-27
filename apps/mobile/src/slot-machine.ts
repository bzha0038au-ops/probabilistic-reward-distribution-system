import type {
  DrawPrizePresentation,
  DrawResult,
} from "@reward/shared-types/draw";

import { mobileSlotSymbolTheme } from "./theme";

export type SlotSymbolId =
  | "crown"
  | "gem"
  | "star"
  | "comet"
  | "coin"
  | "vault";

export type SlotSymbol = {
  id: SlotSymbolId;
  label: string;
  shortLabel: string;
  glyph: string;
  tintColor: string;
  backgroundColor: string;
  borderColor: string;
};

export type SlotReelWindow = [SlotSymbolId, SlotSymbolId, SlotSymbolId];

export type SlotFinale = {
  reels: [SlotReelWindow, SlotReelWindow, SlotReelWindow];
  centerLine: [SlotSymbolId, SlotSymbolId, SlotSymbolId];
  prize: DrawPrizePresentation | null;
  tone: "win" | "near-miss" | "blocked";
};

type RandomFn = () => number;

const PRIZE_SYMBOL_ORDER: readonly SlotSymbolId[] = [
  "crown",
  "gem",
  "star",
  "comet",
  "coin",
  "vault",
] as const;

const NON_WIN_SYMBOL_ORDER: readonly SlotSymbolId[] = [
  "coin",
  "star",
  "comet",
  "gem",
  "vault",
] as const;

export const SLOT_SYMBOLS: readonly SlotSymbol[] = [
  {
    id: "crown",
    label: "Jackpot Crown",
    shortLabel: "CROWN",
    glyph: "♛",
    ...mobileSlotSymbolTheme.crown,
  },
  {
    id: "gem",
    label: "Vault Gem",
    shortLabel: "GEM",
    glyph: "◈",
    ...mobileSlotSymbolTheme.gem,
  },
  {
    id: "star",
    label: "Lucky Star",
    shortLabel: "STAR",
    glyph: "✦",
    ...mobileSlotSymbolTheme.star,
  },
  {
    id: "comet",
    label: "Orbit Comet",
    shortLabel: "COMET",
    glyph: "☄",
    ...mobileSlotSymbolTheme.comet,
  },
  {
    id: "coin",
    label: "Gold Coin",
    shortLabel: "COIN",
    glyph: "◉",
    ...mobileSlotSymbolTheme.coin,
  },
  {
    id: "vault",
    label: "Vault Lock",
    shortLabel: "VAULT",
    glyph: "▣",
    ...mobileSlotSymbolTheme.vault,
  },
] as const;

const uniqueSymbols = (symbols: readonly SlotSymbolId[]) =>
  Array.from(new Set(symbols));

const pickFrom = <T>(items: readonly T[], random: RandomFn): T =>
  items[Math.floor(random() * items.length) % items.length];

const pickDifferent = (
  items: readonly SlotSymbolId[],
  excluded: readonly SlotSymbolId[],
  random: RandomFn,
) => {
  const filtered = items.filter((item) => !excluded.includes(item));
  return pickFrom(filtered.length > 0 ? filtered : items, random);
};

const rankPrizes = (prizes: readonly DrawPrizePresentation[]) =>
  [...prizes].sort((left, right) => {
    const rewardDelta = Number(right.rewardAmount) - Number(left.rewardAmount);
    if (rewardDelta !== 0) {
      return rewardDelta;
    }
    return left.id - right.id;
  });

const buildPrizeSymbolMap = (prizes: readonly DrawPrizePresentation[]) => {
  const symbolMap = new Map<number, SlotSymbolId>();
  rankPrizes(prizes).forEach((prize, index) => {
    symbolMap.set(
      prize.id,
      PRIZE_SYMBOL_ORDER[index % PRIZE_SYMBOL_ORDER.length],
    );
  });
  return symbolMap;
};

const buildSymbolPool = (prizes: readonly DrawPrizePresentation[]) => {
  const symbolMap = buildPrizeSymbolMap(prizes);
  const prizeSymbols = prizes
    .map((prize) => symbolMap.get(prize.id))
    .filter((symbol): symbol is SlotSymbolId => Boolean(symbol));

  return uniqueSymbols(
    prizeSymbols.length > 0
      ? [...prizeSymbols, ...NON_WIN_SYMBOL_ORDER]
      : PRIZE_SYMBOL_ORDER,
  );
};

const buildWindow = (
  center: SlotSymbolId,
  pool: readonly SlotSymbolId[],
  random: RandomFn,
): SlotReelWindow => {
  const top = pickDifferent(pool, [center], random);
  const bottom = pickDifferent(pool, [center, top], random);
  return [top, center, bottom];
};

const buildMissLine = (
  pool: readonly SlotSymbolId[],
  random: RandomFn,
): [SlotSymbolId, SlotSymbolId, SlotSymbolId] => {
  const primary = pickFrom(pool, random);
  const secondary = pickDifferent(pool, [primary], random);
  return [primary, primary, secondary];
};

const buildBlockedLine = (
  status: DrawResult["status"],
): [SlotSymbolId, SlotSymbolId, SlotSymbolId] => {
  if (status === "payout_limited") {
    return ["crown", "crown", "vault"];
  }
  if (status === "out_of_stock") {
    return ["gem", "gem", "vault"];
  }
  return ["coin", "coin", "vault"];
};

export const createRollingReels = (
  prizes: readonly DrawPrizePresentation[],
  finale: SlotFinale | null = null,
  lockedCount = 0,
  random: RandomFn = Math.random,
): [SlotReelWindow, SlotReelWindow, SlotReelWindow] => {
  const pool = buildSymbolPool(prizes);
  return [0, 1, 2].map((reelIndex) => {
    if (finale && reelIndex < lockedCount) {
      return finale.reels[reelIndex];
    }

    const center = pickFrom(pool, random);
    return buildWindow(center, pool, random);
  }) as [SlotReelWindow, SlotReelWindow, SlotReelWindow];
};

export const buildSlotFinale = (
  result: DrawResult,
  prizes: readonly DrawPrizePresentation[],
  random: RandomFn = Math.random,
): SlotFinale => {
  const prizeMap = buildPrizeSymbolMap(prizes);
  const pool = buildSymbolPool(prizes);
  const prize =
    result.prize ??
    (result.prizeId
      ? (prizes.find((entry) => entry.id === result.prizeId) ?? null)
      : null);

  let centerLine: [SlotSymbolId, SlotSymbolId, SlotSymbolId];
  let tone: SlotFinale["tone"];

  if (result.status === "won" && prize) {
    const winningSymbol = prizeMap.get(prize.id) ?? "crown";
    centerLine = [winningSymbol, winningSymbol, winningSymbol];
    tone = "win";
  } else if (result.status === "miss") {
    centerLine = buildMissLine(pool, random);
    tone = "near-miss";
  } else {
    centerLine = buildBlockedLine(result.status);
    tone = "blocked";
  }

  return {
    reels: [
      buildWindow(centerLine[0], pool, random),
      buildWindow(centerLine[1], pool, random),
      buildWindow(centerLine[2], pool, random),
    ],
    centerLine,
    prize,
    tone,
  };
};

export const getSymbolById = (symbolId: SlotSymbolId) =>
  SLOT_SYMBOLS.find((symbol) => symbol.id === symbolId) ?? SLOT_SYMBOLS[0];
