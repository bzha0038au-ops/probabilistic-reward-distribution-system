import { Platform, type ViewStyle } from "react-native";
import {
  mobileDrawRarityTokens,
  mobileGameTokens,
  mobileSlotSymbolTokens,
  radiusTokens,
  spacingTokens,
  typographyTokens,
} from "@reward/design-tokens";
import type { DrawPrizeRarity } from "@reward/shared-types/draw";

export const mobilePalette = {
  background: "#080b14",
  panel: "#121a2a",
  panelMuted: "#1a2335",
  border: "#d7a53f",
  accent: "#f7c340",
  accentMuted: "#a56612",
  text: "#fff2cf",
  textMuted: "#c7b487",
  danger: "#ff6245",
  success: "#6fda8a",
  warning: "#f7c340",
  input: "#101826",
} as const;

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

export const mobileChromeTheme = {
  borderWidth: 2,
  cardShadow: createPlatformShadow(
    {
      shadowColor: "#000000",
      shadowOpacity: 0.34,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
    "0px 10px 22px rgba(0, 0, 0, 0.34)",
  ),
  cardShadowSm: createPlatformShadow(
    {
      shadowColor: "#000000",
      shadowOpacity: 0.28,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 7,
    },
    "0px 6px 14px rgba(0, 0, 0, 0.28)",
  ),
  pressedShadow: createPlatformShadow(
    {
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    },
    "0px 0px 0px transparent",
  ),
} as const;

export const mobileLayoutTheme = {
  heroMinHeight: 196,
  cardPadding: spacingTokens["3xl"],
  cardPaddingLg: spacingTokens["4xl"],
  sectionGap: spacingTokens["4xl"],
  fieldHeight: 54,
  buttonHeight: 52,
  buttonCompactHeight: 44,
  badgeHeight: 32,
} as const;

export const mobileOverlayTheme = {
  backdrop: "rgba(4, 6, 12, 0.78)",
  softBackdrop: "rgba(10, 14, 22, 0.94)",
  warmTint: "rgba(255, 154, 42, 0.22)",
  coolTint: "rgba(94, 116, 255, 0.18)",
} as const;

export const mobileSurfaceTheme = {
  primaryTextOnAccent: "#241605",
  cardFace: "#fff4dc",
  cardInk: "#23170a",
  cardInkDanger: "#c24738",
  gamePanel: "#121a2a",
  reelPanel: "#181223",
  insetPanel: "#171f31",
  progressTrack: "#31405d",
  activePanel: "#324f8e",
  slotCabinetBase: "#4a1420",
  slotCabinetWin: "#6f1c24",
  slotCabinetBlocked: "#3c1821",
} as const;

export const mobileFeedbackTheme = {
  success: {
    borderColor: mobilePalette.border,
    backgroundColor: "#11291a",
    accentColor: mobilePalette.success,
  },
  warning: {
    borderColor: mobilePalette.border,
    backgroundColor: "#35270e",
    accentColor: mobilePalette.warning,
  },
  warningSoft: {
    borderColor: mobilePalette.border,
    backgroundColor: "#2b2312",
    accentColor: mobilePalette.warning,
  },
  danger: {
    borderColor: mobilePalette.border,
    backgroundColor: "#321518",
    accentColor: mobilePalette.danger,
  },
  dangerButton: {
    borderColor: mobilePalette.border,
    backgroundColor: "#d84d34",
  },
  info: {
    borderColor: mobilePalette.border,
    backgroundColor: "#172643",
    accentColor: "#8cb4ff",
  },
  infoHero: {
    borderColor: mobilePalette.border,
    backgroundColor: "#211630",
    accentColor: "#f0bb47",
  },
  active: {
    borderColor: mobilePalette.border,
    backgroundColor: "#4f43f1",
    accentColor: "#fff7e5",
  },
  gold: {
    borderColor: mobilePalette.border,
    backgroundColor: "#f7c340",
    accentColor: "#241605",
  },
} as const;

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
  chrome: mobileChromeTheme,
  layout: mobileLayoutTheme,
  overlay: mobileOverlayTheme,
  surfaces: mobileSurfaceTheme,
  feedback: mobileFeedbackTheme,
  games: mobileGameTheme,
} as const;
