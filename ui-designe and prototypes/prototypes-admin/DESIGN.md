---
name: STRIDE
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c2caad'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8c9479'
  outline-variant: '#424a33'
  surface-tint: '#9cd900'
  primary: '#ffffff'
  on-primary: '#243600'
  primary-container: '#b2f700'
  on-primary-container: '#4e6e00'
  inverse-primary: '#496800'
  secondary: '#d8bbf6'
  on-secondary: '#3c2656'
  secondary-container: '#563f71'
  on-secondary-container: '#c9ade7'
  tertiary: '#ffffff'
  on-tertiary: '#313030'
  tertiary-container: '#e5e2e1'
  on-tertiary-container: '#656464'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#b2f700'
  primary-fixed-dim: '#9cd900'
  on-primary-fixed: '#131f00'
  on-primary-fixed-variant: '#364e00'
  secondary-fixed: '#eedbff'
  secondary-fixed-dim: '#d8bbf6'
  on-secondary-fixed: '#260f40'
  on-secondary-fixed-variant: '#533c6e'
  tertiary-fixed: '#e5e2e1'
  tertiary-fixed-dim: '#c9c6c5'
  on-tertiary-fixed: '#1c1b1b'
  on-tertiary-fixed-variant: '#474646'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: archivoNarrow
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: archivoNarrow
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: archivoNarrow
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  title-md:
    fontFamily: inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.5'
  body-md:
    fontFamily: inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: jetbrainsMono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.05em
spacing:
  unit: 4px
  gutter: 24px
  margin-desktop: 40px
  margin-mobile: 16px
  container-max: 1440px
---

## Brand & Style

The design system embodies the high-performance energy of elite athletics, translated into a data-driven administrative environment. The brand personality is aggressive yet disciplined, leaning into a **High-Contrast / Bold** aesthetic that prioritizes speed of comprehension and professional-grade precision.

The target audience consists of high-stakes retail managers and performance analysts who require a "Command Center" feel. The UI evokes focus, prestige, and urgency through expansive dark surfaces punctuated by high-vibrancy accents. This is a technical environment that feels like a premium sportswear flagship store after hours—moody, sharp, and expensive.

## Colors

The color palette is built on a "Deep Night" foundation to allow high-visibility accents to pop without causing eye fatigue. 

- **Primary (Electric Lime):** Used for critical calls to action, performance peaks, and active states. It provides the highest contrast against the charcoal base.
- **Secondary (Lavender):** A softer accent for secondary data streams and decorative elements, providing a sophisticated counterpoint to the aggressive Lime.
- **Base Surfaces:** The background uses a near-black charcoal (#0a0a0a) to create infinite depth. Cards and containers use a slightly elevated grey (#141414) to establish hierarchy.
- **Typography:** Headlines are pure white for maximum impact. Body text is muted to #a3a3a3 to reduce glare and improve long-form legibility in dark mode.

## Typography

The typographic system utilizes a triple-threat font strategy to reinforce the technical and athletic narrative.

1.  **Headlines (Archivo Narrow):** Bold, condensed, and powerful. All major headings should be uppercase to mimic stadium signage and high-performance branding.
2.  **Body (Inter):** A systematic, highly legible sans-serif for complex data tables and settings.
3.  **Data Labels (JetBrains Mono):** Monospaced fonts are used for IDs, SKU numbers, and performance metrics to provide a technical, developer-adjacent aesthetic that feels precise.

Scale is aggressive; large display type is used for key performance indicators (KPIs), while labels remain small and tight.

## Layout & Spacing

The design system utilizes a **Fixed Grid** model for desktop to maintain a cinematic, controlled composition, transitioning to a fluid model for mobile.

- **Desktop:** 12-column grid with a 1440px max-width. Gutters are generous (24px) to allow the dark surfaces to "breathe" and prevent the high-contrast elements from feeling cluttered.
- **Spacing Rhythm:** Based on a 4px base unit. Consistent use of 16px, 24px, and 40px increments ensures a modular feel.
- **Alignment:** Content is strictly aligned to the grid, emphasizing the "disciplined" nature of the brand. Negative space is used as a luxury element—wide margins around key metrics focus the user's attention.

## Elevation & Depth

In this dark-themed system, elevation is conveyed through **Tonal Layers** and **Low-Contrast Outlines** rather than traditional shadows.

1.  **Z-0 (Background):** #0a0a0a. The deepest layer.
2.  **Z-1 (Cards/Containers):** #141414. Used for primary content blocks. These elements use a 1px solid border (#262626) to define their edges against the black background.
3.  **Z-2 (Modals/Popovers):** #1c1c1c. Elevated surfaces receive a subtle Lime-tinted glow (outer glow, 0% blur, 2px spread) only when active or focused.
4.  **Interaction:** Hover states on cards should not lift the element but rather brighten the border color to #404040, maintaining a flat, architectural feel.

## Shapes

The shape language is **Sharp**. To maintain the aggressive, high-performance sportswear aesthetic, all corners are kept at 0px radius. 

This architectural rigidity reflects precision and engineering. Buttons, input fields, cards, and image containers must all adhere to the sharp-edge rule. The only exception is for circular avatars or specific status indicators (pills) used for "Live" or "Active" tracking.

## Components

- **Buttons:** Primary buttons are solid Electric Lime (#b8ff00) with black text (#000000). Secondary buttons use a ghost style with a Lavender (#e0c3ff) border and text. All buttons have 0px border radius.
- **Input Fields:** Dark backgrounds (#0a0a0a) with a 1px border (#262626). On focus, the border changes to Electric Lime. Placeholder text is in a deep grey (#525252).
- **Data Tables:** Row separators use the #262626 border color. Header cells use the monospaced label font. Hovering over a row highlights it with a subtle #1a1a1a background.
- **Chips/Badges:** Small, rectangular (0px radius) boxes. For "Success," use a dark green fill with Lime text. For "Alert," use a dark red fill with white text.
- **Cards:** No shadows. Define structure using the #141414 surface and #262626 border. Use the secondary Lavender color for chart lines or progress bars to provide visual variety.
- **Status Indicators:** "Live" metrics should include a small pulsing dot next to the JetBrains Mono label to signify real-time data flow.