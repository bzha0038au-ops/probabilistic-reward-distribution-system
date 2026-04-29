import type { PlayModeCopy } from "./ui";

type SupportedLocale = "en" | "zh-CN";

const copy: Record<SupportedLocale, PlayModeCopy> = {
  en: {
    title: "Play mode",
    subtitle: "Strategy wrappers stay above the core game engine.",
    currentLabel: "Current",
    nextLabel: "Next",
    streakLabel: "Streak",
    pendingLabel: "Pending",
    carryLabel: "Carry",
    envelopeLabel: "Envelope",
    carryActive: "Carry armed",
    carryIdle: "Idle",
    modes: {
      standard: "Standard",
      dual_bet: "Dual bet",
      deferred_double: "Deferred payout",
      snowball: "Snowball",
    },
    descriptions: {
      draw: {
        standard: "1 result",
        dual_bet: "2 independent results",
        deferred_double: "wins release on next play",
        snowball: "wins roll into carry, bank on miss",
      },
      blackjack: {
        standard: "x1 stake",
        dual_bet: "2 independent hands",
        deferred_double: "wins release on next hand",
        snowball: "wins roll into carry, bank on loss",
      },
      holdem: {
        standard: "x1 buy-in",
        dual_bet: "2 linked tables",
        deferred_double: "profit releases on next table",
        snowball: "profit rolls into carry, bank on loss",
      },
    },
  },
  "zh-CN": {
    title: "玩法增强",
    subtitle: "策略包装停留在 service 层，不下沉到游戏引擎。",
    currentLabel: "当前",
    nextLabel: "下次",
    streakLabel: "连击",
    pendingLabel: "挂起",
    carryLabel: "滚存",
    envelopeLabel: "信封",
    carryActive: "已挂起",
    carryIdle: "待机",
    modes: {
      standard: "标准",
      dual_bet: "双倍下注",
      deferred_double: "递延派发",
      snowball: "滚雪球",
    },
    descriptions: {
      draw: {
        standard: "1 次结果",
        dual_bet: "2 次独立结果",
        deferred_double: "奖金延后到下一局释放",
        snowball: "连续命中滚存，失手后结算",
      },
      blackjack: {
        standard: "下注 x1",
        dual_bet: "2 局独立结果",
        deferred_double: "奖金延后到下手释放",
        snowball: "连续赢牌滚存，输牌后结算",
      },
      holdem: {
        standard: "买入 x1",
        dual_bet: "2 张联动牌桌",
        deferred_double: "盈利延后到下一桌释放",
        snowball: "连续盈利滚存，失利后结算",
      },
    },
  },
};

export const getPlayModeCopy = (locale: SupportedLocale) => copy[locale];
