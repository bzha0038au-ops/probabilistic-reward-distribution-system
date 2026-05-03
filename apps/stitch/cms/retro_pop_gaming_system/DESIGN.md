---
name: Retro Pop Gaming System
colors:
  surface: '#faf5f5'
  surface-dim: '#d8d3d3'
  surface-bright: '#faf5f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f0ef'
  surface-container: '#ece7e7'
  surface-container-high: '#e6e1e1'
  surface-container-highest: '#e0dcdb'
  on-surface: '#302e2e'
  on-surface-variant: '#5d5b5b'
  inverse-surface: '#0f0e0e'
  inverse-on-surface: '#9f9c9c'
  outline: '#797676'
  outline-variant: '#b0acac'
  surface-tint: '#a23800'
  primary: '#a23800'
  on-primary: '#ffefeb'
  primary-container: '#ff7941'
  on-primary-container: '#431200'
  inverse-primary: '#ff7941'
  secondary: '#4a40e0'
  on-secondary: '#f4f1ff'
  secondary-container: '#cfcdff'
  on-secondary-container: '#3423cd'
  tertiary: '#6d5a00'
  on-tertiary: '#fff2cd'
  tertiary-container: '#fce17e'
  on-tertiary-container: '#615000'
  error: '#b31b25'
  on-error: '#ffefee'
  error-container: '#fb5151'
  on-error-container: '#570008'
  primary-fixed: '#ff7941'
  primary-fixed-dim: '#ee6d36'
  on-primary-fixed: '#000000'
  on-primary-fixed-variant: '#531900'
  secondary-fixed: '#cfcdff'
  secondary-fixed-dim: '#c0bdff'
  on-secondary-fixed: '#2000b0'
  on-secondary-fixed-variant: '#3e32d5'
  tertiary-fixed: '#fce17e'
  tertiary-fixed-dim: '#edd372'
  on-tertiary-fixed: '#4c3e00'
  on-tertiary-fixed-variant: '#6d5a00'
  primary-dim: '#8e3000'
  secondary-dim: '#3d30d4'
  tertiary-dim: '#5f4e00'
  error-dim: '#9f0519'
  background: '#faf5f5'
  on-background: '#302e2e'
  surface-variant: '#e0dcdb'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 38px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
  label-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
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
  margin: 20px
---

## Brand & Style

This design system is built on a "Retro Pop" foundation—a vibrant, energetic aesthetic that balances nostalgia with modern mobile-native precision. It eschews the complexity of 3D renders and the sterile nature of modern dashboards for a flat, vector-driven approach. 

The brand personality is playful, rewarding, and deeply trustworthy. It prioritizes a "game-first" experience where the interface feels like an extension of the gameplay itself. The style leverages high-contrast flat design, utilizing consistent 2pt strokes and subtle halftone textures to provide character without introducing dated skeuomorphism. The emotional goal is to evoke the joy of a classic arcade updated for a sophisticated, modern mobile user.

## Colors

The palette centers on "Electric Orange" as the primary driver for action, supported by a deep "Cyber Indigo" for contrast and "Trophy Gold" for reward-centric moments. Unlike fintech palettes that use desaturated tones, this system uses highly saturated primaries grounded by a near-black neutral and an off-white "Paper" background to reduce eye strain while maintaining a retro comic-book feel.

Halftone patterns should be applied as overlays on primary and secondary colors using a Multiply blend mode at 10-15% opacity to add tactile grit without breaking the flat vector aesthetic.

## Typography

Typography is used to reinforce the friendly and approachable nature of the system. **Plus Jakarta Sans** is utilized for headings; its soft curves and wide apertures provide a welcoming, "pop" feel. For body copy and functional UI elements, **Be Vietnam Pro** offers exceptional legibility at small sizes while maintaining a contemporary, warm tone.

Headlines should always use heavy weights (700+) to compete with the bold visual elements. Tracking is slightly tightened on larger display type to ensure a punchy, compact appearance.

## Layout & Spacing

This design system employs a fluid 4-column grid for mobile, optimized for thumb-reachability. The spacing rhythm is based on a 4px baseline unit, ensuring all components align to a consistent mathematical scale. 

Layouts are primarily card-based. To avoid a "SaaS" look, cards do not use expansive white space; instead, they use tight internal padding (16px) and are grouped to create dense, information-rich zones that feel like game menus. Vertical stacks are preferred over horizontal carousels to maintain a fast, scroll-heavy mobile-native flow.

## Elevation & Depth

Depth in this system is conveyed through **Bold Borders** and **Hard Offsets** rather than soft ambient shadows. 

1.  **Strokes:** Every interactive container and button features a solid 2px stroke in the neutral "Near Black" color.
2.  **Hard Shadows:** To indicate elevation, elements use a "Block Shadow"—a solid, non-blurred offset fill (usually 4px down and 4px right) in the neutral color.
3.  **Flat Stacking:** Inactive layers are purely flat. When an element is pressed, the hard shadow disappears, and the element shifts 2px down/right to simulate a physical button press.
4.  **Halftone Overlays:** Used sparingly on top-tier surfaces (like featured rewards) to create visual "lift" and texture.

## Shapes

The shape language is "Rounded-Geometric." The standard corner radius is 16px (1rem), which provides a friendly, toy-like quality that contrasts against the aggressive 2px strokes. 

- **Containers:** 16px radius.
- **Buttons:** 12px radius or full pill-shape depending on the context.
- **Icons:** Housed within circular or "squircle" enclosures to ensure they feel like collectible tokens or game assets.
- **Strokes:** All stroke joins and caps must be rounded to match the typography.

## Components

**Buttons**
Buttons are the primary interaction point. They feature a 2px stroke and a 4px hard block shadow. The "Primary Action" button uses the Electric Orange fill with white bold text. When tapped, the button translates -4px on the Y-axis and the shadow is hidden, creating a tactile "click."

**Cards**
Cards use a white or light-grey surface with a 2px neutral border. Headers within cards are often separated by a horizontal 2px line. For reward-centric cards, use a secondary color fill for the header area with a halftone texture.

**Chips & Tags**
Chips are used for category filtering and status indicators. They are pill-shaped with a 1px stroke. Active chips swap their fill color to Cyber Indigo with white text.

**Progress Bars**
Essential for the "reward-centric" mood. These are thick (12px+), featuring a neutral border and a vibrant fill. The "fill" should have a diagonal stripe pattern or halftone texture to make progress feel substantial and earned.

**Input Fields**
Inputs are simple and legible. They use the same 2px stroke as other elements. Focus states are indicated by the hard block shadow appearing, rather than a color change of the border, maintaining the retro-pop aesthetic.

**Lists**
List items are separated by 2px solid lines. Every list item should include a leading icon or thumbnail to maintain the "game-first" visual density. Avoid plain text lists.