# Performance budgets

These are release targets, not claims about current field performance.

## Field targets

At the 75th percentile for mobile and desktop:

- LCP `≤ 2.5 s`
- INP `≤ 200 ms`
- CLS `≤ 0.1`

## Enforced build ceilings

The release gate measures the compiled artifact after every production build.
Current ceilings retain modest headroom above the 15 August 2026 baseline:

- compiled CSS files: `≤ 5`;
- largest compiled stylesheet: `≤ 475 KiB raw` and `≤ 86 KiB gzip`;
- aggregate compiled CSS: `≤ 525 KiB raw` and `≤ 98 KiB gzip`;
- emitted WOFF2 files: `≤ 10`;
- largest emitted font: `≤ 30 KiB`;
- aggregate emitted fonts: `≤ 170 KiB`;
- `transition: all` is prohibited in authored application CSS;
- reduced-motion, reduced-transparency, forced-colour, and Studio resolve-tempo contracts must remain present.

## Enforced production-route ceilings

Post-deployment certification checks the actual production HTML:

- brand Site: `≤ 400 KiB`;
- Shop: `≤ 2,200 KiB`;
- garment focus: `≤ 900 KiB`;
- Studio authentication boundary: `≤ 350 KiB`.

It also requires intrinsic image dimensions, malformed-metadata protection,
exactly one high-priority hero on the Site and Shop, and the canonical
Site/Shop/focus/island experience markers.

> These ceilings are regression guards, not performance claims. Tighten them
> only after a measured optimization establishes a lower stable baseline.

## Product rules

- Public catalogue HTML must be useful before hydration.
- Product cards receive catalogue projections, never private evidence or operator records.
- Only the immediate hero image may receive high fetch priority.
- Catalogue images need intrinsic dimensions, responsive sizing, and optimized derivatives.
- Model try-out and heavy experiences load only after intent.
- Reduced-motion mode avoids expensive decorative animation.
- Checkout, authentication, order, and Studio actions outrank decorative motion.
- Public caching never includes customer, order, payment, or Studio data.

For material storefront changes retain production performance evidence, route/image transfer sizes, accessibility results, and before/after captures at canonical breakpoints.
