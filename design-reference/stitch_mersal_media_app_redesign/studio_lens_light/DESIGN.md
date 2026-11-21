---
name: Studio Lens & Light
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3d4947'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6d7a77'
  outline-variant: '#bcc9c6'
  surface-tint: '#006a61'
  primary: '#00685f'
  on-primary: '#ffffff'
  primary-container: '#008378'
  on-primary-container: '#f4fffc'
  inverse-primary: '#6bd8cb'
  secondary: '#006b5f'
  on-secondary: '#ffffff'
  secondary-container: '#62fae3'
  on-secondary-container: '#007165'
  tertiary: '#006860'
  on-tertiary: '#ffffff'
  tertiary-container: '#248279'
  on-tertiary-container: '#f3fffc'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#89f5e7'
  primary-fixed-dim: '#6bd8cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#005049'
  secondary-fixed: '#62fae3'
  secondary-fixed-dim: '#3cddc7'
  on-secondary-fixed: '#00201c'
  on-secondary-fixed-variant: '#005047'
  tertiary-fixed: '#9cf2e8'
  tertiary-fixed-dim: '#80d5cb'
  on-tertiary-fixed: '#00201d'
  on-tertiary-fixed-variant: '#00504a'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-lg:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Outfit
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Outfit
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Outfit
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1.25rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system crafts an elevated, serene, and modern operational atmosphere for boutique photography studios and visual artists. It blends the structural rigor of Material Design 3 surface containers with the tactile refinement of an editorial gallery. 

The aesthetic is characterized by generous whitespace, luminous surfaces, and gentle chromatic layering. It conveys creative precision, effortless organization, and calm authority—ensuring studio managers, lead photographers, and clients experience zero friction while handling shoots, shot lists, invoices, and asset proofing.

## Colors

The palette establishes a balance of deep teal anchors, luminous aqua highlights, and crisp slate surfaces:

- **Primary (`#0D9488`)**: Used for core brand elements, selected navigation states, active toggles, and as the grounding base for interactive gradients.
- **Secondary (`#2DD4BF`)**: Acts as a vibrant luminescent accent, paired with primary teal to forge fluid directional gradients on key floating and sticky CTA buttons.
- **Tertiary (`#0F766E`)**: High-contrast dark teal designated for pressed interaction states, active segment tabs, and critical metric highlights.
- **Soft Mint Container (`#CCFBF1`)**: Dedicated container background for active chips, highlighted agenda slots, and low-urgency badge containers, pairing with `#0F766E` text.
- **Surfaces & Canvas**: Base canvas rests on cool `#F8FAFC`, while elevated components, cards, sheets, and dialogs utilize `#FFFFFF`.
- **Text & Structure**: Primary typography utilizes deep slate `#0F172A` for absolute readability; supporting metadata utilizes `#64748B`. Structural container dividers utilize delicate `#E2E8F0`.
- **Status & Alerts**: Success (`#16A34A`), Warning (`#F59E0B`), and Error (`#EF4444`) provide feedback across schedule conflicts, payment balances, and asset delivery deadlines.

## Typography

Typography establishes an editorial tone with high operational clarity. 

- **Display & Headlines (`Outfit`)**: Geometric, rounded proportions echoing modern studio branding, studio titles, client names, and revenue statistics.
- **Interface & Body (`Inter`)**: Engineered for screen legibility at dense mobile scales; handles booking logs, camera settings metadata, client notes, and nested form layouts.
- **Hierarchical Discipline**: Reserve uppercase tracking (`0.04em`) exclusively for `label-sm` when indicating workflow status badges, format chips (RAW, JPG, TIFF), and timestamp tags.

## Layout & Spacing

The layout is built upon an 8px rhythmic grid with a 4px sub-grid for tight micro-alignments:

- **Mobile Canvas**: A 4-column fluid layout with `16px` outer canvas margins and `12px` column gutters. Content cards utilize full-width modular containers with `16px` internal padding.
- **Tablet / Split Screen**: Expands to an 8-column layout with `20px` margins and `16px` gutters, allowing side-by-side scheduling calendars and shoot detail panels.
- **Vertical Spacing Rhythm**: Stack form controls and cards with `16px` (`space-md`) separations. Grouped metadata badges within cards employ `8px` (`space-sm`) gaps to maintain high scannability.

## Elevation & Depth

Visual hierarchy adopts Material Design 3 tonal elevation combined with soft photographic lighting principles:

- **Level 0 (Flat/Base)**: `#F8FAFC` base application background.
- **Level 1 (Card Default)**: `#FFFFFF` card surfaces framed with a 1px border in `#E2E8F0` and an ambient diffuse shadow (`0px 2px 8px -2px rgba(15, 23, 42, 0.05), 0px 1px 3px -1px rgba(15, 23, 42, 0.03)`).
- **Level 2 (Elevated Active Card / Bottom Sheets)**: Raised surface with diffuse depth (`0px 8px 24px -4px rgba(13, 148, 136, 0.08), 0px 4px 8px -2px rgba(15, 23, 42, 0.04)`).
- **Level 3 (Floating Actions & Modals)**: Floated primary triggers featuring a chromatic teal glow (`0px 10px 20px -3px rgba(13, 148, 136, 0.25)`).
- No hard, pitch-black drop shadows are permitted; all elevation shadows are tinted softly with dark slate and brand teal.

## Shapes

The geometric framework balances organic photographic smoothness with crisp modern app structures:

- **Cards & Primary Modules**: Formed with custom `18px` to `20px` corner radii (`rounded-xl` token space), delivering a tactile, friendly sheet appearance.
- **Interactive Input Fields**: Feature `12px` to `14px` border radii (`rounded-lg`), blending accessibility with contemporary visual flow.
- **Badges, Filters & Primary Buttons**: Fully pill-shaped (`9999px` radius) to contrast decisively against the larger card containers.

## Components

### Buttons
- **Primary CTA**: Styled with a 135-degree diagonal gradient from teal `#0D9488` to aqua `#2DD4BF`. White `#FFFFFF` text (`label-lg`), pill-shaped radius (`9999px`), `12px 24px` padding, and Level 3 ambient teal glow. Active/pressed state shifts toward tertiary `#0F766E`.
- **Secondary / Outlined Button**: Transparent fill, 1.5px border in `#0D9488`, text in `#0D9488`. Hover and press trigger `#CCFBF1` at 50% opacity.
- **Ghost Action**: Borderless with `#0D9488` or `#64748B` label text for inline shoot actions and secondary toolbars.

### Status Badges & Chips
- **Status Pills**: Pill-shaped (`9999px`), height `26px`, padding `4px 12px`.
  - *Confirmed / In-Progress*: Background `#CCFBF1`, text `#0F766E`.
  - *Completed*: Background `#DCFCE7`, text `#16A34A`.
  - *Pending / Balance Due*: Background `#FEF3C7`, text `#D97706`.
  - *Canceled*: Background `#FEE2E2`, text `#EF4444`.
- **Filter Chips**: Inactive state features `#FFFFFF` surface with `#E2E8F0` border and `#64748B` text. Active state adopts solid `#0D9488` with `#FFFFFF` text or `#CCFBF1` with `#0F766E` text.

### Cards
- **Session & Gallery Cards**: `#FFFFFF` background, `20px` corner radius, `1px` stroke in `#E2E8F0`. Internal padding is `16px`. Header area houses booking title (`title-md`), studio tag, and pill-shaped status badge. Images inside cards clip to a matching `14px` internal radius.

### Input Fields
- **Text & Select Controls**: Height `48px`, background `#FFFFFF`, border `1.5px` solid `#E2E8F0`, corner radius `14px`, internal padding `0 16px`.
- **States**: Focused inputs transition border to `#0D9488` with a subtle `0 0 0 3px rgba(45, 212, 191, 0.2)` focus ring. Error states transition border to `#EF4444`. Floating labels use `label-md` in `#64748B`.

### Checkboxes & Radio Buttons
- **Checkboxes**: `20px` width/height with a `6px` radius. Unchecked state has `1.5px` border in `#E2E8F0`. Checked state renders full `#0D9488` fill with a white checkmark icon.
- **Radio Buttons**: `20px` outer circle with an `8px` centered indicator circle in `#0D9488` when active.

### Lists & Navigation
- **Shoot Timeline & Schedule Lists**: Separated by clean, edge-to-edge subtle dividers (`#E2E8F0`). List items include leading circular icons or avatar slots (40px, rounded to 12px) and trailing timestamp metadata in `body-sm` (`#64748B`).
- **Bottom Navigation**: Grounded on `#FFFFFF` with Level 2 elevation blur, housing 4 to 5 core destinations with active indicator pills in `#CCFBF1` holding `#0D9488` icons.