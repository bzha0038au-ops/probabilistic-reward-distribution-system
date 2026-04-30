import rawTokens from './tokens.json';

export const designTokens = rawTokens;

export type DesignTokens = typeof designTokens;

export const brandColorTokens = designTokens.color.brand;
export const webColorTokens = designTokens.color.web;
export const mobileColorTokens = designTokens.color.mobile;
export const mobilePaletteTokens = mobileColorTokens.palette;
export const mobileSurfaceTokens = mobileColorTokens.surface;
export const mobileFeedbackTokens = mobileColorTokens.feedback;
export const mobileDrawRarityTokens = mobileColorTokens.drawRarity;
export const mobileSlotSymbolTokens = mobileColorTokens.slotSymbols;
export const mobileGameTokens = mobileColorTokens.game;
export const spacingTokens = designTokens.spacing;
export const radiusTokens = designTokens.radius;
export const typographyTokens = designTokens.typography;

type TailwindFontSizeValue = [
  fontSize: string,
  configuration: {
    lineHeight: string;
    letterSpacing?: string;
  },
];

const pxToRem = (value: number) => `${value / 16}rem`;
const pxToCss = (value: number) => `${value}px`;
const toKebabCase = (value: string) =>
  value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);

const createCssVarRecord = <T extends Record<string, string | number>>(
  entries: T,
  prefix: string,
  formatter: (value: T[keyof T]) => string = (value) => String(value),
) =>
  Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [
      `--${prefix}-${toKebabCase(key)}`,
      formatter(value as T[keyof T]),
    ]),
  ) as Record<`--${string}`, string>;

const createVarReferenceRecord = <T extends Record<string, string | number>>(
  entries: T,
  prefix: string,
) =>
  Object.fromEntries(
    Object.keys(entries).map((key) => [
      key,
      `var(--${prefix}-${toKebabCase(key)})`,
    ]),
  ) as Record<Extract<keyof T, string>, string>;

const brandCssVariables = createCssVarRecord(brandColorTokens, 'color-brand');
const brandTailwindColors = createVarReferenceRecord(brandColorTokens, 'color-brand');
const spacingCssVariables = createCssVarRecord(spacingTokens, 'space', pxToRem);
const radiusCssVariables = createCssVarRecord(radiusTokens, 'radius', pxToRem);
const fontSizeCssVariables = createCssVarRecord(
  typographyTokens.fontSize,
  'font-size',
  pxToRem,
);
const lineHeightCssVariables = createCssVarRecord(
  typographyTokens.lineHeight,
  'line-height',
  pxToRem,
);
const letterSpacingCssVariables = createCssVarRecord(
  typographyTokens.letterSpacing,
  'letter-spacing',
  pxToCss,
);
const fontFamilyCssVariables = {
  '--font-family-mono': typographyTokens.fontFamily.mono.default,
} as const satisfies Record<`--${string}`, string>;

export const webRootCssVariables = {
  '--color-background': webColorTokens.background,
  '--color-foreground': webColorTokens.foreground,
  '--color-card': webColorTokens.card,
  '--color-card-foreground': webColorTokens.cardForeground,
  '--color-popover': webColorTokens.popover,
  '--color-popover-foreground': webColorTokens.popoverForeground,
  '--color-primary': webColorTokens.primary,
  '--color-primary-foreground': webColorTokens.primaryForeground,
  '--color-secondary': webColorTokens.secondary,
  '--color-secondary-foreground': webColorTokens.secondaryForeground,
  '--color-muted': webColorTokens.muted,
  '--color-muted-foreground': webColorTokens.mutedForeground,
  '--color-accent': webColorTokens.accent,
  '--color-accent-foreground': webColorTokens.accentForeground,
  '--color-destructive': webColorTokens.destructive,
  '--color-destructive-foreground': webColorTokens.destructiveForeground,
  '--color-border': webColorTokens.border,
  '--color-input': webColorTokens.input,
  '--color-ring': webColorTokens.ring,
  ...brandCssVariables,
  ...spacingCssVariables,
  ...radiusCssVariables,
  ...fontSizeCssVariables,
  ...lineHeightCssVariables,
  ...letterSpacingCssVariables,
  ...fontFamilyCssVariables,
} as const satisfies Record<`--${string}`, string>;

export const tailwindSpacingScale = createVarReferenceRecord(spacingTokens, 'space');

export const tailwindFontSizeScale: Record<string, TailwindFontSizeValue> = {
  'label-xs': [
    'var(--font-size-label-xs)',
    {
      lineHeight: 'var(--line-height-label)',
      letterSpacing: 'var(--letter-spacing-subtle)',
    },
  ],
  'label-sm': [
    'var(--font-size-label-sm)',
    {
      lineHeight: 'var(--line-height-label)',
      letterSpacing: 'var(--letter-spacing-label)',
    },
  ],
  body: [
    'var(--font-size-body)',
    {
      lineHeight: 'var(--line-height-body)',
    },
  ],
  'body-lg': [
    'var(--font-size-body-lg)',
    {
      lineHeight: 'var(--line-height-body-relaxed)',
    },
  ],
  'title-sm': [
    'var(--font-size-title-sm)',
    {
      lineHeight: 'var(--line-height-body-relaxed)',
    },
  ],
  'title-base': [
    'var(--font-size-title-base)',
    {
      lineHeight: 'var(--line-height-body)',
    },
  ],
  hero: [
    'var(--font-size-hero)',
    {
      lineHeight: 'var(--line-height-hero)',
    },
  ],
  metric: [
    'var(--font-size-metric)',
    {
      lineHeight: 'var(--font-size-metric)',
    },
  ],
};

export const tailwindThemeExtension = {
  colors: {
    border: 'hsl(var(--color-border))',
    input: 'hsl(var(--color-input))',
    ring: 'hsl(var(--color-ring))',
    background: 'hsl(var(--color-background))',
    foreground: 'hsl(var(--color-foreground))',
    primary: {
      DEFAULT: 'hsl(var(--color-primary))',
      foreground: 'hsl(var(--color-primary-foreground))',
    },
    secondary: {
      DEFAULT: 'hsl(var(--color-secondary))',
      foreground: 'hsl(var(--color-secondary-foreground))',
    },
    destructive: {
      DEFAULT: 'hsl(var(--color-destructive))',
      foreground: 'hsl(var(--color-destructive-foreground))',
    },
    muted: {
      DEFAULT: 'hsl(var(--color-muted))',
      foreground: 'hsl(var(--color-muted-foreground))',
    },
    accent: {
      DEFAULT: 'hsl(var(--color-accent))',
      foreground: 'hsl(var(--color-accent-foreground))',
    },
    popover: {
      DEFAULT: 'hsl(var(--color-popover))',
      foreground: 'hsl(var(--color-popover-foreground))',
    },
    card: {
      DEFAULT: 'hsl(var(--color-card))',
      foreground: 'hsl(var(--color-card-foreground))',
    },
    brand: brandTailwindColors,
  },
  borderRadius: {
    xs: 'var(--radius-xs)',
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    xl: 'var(--radius-xl)',
    full: 'var(--radius-full)',
  },
  spacing: tailwindSpacingScale,
  fontSize: tailwindFontSizeScale,
  fontFamily: {
    mono: ['var(--font-family-mono)'] as string[],
  },
} as const;

export const webThemeColor = mobilePaletteTokens.background;
