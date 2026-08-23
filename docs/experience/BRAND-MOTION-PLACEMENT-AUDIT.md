# JustUrbanWears brand-motion placement audit

**Status:** production placement policy
**Authority:** `EXPERIENCE-SYSTEM.md`, identity 2026.3, and the exact-master `WardrobeMotion` primitive
**Principle:** one orchestrated brand moment per view; most interactions remain composed

## Artwork roles

| Artwork | Role | Best use |
| --- | --- | --- |
| Centered-logo mark | Primary expressive motion identity | 404, rare entrance, editorial absence, major standalone success |
| Circular seal | Compact system identity | Delayed route or authority loading at small sizes, app-like compact surfaces |

The centered-logo mark is an exact crop of the approved logo source. The seal is the exact production app icon. Neither may be recoloured, redrawn, combined with new geometry, or used as a decorative loop.

## Adopted placements

| Surface | Artwork / variant | Reason |
| --- | --- | --- |
| Global delayed route wait | Circular seal / `loader` | Shared continuity across Site, Shop, and Studio; mounts only after 420ms so fast navigation remains visually immediate |
| Global 404 | Centered-logo mark / `404` | A rare narrative absence where the wardrobe story improves recovery without delaying the action |
| Studio Media initial authority wait | Circular seal / `loader` | A genuine data wait, compact enough to retain task focus, with separate accessible status text |
| Development identity proof | Both / all variants | Exactness, polarity, scale, timing, and reduced-motion review only; unavailable in production |

## Recommended next placements

These are candidates, not blanket authorization to add motion.

| Priority | Surface | Recommended behavior | Gate before implementation |
| --- | --- | --- | --- |
| P1 | Future standalone order confirmation route | Centered-logo mark / `success`, one-shot | Only if confirmation becomes its own route; payment and reservation truth must already be visible |
| P1 | Final publish/approval receipt in Studio | Centered-logo mark / `success`, one-shot | Only for irreversible completion, never for autosave or routine field updates |
| P2 | Studio home signoff | Centered-logo mark / `ambient`, viewport-aware | Must replace—not sit beside—another brand mark, and remain still for most of its cycle |
| P2 | Rare campaign/editorial entrance | Centered-logo mark / `entrance`, one-shot | Must not block navigation or compete with a garment hero transition |

## Do not insert

| Surface | Reason |
| --- | --- |
| Shop checkout hydration or submission | Transactional continuity must feel immediate; progress copy and preserved order state are more truthful |
| Bag, saved, orders, and search empty states | These are frequent utility states with clear recovery actions; repeated branding would become decoration |
| Product cards, filters, search results, navigation, and mobile dock | High-frequency controls already own their response motion |
| Product model-view loading | The final image geometry should remain stable; a tonal image placeholder is the correct continuity device |
| Inline save, favourite, evidence, return, or order-update feedback | The action icon, label, and status text should resolve in place |
| Sheet footers and form buttons | Use immediate compression, label change, or the existing action underlay instead |
| Shop footer beside the wordmark | The footer already has a name-bearing identity; a second moving mark would weaken role clarity |
| Authentication beside the wordmark | One brand authority is enough; motion must not compete with sign-in comprehension |
| Error alerts | Motion can imply progress or celebration; errors need calm, explicit recovery information |

## Production rules

1. Never render more than one `WardrobeMotion` in a production view.
2. Use the centered-logo artwork for narrative meaning and the seal for compact waiting only.
3. Do not show a loader for work that finishes within the global 420ms threshold.
4. Loading text remains a separate live-region status; the artwork is decorative.
5. Success motion runs only after authoritative completion and never substitutes for a receipt.
6. Entrance, 404, empty, and success are one-shot by default. Only footer and ambient may loop.
7. Footer and ambient motion must stop off-screen and spend most of the cycle at rest.
8. Reduced motion resolves immediately to the untouched canonical master.
9. No interaction waits for the animation to finish.
10. Every new placement requires rendered light/dark, mobile, keyboard, screen-reader, reduced-motion, and off-screen-pause checks.

## Repository inventory reviewed

The audit covered the global 404; Shop shell/footer, search, bag, saved, orders, order detail, checkout, account, product detail, model view, and action feedback; Studio shell/home, Wardrobe, Models, Atelier Media, Orders, Operations, Stocktake, garment intake, Wear generation, command navigation, receipts, loaders, and alerts.
