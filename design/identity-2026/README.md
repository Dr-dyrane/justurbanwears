# justurban identity — 2026

Status: **approved and production-applied for digital use**. The established
`justurban wears` wordmark remains the primary public-navigation signature.
The JU/W mark is its compact reduction for software surfaces.

## Approved idea

The mark is made from two flat, angular forms. They read individually as `J`
and `U`; together, their outer silhouette resolves into a `W`. The `W` is the
immediate read and the `JU` is the discovery. That double reading belongs to
the drawing itself—there is no separate background `W`, container, outline, or
decorative effect.

The mark and wordmark have separate jobs:

- **Wordmark = logo.** Use the exact lowercase `justurban wears` asset for the
  storefront, public navigation, editorial signatures, and horizontal spaces.
- **JU/W = icon.** Use the mark for browser favicons, installed-app icons,
  avatars, compact mobile/Studio surfaces, and square placements.
- Do not place the mark beside the wordmark in desktop navigation. The two
  assets are complementary reductions, not a combined lockup.

## Verbal anchors

- **Headline:** “Clothes with a second first impression.”
- **Descriptor:** “One-off urban womenswear from Lulu’s wardrobe, ready to move
  through the city.”

These lines are owner-approved and should be used verbatim. They define the
brand as a Lagos wardrobe edit and second-life fashion service, not an owned-
label garment manufacturer.

## Canonical masters

| Asset | Purpose |
| --- | --- |
| `justurban-wordmark.svg` | Exact path-outlined public wordmark; no runtime font dependency. |
| `justurban-mark.svg` | Canonical one-colour JU/W geometry for 32 px and larger. |
| `justurban-micro.svg` | Optically opened JU/W geometry for 16–24 px. |
| `justurban-favicon.svg` | Cocoa/coral square browser favicon using the micro geometry. |
| `justurban-app-icon.svg` | Finished standard app icon; centred `.82` artwork scale. |
| `justurban-app-foreground.svg` | Transparent adaptive/maskable foreground; centred `.75` scale. |
| `justurban-app-background.svg` | Solid cocoa adaptive-icon background. |
| `justurban-app-monochrome.svg` | `currentColor` adaptive/monochrome foreground at `.75` scale. |
| `identity-spec.json` | Machine-readable roles, geometry, colour, type, spacing, and size rules. |
| `exports/` | Ready-to-use SVG, PNG, and ICO derivatives. |

Public production mirrors are listed in `identity-spec.json`. The share URLs
`/logo` and `/icon` serve the exact approved SVG bytes directly.
The direct PNG share files are `/logo.png` (transparent wordmark) and
`/icon.png` (opaque 1024 px app icon).
Ready one-colour SVGs include cocoa, black, and white wordmarks plus cocoa,
black, white, and coral JU/W marks.
`explorations/juw-emergent-w-redraw.*` records the owner-approved source study;
production must use the canonical masters above, not the study file.

## Colour

| Role | Value | Use |
| --- | --- | --- |
| Cocoa | `#2A1710` | Core dark brand field and one-colour mark. |
| Coral | `#F28A62` | Mark on cocoa in deliberate branded tiles. |
| Warm paper | `#FFF8F4` | Preferred light brand field. |
| Wordmark primary ink | `#2D211D` | `justurban` in the canonical light wordmark. |
| Wordmark secondary ink | `#67534C` | `wears` in the canonical light wordmark. |

Cocoa/coral is `6.99:1`; cocoa/warm-paper is `16.27:1`. Reserve coral-on-cocoa
for app icons, favicons, or deliberate branded tiles. Do not use coral as a
small mark on warm paper. Pure black, pure white, and cocoa one-colour versions
are approved. On dark fields, use the exact white one-colour artwork.

Do not substitute the interface-theme cocoa `#34231D` or action coral
`#DD6042` for the identity colours.

## Typography and wordmark

The accepted wordmark is outlined from the exact fonts and spacing used by the
desktop storefront:

- `justurban`: Bodoni Moda Variable, weight 500, 29 px source size,
  `-0.075em` tracking.
- `wears`: Manrope Variable, weight 600, 10 px source size, `+0.12em`
  tracking, separated by the accepted 8 px desktop gap.

Use `justurban-wordmark.svg` or `/logo` when sharing the logo. Never recreate it
with live text, independently resize or reposition `wears`, or alter either
path. Supporting display typography remains Bodoni Moda Variable; supporting
UI/body typography remains Manrope Variable with the app's existing fallbacks.

## Clear space

- **JU/W:** let `X = 40` master units. Keep at least `X` clear around the visible
  silhouette. `X` is approximately twice the standard mark's narrowest
  inter-form gap and `9.6%` of its 416-unit visible width. The uncropped 512
  masters already provide at least 48 horizontal and 88 vertical units.
- **Wordmark:** keep an external clear zone equal to the height of the lowercase
  `wears` lettering (6 units in the canonical SVG coordinate system). Preserve
  the complete canonical viewBox; do not crop it to visible glyph bounds.
- Finished app/favicons are controlled platform tiles. Their locked internal
  padding and safe-area geometry supersede the external JU/W exclusion zone.

## Minimum size and responsive use

- Wordmark: **140 px minimum width**.
- Standard JU/W: **32 px minimum**; **38–48 px** is preferred in product chrome.
- Micro JU/W: **16–24 px**, with **16 px** as the minimum.
- Do not interpolate an untested 25–31 px drawing. Snap the placement to 24 px
  with the micro master or to 32 px with the standard master.
- Browser exception: the scalable SVG favicon keeps the micro drawing because
  tab rendering is the priority. The finite ICO uses micro at 16 px and switches
  to standard geometry at 32 and 48 px.
- The public SVG canonizes the accepted desktop wordmark. Responsive live text
  may retain the existing tablet/mobile composition, but must preserve the same
  hierarchy and may not be treated as a new logo master.

The micro drawing opens the narrowest inter-form gap to 31.28 master units,
which is approximately one rendered pixel at 16 px. The standard mark preserves
the approved tighter relationship and clears approximately 1.26 px at 32 px.

## Platform geometry

- Standard square app icon: centred `.82` mark scale; visible artwork is
  approximately `342 × 276 px` on the 512 canvas.
- Maskable, adaptive, and monochrome foreground: centred `.75` mark scale;
  visible artwork is `312 × 252 px`.
- The adaptive foreground's farthest visible point is approximately `200.66 px`
  from centre, leaving at least `4.14 px` inside the 204.8 px safe radius.
- The ICO contains independent PNG entries: 16 px micro, then 32/48 px standard.
- Do not bake rounded corners or device masks into Apple or platform masters.

## Never do this

- Do not distort, rotate, crop, round, outline, shadow, bevel, gloss, or apply a
  gradient to the mark.
- Do not close the J slit, compress the centre gap, alter polygon spacing,
  symmetrise the centre, redraw the letters, or add a separate background `W`.
- Do not use an unapproved colour or container.
- Do not use the micro master above 24 px or the standard master below 32 px,
  except for the locked scalable favicon described above.
- Do not pair the JU/W mark with the wordmark in desktop navigation.
- Do not revive the superseded stroked gateway drawing.
- Do not revive the rejected separate-background-W sketch.

## Release note

This packet is a production identity system, not legal clearance. Complete a
professional trademark similarity search in the intended markets before a
trademark filing, wide merchandise rollout, or other high-cost public use.
