# Responsive user interface

Mobile access is enabled in the root layout. The old `MobileWarning` gate has been removed. The viewport uses device width and supports safe areas without restricting browser zoom.

## Layout ownership

- `src/app/responsive.css`: shared dashboard, workspace, modal and touch overrides. Keep component-specific appearance in the existing component styles.
- `src/components/ResponsivePanel`: shared mobile Tools and Featured drawers. Uses a native modal dialog for focus containment, Escape dismissal and an inert background. Desktop retains the existing sidebars.
- Sidebar breakpoint: 1100px. Logo Studio's input panel collapses at 1000px. Extraction editors stack their canvas and settings at 1000px.
- At narrow phone widths the dashboard quick actions use two columns, with Logo Studio spanning both. Project cards use two columns.
- Comparison controls accept pointer input and keyboard arrows. Extraction canvas panning leaves native vertical scrolling available at normal zoom, and captures dragging when zoomed in.
- Crop and eraser dialogs stack their image and controls. Long pricing and editor dialogs scroll within the available viewport.

## Browser verification — 2026-10-27

Checked using browser viewport overrides, including authenticated saved projects. Widths covered: 320/321px, 390/391px, 768px, 1024px, 1280px, and desktop layouts.

| Area | Verified |
| --- | --- |
| Landing | No desktop gate, responsive content and pricing cards |
| Sign in | Dialog fits narrow viewport; terms and authentication flow unchanged |
| Dashboard | Quick actions, upload area, project grid and search |
| Tools / Featured | Drawer opening, closing, account controls, tabs and sample cards |
| Buy credits | Modal stacking above mobile navigation; plans and tabs accessible |
| Logo Studio | Header, modes, collapsible inputs, composer, history, colors and expanded sketch editor |
| Garment extraction | Saved project, stacked previews, settings and exports |
| Comparison | Phone-sized modal and slider keyboard value changes |
| Crop / erase | Image and controls fit in scrollable dialogs; dismissed without saving |
| Background removal | Saved result, comparison slider, properties and export area |
| Upscaling | Saved project layout, preview and settings |
| Store / feedback | Narrow layout and form containment |

No paid generation, destructive edit, checkout, or export was executed for this layout pass. Real iOS/Android hardware, the native file chooser, physical touch/pinch behavior, and mobile downloads still need device testing.

The automated suite currently reports 165/166 passing. The existing Elite pricing test expects the previous promotional banner copy (`INCLUDED WITH ₱899 ELITE`), which no longer appears in the redesigned pricing component. That unrelated assertion was not changed for this responsive work.
