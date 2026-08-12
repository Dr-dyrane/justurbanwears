# JustUrbanWears identity — 2026.2

Status: **owner-approved and production-applied for digital use**.

## The identity now means one thing

The approved mark is **not a JU/W letter puzzle**. It is a wardrobe opening
around Lulu's confident, curvy silhouette.

- The two outer forms are opposing wardrobe doors.
- Their shared negative space reveals a feminine hourglass dress/body.
- The lower cut-outs create two mirrored `L` forms: Lulu's signature in the
  foundation of the mark.
- The full reading is **Lulu's wardrobe, opened for another urban woman**.

The brand remains a curated second-life wardrobe, not an owned-label garment
manufacturer.

## Approved role split

- **Centered logo — official brand display.** The four-row composition is the
  default for social profiles and social-page branding, 3D wall signs, formal
  brand presentations, packaging fronts, shopping bags, hang tags, and other
  placements where the name must be unmistakable.
- **Wordmark — website and horizontal spaces.** The established outlined
  lowercase `justurban wears` artwork remains unchanged in Shop and Studio
  navigation, editorial signatures, and other shallow horizontal placements.
- **Icon — compact reduction.** Use the wardrobe / silhouette / Double-L mark
  for favicons, installed-app icons, browser or device tiles, hardware stamps,
  embossing, seals, tissue patterns, and genuinely compact spaces.

The icon expresses the brand story, but it does not spell the brand name.
Therefore it is **not the default social-profile identity on its own**. Social
surfaces use the centered logo unless the account name is already permanently
and prominently adjacent.

Do not combine the compact icon with the horizontal wordmark in desktop
navigation. The website wordmark and centered public logo have separate jobs.

## Centered logo anatomy

The approved centered logo keeps this order:

1. wardrobe / silhouette / Double-L icon
2. `justurban`
3. `wears`
4. `BY LULU`

Typography is locked as follows:

- `justurban`: Bodoni Moda Variable, weight 500, with the accepted tight
  tracking.
- `wears`: Manrope Variable, weight 600, with open tracking.
- `BY LULU`: Manrope Variable, weight 600, uppercase, generously tracked.

Use the supplied centered artwork rather than recreating the lockup with live
text.

## Exact supplied sources

| Source | Dimensions | SHA-256 | Current rule |
| --- | ---: | --- | --- |
| `justurban-logo-source.png` | 1313 × 1392 | `9990e1c587a5f12aac986329a0d9ab56b7201d8dffb0a2fdfe5aa40d6f6a1b06` | Preserve its corrected four-row lettering, spelling, spacing, colour, and transparency exactly. |
| `justurban-icon-source.png` | 1024 × 1536 | `b518af74bcfa3040434b3e73ff8d67a118e20c674388f1207d410ae81360d917` | Preserve the approved wardrobe / curvy silhouette / Double-L geometry until an owner-approved vector master replaces it. |

The current SVG logo and icon masters preserve the exact owner-supplied PNG
sources losslessly. This is an exact-preservation strategy, not a claim that the
artwork is already a finished Bézier reconstruction.

A later vector rebuild is allowed only as a controlled replacement: it must
retain the approved silhouette, mirrored L feet, corrected typography, and
spacing, pass direct visual comparison, and receive owner approval. Until then,
do not trace or redraw production assets casually.

## Canonical masters and derivatives

| Asset | Purpose |
| --- | --- |
| `justurban-logo.svg` | Exact supplied centered public logo in an SVG wrapper. |
| `justurban-wordmark.svg` | Unchanged path-outlined horizontal navigation wordmark. |
| `justurban-mark.svg` | Exact supplied compact icon in a transparent SVG wrapper. |
| `justurban-micro.svg` | Compact icon wrapper for constrained use. |
| `justurban-favicon.svg` | Compact icon prepared for browser tabs. |
| `justurban-app-icon.svg` | Compact icon on the current warm-paper app tile. |
| `justurban-app-foreground.svg` | Compact icon inside the adaptive safe area. |
| `justurban-app-background.svg` | Warm-paper adaptive background. |
| `justurban-app-monochrome.svg` | One-colour adaptive derivative. |
| `exports/social-profile-1080.png` | Name-bearing square social identity using the centered logo. |
| `references/social-application-2026-08-12/luxury-signage-dark.png` | Exact 1122 × 1402 owner-selected source for the production Open Graph image. |
| `exports/social-og-1122x1402.png` | Exact owner-selected portrait signage image; no crop or recompression is applied. |
| `identity-spec.json` | Machine-readable roles, sources, paths, and platform rules. |
| `exports/` | Ready SVG, PNG, ICO, and social derivatives. |

Run `npm run brand:generate` after an approved source replacement. Run
`npm run brand:generate:social` to rebuild the centered-logo social profile and
Open Graph images. The Open Graph build copies the selected signage source
byte-for-byte to the production and legacy locations. The social generator runs
before local development and both production build paths.

Direct share routes remain `/logo`, `/wordmark`, and `/icon`; the production
Open Graph image is served from `/brand/social-og.png`.

## Wordmark

The unchanged horizontal wordmark remains outlined from:

- `justurban`: Bodoni Moda Variable, weight 500, 29 px source size,
  `-0.075em` tracking.
- `wears`: Manrope Variable, weight 600, 10 px source size, `+0.12em`
  tracking, with the accepted 8 px desktop gap.

Never recreate the website wordmark with live text, independently move or
resize `wears`, or depend on runtime fonts for its share asset. Keep its 140 px
minimum width and 6-unit external clear zone.

## Colour and compact use

The supplied logo and icon pixels remain authoritative. Warm paper `#F4EEE6`
is the preferred light field; cocoa `#3A2E25` and coral `#CB6A4A` define the
current physical-display palette. Generated cocoa, black, and white one-colour
exports remain available for constrained production methods.

Use the finite 16, 32, and 48 px favicon exports at their intended sizes. Use
38–48 px for compact product chrome where possible. The icon may be simplified
optically only through a separately approved micro master.

## Verbal anchors

- **Headline:** “Clothes with a second first impression.”
- **Descriptor:** “One-off urban womenswear from Lulu’s wardrobe, ready to move
  through the city.”

## Never do this

- Do not return to the retired angular JU/W monogram.
- Do not use the compact icon as the default social identity when the brand
  name is absent.
- Do not replace the horizontal website wordmark with the centered logo.
- Do not rearrange the four rows of the centered logo.
- Do not substitute Playfair, Didot, or another serif for the approved Bodoni
  Moda `justurban`, and do not make `wears` a serif.
- Do not apply arbitrary outlines, shadows, gradients, gloss, masks, or
  containers to the master artwork.
- Do not trace or redraw the production sources without the controlled vector
  approval process above.

This packet is production artwork, not trademark clearance. Complete a
professional similarity search before filing or a high-cost merchandise
roll-out.
