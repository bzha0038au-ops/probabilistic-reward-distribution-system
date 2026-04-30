import { Platform, type ViewStyle } from "react-native";
import {
  mobileDrawRarityTokens,
  mobileFeedbackTokens,
  mobileGameTokens,
  mobilePaletteTokens,
  mobileSlotSymbolTokens,
  mobileSurfaceTokens,
  radiusTokens,
  spacingTokens,
  typographyTokens,
} from "@reward/design-tokens";
import type { DrawPrizeRarity } from "@reward/shared-types/draw";

export const mobilePalette = mobilePaletteTokens;

export const mobileSpacing = spacingTokens;

export const mobileRadii = radiusTokens;

export const mobileTypeScale = {
  fontSize: typographyTokens.fontSize,
  lineHeight: typographyTokens.lineHeight,
  letterSpacing: typographyTokens.letterSpacing,
} as const;

export const mobileTypography = {
  mono: Platform.select({
    ios: typographyTokens.fontFamily.mono.ios,
    android: typographyTokens.fontFamily.mono.android,
    default: typographyTokens.fontFamily.mono.default,
  }),
} as const;

export function createPlatformShadow(
  nativeShadow: ViewStyle,
  webBoxShadow: NonNullable<ViewStyle["boxShadow"]>,
): ViewStyle {
  return Platform.OS === "web" ? { boxShadow: webBoxShadow } : nativeShadow;
}

export const mobileSurfaceTheme = mobileSurfaceTokens;

export const mobileFeedbackTheme = mobileFeedbackTokens;

export const mobileDrawRarityTones: Record<
  DrawPrizeRarity,
  { backgroundColor: string; borderColor: string; tintColor: string }
> = mobileDrawRarityTokens;

export const mobileSlotSymbolTheme = mobileSlotSymbolTokens;

export const mobileGameTheme = {
  rarity: mobileDrawRarityTones,
  slot: {
    toneBorder: mobileGameTokens.slot.toneBorder,
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
        borderColor: mobileGameTokens.slot.toneBorder.ready,
        backgroundColor: mobileSurfaceTheme.slotCabinetBase,
      },
      win: {
        borderColor: mobileGameTokens.slot.toneBorder.win,
        backgroundColor: mobileSurfaceTheme.slotCabinetWin,
      },
      blocked: {
        borderColor: mobileGameTokens.slot.toneBorder.blocked,
        backgroundColor: mobileSurfaceTheme.slotCabinetBlocked,
      },
    },
    pityFill: mobileGameTokens.slot.pityFill,
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
  spacing: mobileSpacing,
  radii: mobileRadii,
  typography: mobileTypography,
  typeScale: mobileTypeScale,
  surfaces: mobileSurfaceTheme,
  feedback: mobileFeedbackTheme,
  games: mobileGameTheme,
} as const;
