import type { PlayModeCopy } from "./ui";

type SupportedLocale = "en" | "zh-CN";

const copy: Record<SupportedLocale, PlayModeCopy> = {
  en: {
    title: "Play mode",
    subtitle: "Strategy wrappers stay above the core game engine.",
    currentLabel: "Current",
    nextLabel: "Next",
    streakLabel: "Streak",
    carryActive: "Carry armed",
    carryIdle: "Idle",
    modes: {
      standard: "Standard",
      dual_bet: "Dual bet",
      deferred_double: "Deferred x2",
      snowball: "Snowball",
    },
  },
  "zh-CN": {
    title: "玩法增强",
    subtitle: "策略包装停留在 service 层，不下沉到游戏引擎。",
    currentLabel: "当前",
    nextLabel: "下次",
    streakLabel: "连击",
    carryActive: "已挂起",
    carryIdle: "待机",
    modes: {
      standard: "标准",
      dual_bet: "双倍下注",
      deferred_double: "递延翻倍",
      snowball: "滚雪球",
    },
  },
};

export const getPlayModeCopy = (locale: SupportedLocale) => copy[locale];
