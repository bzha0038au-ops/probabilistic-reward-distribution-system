---
name: Retro Pop Gaming System
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1b1b1b'
  on-surface-variant: '#5b4137'
  inverse-surface: '#303030'
  inverse-on-surface: '#f1f1f1'
  outline: '#8f7065'
  outline-variant: '#e4beb1'
  surface-tint: '#a73a00'
  primary: '#a73a00'
  on-primary: '#ffffff'
  primary-container: '#ff5c00'
  on-primary-container: '#521800'
  inverse-primary: '#ffb59a'
  secondary: '#705d00'
  on-secondary: '#ffffff'
  secondary-container: '#fcd400'
  on-secondary-container: '#6e5c00'
  tertiary: '#005bc1'
  on-tertiary: '#ffffff'
  tertiary-container: '#4f90ff'
  on-tertiary-container: '#00295f'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbce'
  primary-fixed-dim: '#ffb59a'
  on-primary-fixed: '#370e00'
  on-primary-fixed-variant: '#802a00'
  secondary-fixed: '#ffe16d'
  secondary-fixed-dim: '#e9c400'
  on-secondary-fixed: '#221b00'
  on-secondary-fixed-variant: '#544600'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a41'
  on-tertiary-fixed-variant: '#004493'
  background: '#f9f9f9'
  on-background: '#1b1b1b'
  surface-variant: '#e2e2e2'
typography:
  display-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.5'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '500'
    lineHeight: '1.5'
  label-bold:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: '1.2'
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-mobile: 20px
---

## Brand & Style

This design system channels the high-energy aesthetics of 90s arcade culture and Neo-Brutalist digital design. It is engineered to evoke excitement, urgency, and playfulness through high-contrast visuals and tactile metaphors. The target audience is mobile-first gamers who value clarity, responsiveness, and a distinct "physical" feel in digital interactions.

The style is defined by **High-Contrast / Bold** elements mixed with **Retro** influences. Key visual drivers include thick, consistent strokes, vibrant spot colors against a clean light backdrop, and the strategic use of halftone patterns to add depth and "ink-on-paper" texture to a digital interface. The emotional response is one of instant gratification and clear feedback loops.

## Colors

The color logic for this design system is aggressive and functional, utilizing high-saturation hues to denote specific game states.

- **Primary Accent (#FF5C00):** Used for primary actions (Spin, Bet, Start) and active navigational states. It is the heat of the interface.
- **Reward/Win (#FFD700):** Reserved exclusively for "Value" moments. Use this for loot drops, coin balances, and jackpot announcements.
- **Danger/Risk/Loss (#FF3B30):** High-alert color used for destructive actions (Fold, Quit), negative balances, or "Game Over" states.
- **Info (#007AFF):** A cooling secondary color used for non-critical information, settings, and utility tooltips.
- **Stroke & Contrast (#000000):** Every interactive element must be bounded by a 2px solid black border to ensure visibility against varied backgrounds.

Halftone textures should be applied as a subtle 10-20% opacity overlay on top of the Primary and Reward colors to create a comic-book print effect.

## Typography

This design system utilizes **Plus Jakarta Sans** for its friendly yet modern geometric proportions. The typographic hierarchy relies on heavy weights (Bold and ExtraBold) to compete with the loud visual environment of the game.

Headlines should use tight tracking to maintain a compact, "impactful" feel. Labels for buttons and interactive chips should always be bold and, in the case of primary actions, set in uppercase to reinforce the arcade aesthetic. Numeric values (prizes, countdowns) should utilize the Display-XL style to ensure they are the focal point of the screen.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** model optimized for mobile portrait orientation. The spacing rhythm is based on a 4px base unit to ensure alignment with the 2px stroke logic.

- **Margins:** A fixed 20px margin is maintained on the left and right edges of the viewport.
- **Gutters:** Standardized 16px gutters between cards and grid items.
- **Padding:** Interactive elements like buttons and input fields use a generous 16px horizontal padding to ensure high "tapability" in high-energy gaming moments.

Components should be stacked vertically with 12px to 16px of separation to prevent accidental taps during rapid gameplay.

## Elevation & Depth

This design system rejects traditional soft shadows in favor of **Bold Borders** and **Hard Shadows (Isometric Style)**.

- **Stroke:** All containers and buttons use a 2px solid black border (#000000).
- **Depth:** To indicate elevation, elements use a "Hard Shadow" — a solid black offset (usually 4px down and 4px right) rather than a blur. This creates a 3D effect reminiscent of pop-art and sticker designs.
- **Interactivity:** When a button is pressed, it should translate 2px down and 2px right, while the hard shadow disappears, mimicking a physical button being depressed into the surface.

## Shapes

The shape language is consistently **Rounded**, striking a balance between the aggressiveness of Brutalism and the approachability of a mobile game. 

The base corner radius is 8px (`rounded-md`). Larger containers or "Hero" cards may use 16px (`rounded-lg`) to soften the visual impact of the thick black strokes. Icons should be encased in circular containers or follow the 8px rounding rule to maintain system harmony. Avoid sharp 90-degree corners to ensure the UI feels "bouncy" and safe.

## Components

- **Buttons:** Primary buttons use the Vibrant Orange background, 2px black stroke, and a 4px black hard shadow. Text is white or black depending on the specific contrast requirement, always Bold. Secondary buttons use the Info Blue.
- **Action Chips:** Smaller, pill-shaped variants used for filters or small bets. Use a 2px stroke and no shadow until selected.
- **Game Cards:** White backgrounds with 2px strokes. Header areas of cards can use the halftoned color blocks to categorize content (e.g., a Gold header for "Rewards").
- **Modals/Alerts:** High-impact overlays. "Win" modals use the Gold palette with a halftone burst effect in the background. "Danger" alerts for losses use the Red palette with a vibrating animation effect.
- **Input Fields:** Thick 2px black borders. On focus, the border remains black but the background shifts to a very light tint of the Primary Orange.
- **Progress Bars:** Thick black container with a "solid" fill of the Info Blue or Gold, depending on the context of the progress (leveling up vs. earning a reward).