---
name: Retro Pop Gaming System
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1c1b1b'
  on-surface-variant: '#5b4137'
  inverse-surface: '#313030'
  inverse-on-surface: '#f3f0ef'
  outline: '#8f7065'
  outline-variant: '#e4beb1'
  surface-tint: '#a73a00'
  primary: '#a73a00'
  on-primary: '#ffffff'
  primary-container: '#ff5c00'
  on-primary-container: '#521800'
  inverse-primary: '#ffb59a'
  secondary: '#4b41e1'
  on-secondary: '#ffffff'
  secondary-container: '#645efb'
  on-secondary-container: '#fffbff'
  tertiary: '#705d00'
  on-tertiary: '#ffffff'
  tertiary-container: '#caa900'
  on-tertiary-container: '#4c3e00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbce'
  primary-fixed-dim: '#ffb59a'
  on-primary-fixed: '#370e00'
  on-primary-fixed-variant: '#802a00'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c3c0ff'
  on-secondary-fixed: '#0f0069'
  on-secondary-fixed-variant: '#3323cc'
  tertiary-fixed: '#ffe170'
  tertiary-fixed-dim: '#e9c400'
  on-tertiary-fixed: '#221b00'
  on-tertiary-fixed-variant: '#544600'
  background: '#fcf9f8'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e1'
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