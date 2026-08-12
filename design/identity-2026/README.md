# JustUrbanWears identity — 2026.2

Status: **owner-approved and production-applied for digital use**.

## Approved role split

- **Logo:** the exact owner-supplied four-row centered artwork: icon,
  `justurban`, `wears`, and `BY LULU`. Use `/logo`, `/logo.png`, or
  `/brand/logo.svg` for public sharing and centered brand presentation.
- **Wordmark:** the existing outlined lowercase `justurban wears` artwork is
  unchanged. Shop and Studio desktop navigation continue to use this wordmark
  only. Its public namespace is now `/wordmark`, `/wordmark.png`,
  `/brand/wordmark.svg`, and `/brand/wordmark-white.svg`.
- **Icon:** the exact owner-supplied wardrobe / curvy figure / mirrored-L image
  replaces the retired JU/W monogram on favicon, installed-app, avatar, compact
  Studio, and square surfaces.

Do not combine the compact icon with the horizontal wordmark in desktop
navigation. The centered public logo is a separate owner-supplied composition.

## Exact supplied sources

| Source | Dimensions | SHA-256 | Rule |
| --- | ---: | --- | --- |
| `justurban-logo-source.png` | 1313 × 1392 | `9990e1c587a5f12aac986329a0d9ab56b7201d8dffb0a2fdfe5aa40d6f6a1b06` | Preserve its pixels, lettering, spelling, spacing, colour, and transparency exactly. |
| `justurban-icon-source.png` | 1024 × 1536 | `b518af74bcfa3040434b3e73ff8d67a118e20c674388f1207d410ae81360d917` | Preserve its pixels and transparency exactly; do not trace or redraw it. |

The SVG logo and icon masters embed these PNG sources losslessly. That is an
intentional exact-preservation strategy, not a claim that the supplied raster
artwork has been converted into editable Bézier paths. Platform PNGs are scaled
derivatives generated from the exact source.

## Canonical masters and derivatives

| Asset | Purpose |
| --- | --- |
| `justurban-logo.svg` | Exact supplied centered public logo in an SVG wrapper. |
| `justurban-wordmark.svg` | Unchanged path-outlined horizontal navigation wordmark. |
| `justurban-mark.svg` | Exact supplied icon in a transparent SVG wrapper. |
| `justurban-micro.svg` | Exact supplied icon wrapper for compact use; no geometry redraw. |
| `justurban-favicon.svg` | Exact supplied icon cropped and centred for browser tabs. |
| `justurban-app-icon.svg` | Exact supplied icon on a warm-paper square. |
| `justurban-app-foreground.svg` | Exact supplied icon inside the adaptive safe area. |
| `justurban-app-background.svg` | Warm-paper adaptive background. |
| `justurban-app-monochrome.svg` | Generated one-colour adaptive derivative. |
| `identity-spec.json` | Machine-readable roles, source hashes, paths, and platform rules. |
| `exports/` | Ready SVG, PNG, and ICO derivatives. |

Run `npm run brand:generate` after an approved source replacement. The script
must regenerate the entire derivative set in one pass.

## Wordmark

The unchanged horizontal wordmark remains outlined from:

- `justurban`: Bodoni Moda Variable, weight 500, 29 px source size,
  `-0.075em` tracking.
- `wears`: Manrope Variable, weight 600, 10 px source size, `+0.12em`
  tracking, with the accepted 8 px desktop gap.

Never recreate the wordmark with live text, independently move or resize
`wears`, or depend on runtime fonts for its share asset. Keep its 140 px minimum
width and 6-unit external clear zone.

## Colour and compact use

The supplied logo and icon pixels are authoritative; do not flatten them to an
invented replacement swatch. Warm paper `#F4EEE6` is used for square app tiles.
Generated cocoa, black, and white one-colour exports exist for constrained
production methods. Existing application theme/action colours are unaffected.

Use the finite 16, 32, and 48 px favicon exports at their intended sizes. Use
38–48 px for compact product chrome where possible. Do not redraw the icon to
force a different micro interpretation.

## Verbal anchors

- **Headline:** “Clothes with a second first impression.”
- **Descriptor:** “One-off urban womenswear from Lulu’s wardrobe, ready to move
  through the city.”

This is Lulu’s curated second-life wardrobe, not an owned-label manufacturer.

## Never do this

- Do not trace, smooth, symmetrise, recolour, retype, respell, or rearrange the
  supplied logo or icon.
- Do not apply outlines, shadows, gradients, gloss, masks, or arbitrary
  containers to the source artwork.
- Do not substitute the centered public logo for the horizontal navigation
  wordmark without separate owner approval.
- Do not revive the retired angular JU/W monogram as a live identity asset.

This packet is production artwork, not trademark clearance. Complete a
professional similarity search before filing or a high-cost merchandise roll-out.
