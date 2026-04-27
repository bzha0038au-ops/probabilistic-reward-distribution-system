import { Platform, type ViewStyle } from "react-native";
import type { DrawPrizeRarity } from "@reward/shared-types/draw";

export const mobilePalette = {
  background: "#08111f",
  panel: "#102038",
  panelMuted: "#152844",
  border: "#274166",
  accent: "#39d0ff",
  accentMuted: "#d6f6ff",
  text: "#f7fbff",
  textMuted: "#9ab2ce",
  danger: "#ff7d7d",
  success: "#6ae5b1",
  warning: "#ffd76a",
  input: "#0c1b30",
} as const;

export const mobileTypography = {
  mono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  }),
} as const;

export function createPlatformShadow(
  nativeShadow: ViewStyle,
  webBoxShadow: NonNullable<ViewStyle["boxShadow"]>,
): ViewStyle {
  return Platform.OS === "web" ? { boxShadow: webBoxShadow } : nativeShadow;
}

export const mobileSurfaceTheme = {
  primaryTextOnAccent: "#031320",
  cardFace: "#ffffff",
  cardInk: "#0f172a",
  cardInkDanger: "#dc2626",
  gamePanel: "#0b1525",
  reelPanel: "#09111d",
  insetPanel: "#0d1a2b",
  progressTrack: "#0c182b",
  activePanel: "#082f49",
  slotCabinetBase: "#08111f",
  slotCabinetWin: "#211304",
  slotCabinetBlocked: "#1c0c11",
} as const;

export const mobileFeedbackTheme = {
  success: {
    borderColor: "#1f6d55",
    backgroundColor: "#0d2c24",
    accentColor: mobilePalette.success,
  },
  warning: {
    borderColor: "#7a6328",
    backgroundColor: "#2d2614",
    accentColor: mobilePalette.warning,
  },
  warningSoft: {
    borderColor: "#7c6120",
    backgroundColor: "rgba(255, 215, 106, 0.08)",
    accentColor: mobilePalette.warning,
  },
  danger: {
    borderColor: "#7a2836",
    backgroundColor: "#2d141b",
    accentColor: mobilePalette.danger,
  },
  dangerButton: {
    borderColor: "#7a2836",
    backgroundColor: "#3a161d",
  },
  info: {
    borderColor: "#23617b",
    backgroundColor: "#0f2d39",
    accentColor: mobilePalette.accentMuted,
  },
  infoHero: {
    borderColor: "#29587f",
    backgroundColor: "#0f2135",
    accentColor: "#9edfff",
  },
  active: {
    borderColor: "#38bdf8",
    backgroundColor: "#082f49",
    accentColor: mobilePalette.text,
  },
  gold: {
    borderColor: "#b7791f",
    backgroundColor: "#3a2411",
    accentColor: "#ffe4a6",
  },
} as const;

export const mobileDrawRarityTones: Record<
  DrawPrizeRarity,
  { backgroundColor: string; borderColor: string; tintColor: string }
> = {
  common: {
    backgroundColor: "#18273b",
    borderColor: "#314861",
    tintColor: "#d7e7f8",
  },
  rare: {
    backgroundColor: "#10293f",
    borderColor: "#23577c",
    tintColor: "#bfefff",
  },
  epic: {
    backgroundColor: "#2a1f48",
    borderColor: "#6b46c1",
    tintColor: "#f2d8ff",
  },
  legendary: {
    backgroundColor: "#3a2411",
    borderColor: "#b7791f",
    tintColor: "#ffe4a6",
  },
};

export const mobileSlotSymbolTheme = {
  crown: {
    tintColor: "#ffe3a1",
    backgroundColor: "#3a2411",
    borderColor: "#b7791f",
  },
  gem: {
    tintColor: "#ffd2ef",
    backgroundColor: "#2c1730",
    borderColor: "#d53f8c",
  },
  star: {
    tintColor: "#bff7ff",
    backgroundColor: "#112838",
    borderColor: "#0ea5c6",
  },
  comet: {
    tintColor: "#d9ddff",
    backgroundColor: "#1e2350",
    borderColor: "#667eea",
  },
  coin: {
    tintColor: "#ffe4aa",
    backgroundColor: "#302516",
    borderColor: "#d69e2e",
  },
  vault: {
    tintColor: "#d7e1ea",
    backgroundColor: "#1c2532",
    borderColor: "#64748b",
  },
} as const;

export const mobileGameTheme = {
  rarity: mobileDrawRarityTones,
  slot: {
    toneBorder: {
      ready: "#23577c",
      win: "#b7791f",
      blocked: "#7a2836",
    },
    shadows: {
      reelLocked: createPlatformShadow(
        {
          shadowColor: "#000000",
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        },
        "0px 6px 12px rgba(0, 0, 0, 0.18)",
      ),
      symbolFocus: createPlatformShadow(
        {
          shadowColor: "#000000",
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        },
        "0px 4px 8px rgba(0, 0, 0, 0.20)",
      ),
    },
    cabinet: {
      default: {
        borderColor: "#23577c",
        backgroundColor: mobileSurfaceTheme.slotCabinetBase,
      },
      win: {
        borderColor: "#b7791f",
        backgroundColor: mobileSurfaceTheme.slotCabinetWin,
      },
      blocked: {
        borderColor: "#7a2836",
        backgroundColor: mobileSurfaceTheme.slotCabinetBlocked,
      },
    },
    pityFill: "#f2b84b",
    symbols: mobileSlotSymbolTheme,
  },
  quickEight: {
    selected: mobileFeedbackTheme.gold,
    hit: mobileFeedbackTheme.success,
  },
  blackjack: {
    hand: {
      borderColor: mobilePalette.border,
      backgroundColor: mobileSurfaceTheme.gamePanel,
    },
    activeHand: mobileFeedbackTheme.active,
    card: {
      backgroundColor: mobileSurfaceTheme.cardFace,
      inkColor: mobileSurfaceTheme.cardInk,
      dangerInkColor: mobileSurfaceTheme.cardInkDanger,
    },
  },
  fairness: {
    hero: mobileFeedbackTheme.infoHero,
    waiting: mobileFeedbackTheme.warningSoft,
    stepsPanel: {
      borderColor: mobilePalette.border,
      backgroundColor: mobileSurfaceTheme.insetPanel,
    },
    hashAccent: mobileFeedbackTheme.infoHero.accentColor,
  },
  rewards: {
    ready: mobileFeedbackTheme.info,
    progressTrack: mobileSurfaceTheme.progressTrack,
  },
} as const;

export const mobileTheme = {
  palette: mobilePalette,
  typography: mobileTypography,
  surfaces: mobileSurfaceTheme,
  feedback: mobileFeedbackTheme,
  games: mobileGameTheme,
} as const;
