import type {
  DrawPrizePresentation,
  DrawResult,
} from "@reward/shared-types/draw";

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
  accentClassName: string;
  frameClassName: string;
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
    accentClassName:
      "from-amber-100 via-amber-200 to-yellow-400 text-amber-950",
    frameClassName:
      "border-amber-300/80 shadow-[0_0_40px_rgba(245,158,11,0.35)]",
  },
  {
    id: "gem",
    label: "Vault Gem",
    shortLabel: "GEM",
    accentClassName:
      "from-fuchsia-100 via-rose-200 to-orange-300 text-rose-950",
    frameClassName:
      "border-rose-300/70 shadow-[0_0_32px_rgba(244,114,182,0.28)]",
  },
  {
    id: "star",
    label: "Lucky Star",
    shortLabel: "STAR",
    accentClassName: "from-sky-100 via-cyan-200 to-teal-300 text-sky-950",
    frameClassName:
      "border-cyan-300/70 shadow-[0_0_32px_rgba(34,211,238,0.24)]",
  },
  {
    id: "comet",
    label: "Orbit Comet",
    shortLabel: "COMET",
    accentClassName:
      "from-violet-100 via-indigo-200 to-blue-300 text-indigo-950",
    frameClassName:
      "border-indigo-300/70 shadow-[0_0_32px_rgba(129,140,248,0.24)]",
  },
  {
    id: "coin",
    label: "Gold Coin",
    shortLabel: "COIN",
    accentClassName:
      "from-stone-100 via-orange-100 to-amber-200 text-stone-900",
    frameClassName:
      "border-orange-200/70 shadow-[0_0_28px_rgba(251,191,36,0.2)]",
  },
  {
    id: "vault",
    label: "Vault Lock",
    shortLabel: "VAULT",
    accentClassName: "from-slate-200 via-slate-300 to-slate-500 text-slate-950",
    frameClassName:
      "border-slate-300/60 shadow-[0_0_24px_rgba(148,163,184,0.2)]",
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

const buildPrizeKey = (prize: DrawPrizePresentation) =>
  `${Number(prize.rewardAmount ?? 0)}:${prize.id}`;

const rankPrizes = (prizes: readonly DrawPrizePresentation[]) =>
  [...prizes].sort((left, right) => {
    const rewardDelta = Number(right.rewardAmount) - Number(left.rewardAmount);
    if (rewardDelta !== 0) {
      return rewardDelta;
    }
    return left.id - right.id;
  });

export const buildPrizeSymbolMap = (
  prizes: readonly DrawPrizePresentation[],
) => {
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

export const getPrizeLookupKey = (prize: DrawPrizePresentation) =>
  buildPrizeKey(prize);
