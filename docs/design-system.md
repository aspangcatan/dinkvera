# Design system

All tokens live in [src/assets/styles/main.css](../src/assets/styles/main.css).

## Color

**Platform palette.** Carried over from match-pickleball so the two
products feel related:

- `forest-50…900`: primary green. The Super Admin sidebar is `forest-900`.
- `lime-50…600`: highlight. Used sparingly for the admin badge, the marketing CTA and the active icon on the platform sidebar.
- `charcoal-50…700`: neutrals for text, borders and muted surfaces.
- `warm-white` (marketing and storefront backgrounds), `canvas` (dashboard background).

**Tenant brand scale.** Each business picks one primary color and one
accent. `useBrandTheme()` writes them to `--tenant-primary` /
`--tenant-accent` on `<html>`, and `@theme inline` mixes a full scale from
them:

```
brand-50 … brand-300   tints (color-mix with white)
brand-600              the tenant's color
brand-700 … brand-900  shades (color-mix with black)
brand-accent           the accent
```

So `bg-brand-600`, `text-brand-700` and `ring-brand-200` follow whichever
business is open. On platform pages the variables fall back to forest.
They are set on `<html>` rather than the layout root so that teleported
modals pick them up too. The Branding settings page warns when white text
on the primary color is below 4.5:1 contrast.

**Marketing palette.** The landing page (`/`, `MarketingLayout`) uses its
own tokens: `court` #123E35, `court-2` #1F6B50, `ball` #C7F36B (the one CTA
color, via `LandingButton`), `mist` #F5F7F2 and `ink` #25332E. Landing copy
lives in `src/views/marketing/landingContent.ts`; screenshots and photos in
`src/assets/marketing/` (WebP). Add `data-reveal` to an element to fade it in
on scroll (`useReveal`).

**Status colors** are reserved for state and always come with a text label
(`StatusBadge`): emerald = good, amber = needs action, red = problem,
sky = informational, charcoal = neutral. Labels and tones are defined once
in [src/utils/labels.ts](../src/utils/labels.ts).

## Typography

- **Inter Variable**: all UI text. Dashboard titles use Inter semibold, which reads more like an app.
- **Oswald Variable** (`font-display`): condensed, uppercase headlines on the marketing site and the public booking sites, for the athletic feel from match-pickleball.
- `.tabular` gives tabular numbers in tables, stat tiles and prices.

## Layouts

| Layout             | Look                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `PlatformLayout`   | Dark forest sidebar, lime accents, "Admin" tag                                                                       |
| `TenantLayout`     | Light sidebar, tenant monogram, brand-tinted active state, status banners (trial, past due, suspended, support view) |
| `StorefrontLayout` | Tenant-branded header and footer, brand hero, "Powered by CourtDesk"                                                 |
| `MarketingLayout`  | Platform marketing and demo launcher                                                                                 |

Both dashboards share `DashboardShell`: sidebar, sticky top bar, and a
slide-in drawer below `lg`, using the same accessible pattern as
match-pickleball's admin layout.

## Components (`src/components/ui`)

`AppButton` (primary follows the brand), `AppInput` (generic over string or
number), `AppSelect`, `AppTextarea`, `AppToggle`, `AppModal` (native
`<dialog>`, labelled, Escape and backdrop close), `ConfirmDialog`,
`AppCard`, `AppBadge` / `StatusBadge`, `AppTabs`, `SegmentedControl`,
`SearchInput`, `DataTable` (sorting, pagination, per-column cell slots,
responsive column hiding, keyboard row activation), `StatTile` (value,
signed delta with direction × good/bad, optional sparkline), `UsageMeter`,
`PageHeader`, `UserAvatar`, `EmptyState` / `LoadingState` / `ErrorState`,
`ToastHost`.

## Charts (`src/components/charts`)

Hand-written SVG, drawn at real pixel width via `ResizeObserver`:

- `LineChart`: 2px lines, a 10% area wash for a single series, hairline gridlines on "nice" ticks, crosshair and tooltip on hover or tap, an end dot, and a legend only when there are 2+ series.
- `BarChart`: columns capped at 24px with 4px rounded tops on a square baseline, a hover target taller than the bar, and a direct label only on the peak.
- `BarList`: ranked horizontal bars in HTML, so long labels wrap.
- `SparkLine`: muted trend line with an accent end dot.

Rules: one y-axis per chart; text uses text colors, never the series
color; categorical series use `--color-series-1…3` in fixed order; the
week heat grid uses a single-hue brand ramp.
