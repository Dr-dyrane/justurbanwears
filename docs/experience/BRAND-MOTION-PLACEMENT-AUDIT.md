# JustUrbanWears brand-motion placement audit

**Status:** production placement policy
**Authority:** `EXPERIENCE-SYSTEM.md`, identity 2026.3, and the exact-master `WardrobeMotion` primitive
**Principle:** one orchestrated brand moment per view; most interactions remain composed

## Empathetic state model

Brand motion is not a reward sprinkled across screens. It has one of four psychological jobs:

| Human need | Product state | Motion job |
| --- | --- | --- |
| Orientation | A wait has become perceptible | Reassure the person that the same product is carrying them forward; never hide a fast transition behind ceremony |
| Recovery | A rare destination or record is genuinely absent | Soften disorientation, then yield immediately to the recovery action |
| Closure | An authoritative, meaningful commitment has completed | Confirm that the system crossed the boundary the person intended—not that a button was merely pressed |
| Belonging | The person reaches the natural end of a calm home surface | Offer a quiet sign-off that feels inhabited, stays still most of the time, and never competes with work |

Errors need clarity, not performance. Frequent utility emptiness needs a useful next action, not consolation. In-progress transactional work needs stable geometry and truthful status copy. These are deliberate exclusions, not missed opportunities.

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
| Missing customer order | Centered-logo mark / `empty` | A rare missing-record state with a single recovery path, distinct from routine empty collections |
| Order reserved or payment confirmed | Centered-logo mark / `success` | Runs once when the order has crossed an authoritative milestone; surrounding copy preserves payment truth |
| Garment intake receipt | Centered-logo mark / `success` | The piece has been committed to the private Wardrobe and the receipt remains visible independently of motion |
| Approved Wear receipt | Centered-logo mark / `success` | A kept view is an explicit operator decision, not an autosave |
| Studio Media initial authority wait | Circular seal / `loader` | A genuine data wait, compact enough to retain task focus, with separate accessible status text |
| Studio Home signoff | Centered-logo mark / `footer` | A viewport-aware ambient acknowledgement at the natural end of Home; replaces the static mark and rests for most of its 12-second cycle |
| Studio publish/return-to-Shop receipt | Centered-logo mark / `success` | Runs only after the authoritative lifecycle command succeeds and the public workspace has been accepted |
| Development identity proof | Both / all variants | Exactness, polarity, scale, timing, and reduced-motion review only; unavailable in production |

## Recommended next placements

These are candidates, not blanket authorization to add motion.

| Priority | Surface | Recommended behavior | Gate before implementation |
| --- | --- | --- | --- |
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
