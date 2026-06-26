---
name: Syncraft Aesthetic
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c5c9b0'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8e937c'
  outline-variant: '#444936'
  surface-tint: '#add531'
  primary: '#ffffff'
  on-primary: '#283500'
  primary-container: '#c8f24d'
  on-primary-container: '#556d00'
  inverse-primary: '#4f6600'
  secondary: '#d1bcff'
  on-secondary: '#3d0090'
  secondary-container: '#561cb7'
  on-secondary-container: '#c2a7ff'
  tertiary: '#ffffff'
  on-tertiary: '#2f3131'
  tertiary-container: '#e2e2e2'
  on-tertiary-container: '#636565'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c8f24d'
  primary-fixed-dim: '#add531'
  on-primary-fixed: '#161f00'
  on-primary-fixed-variant: '#3b4d00'
  secondary-fixed: '#eaddff'
  secondary-fixed-dim: '#d1bcff'
  on-secondary-fixed: '#24005b'
  on-secondary-fixed-variant: '#561cb7'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: Sora
    fontSize: 72px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  display-lg-mobile:
    fontFamily: Sora
    fontSize: 40px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Sora
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Sora
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  gutter: 16px
  margin-mobile: 20px
  margin-desktop: 64px
  container-max: 1440px
---

## Brand & Style

The visual identity of this design system is rooted in the "Neo-Technical" movement, blending high-energy digital colors with the structural rigors of editorial layout. It is designed for a tech-savvy audience that values precision, speed, and a forward-thinking attitude.

The style is defined by **High-Contrast / Bold** aesthetics. It utilizes a deep dark mode foundation to allow vibrant accents to pop with maximum luminosity. The interface should feel like a high-end developer environment—organized, modular, and uncompromisingly modern. High-impact typography and a strict adherence to a grid ensure that even the most complex data feels accessible and authoritative.

## Colors

This design system employs a high-contrast dark palette to create a sense of depth and focus. 

- **Primary (Lime Green):** Used for primary actions, success states, and critical highlights. It represents energy and technical growth.
- **Secondary (Electric Purple):** Reserved for decorative elements, badges, and secondary features to provide a sophisticated digital counterpoint to the lime.
- **Neutrals:** The background is a true pitch black (#0D0D0D) to minimize bezel interference, while nested containers use a slightly lighter surface gray (#1A1A1A) to establish hierarchy.
- **Typography:** Pure white is used for maximum legibility against dark backgrounds, with secondary text utilizing a 60% opacity to recede in the visual stack.

## Typography

Typography in the design system is a tool for impact and structural clarity. 

**Sora** is the display typeface, chosen for its geometric technicality and wide apertures, which maintain legibility even at heavy weights. It should be used for all headings and large-scale data points.

**Geist** provides the functional backbone for body copy and UI labels. As a typeface designed for developers, it offers exceptional clarity for technical documentation and dense interface layouts. 

Large display headings should use "Tight" tracking to create a unified block-like appearance, while small labels should use "Wide" tracking and uppercase styling to ensure they remain distinct from body content.

## Layout & Spacing

The design system utilizes a **Fixed Grid** model for desktop and a **Fluid Grid** for mobile devices. 

- **Desktop (1440px+):** A 12-column grid with a 1440px max-width, 16px gutters, and generous 64px outer margins. This creates a "canvas" feel that centers the tech-focused content.
- **Mobile (<768px):** A 4-column fluid grid with 20px margins.
- **Rhythm:** Spacing follows a strict 4px base unit. Component internal padding should prioritize "Squish" spacing (e.g., 12px top/bottom, 24px left/right) to emphasize the horizontal modularity of the cards.

Modular cards should snap to the grid columns, often spanning 4 columns on desktop to create a clean three-card row aesthetic.

## Elevation & Depth

Depth in this design system is achieved through **Tonal Layers** rather than shadows. 

The interface is deliberately flat and structural. Hierarchy is communicated via color contrast and border treatments:
1. **Level 0 (Background):** Pure black (#0D0D0D).
2. **Level 1 (Cards/Modules):** Surface gray (#1A1A1A) with a subtle 1px border (#333333).
3. **Level 2 (Popovers/Tooltips):** Surface gray with a high-contrast Lime Green border or a slight secondary purple tint to indicate temporary "over-layer" status.

No ambient shadows are permitted. If a sense of "lift" is required, use a 1px solid border in a lighter neutral or the primary accent color.

## Shapes

The shape language is "Precision-Softened." 

While the overall layout is rigid and grid-based, individual modules utilize a **Soft (0.25rem)** corner radius. This prevents the UI from feeling overly aggressive or "sharp," providing a hint of modern refinement. 

- **Standard Elements:** 4px (0.25rem) radius for inputs and small cards.
- **Large Containers:** 8px (0.5rem) radius for main content blocks.
- **Action Elements:** Buttons may occasionally use a fully rounded "Pill" shape if they are floating actions, but standard UI buttons should stick to the soft-square aesthetic.

## Components

### Buttons
Primary buttons use the Primary Lime Green background with black text for maximum contrast. They should feel like "blocks" within the interface. Hover states should shift to the Secondary Purple.

### Cards
Cards are the primary organizational unit. They feature a 1px border (#333333) and an optional "accent tab" (a 4px solid line at the top or side) using the primary color to denote category or status.

### Input Fields
Inputs are dark-filled (#0D0D0D) with a subtle border. On focus, the border transitions to a 2px Primary Lime Green stroke. Labels sit above the field in uppercase Geist.

### Chips & Badges
Small, high-contrast pills used for tags. Use the Secondary Purple for feature tags and Primary Lime for status indicators (e.g., "Active" or "Live").

### Lists
Lists should be separated by thin, low-opacity horizontal rules. Use monospaced numbers for ordered lists to lean into the technical aesthetic.