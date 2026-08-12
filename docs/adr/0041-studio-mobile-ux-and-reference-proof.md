# ADR 0041: Compact Studio UX and reference proof

- Status: Accepted
- Date: 2026-08-12
- Owner: Studio
- Scope: operator UX and reproducible visual proof; engine and security contracts stay unchanged

## Decision

1. Mobile is the primary Studio layout. Home work cards stay slender in a two-column grid and use one accessible open icon rather than an “Open” label.
2. Records, Wardrobe and Inventory use a compact three-zone row: concise text, status/action, and real garment media. Images sit bare and padded from the edge; synthetic colour swatches are fallback only.
3. The mobile Shop shortcut no longer occupies Studio’s FAB. Each Studio route owns one contextual action: intake garment, add model, open orders or create shoot. Redundant full-width mobile creation actions are hidden.
4. Segmented views immediately reveal the selected content. Styling and Readiness do not leave the model hero above the changed panel.
5. Every interactive row has keyboard focus, pressed and disabled feedback. View transitions expose a bounded pending state, loading keeps its footprint, and success/error language remains truthful.
6. The progressive intake sheet is the only intake surface. If its server engine or operator session is unavailable, it retains the selected photo or description and shows a recoverable error; it does not fall back to a second form or claim a local draft was saved.
7. The existing approved reference pair—Lulu and JUW-001 Coral Drift Dress—is the stable published proof. Intake screenshots may exercise new private drafts, but arbitrary test records are not inserted into production merely to produce documentation. The server engine still commits a private garment draft; catalogue publication remains an explicit separate contract under ADR 0040.
8. Mobile evidence is captured from the local app at a consistent viewport in `docs/screenshots/studio-ux/`. It must cover Home, Model Readiness, Wardrobe, Inventory and the garment intake sheet without secrets or personal data.

## Verification boundary

This unit does not reopen completed infrastructure, security or CI audits. Run focused UI tests, one local browser flow, one independent visual review and one integration build at release. A concrete blocker permits one correction and recheck.

## Consequences

- Lulu gets denser, more legible mobile workspaces with obvious actions and immediate state changes.
- Screenshots stay reproducible without polluting the live catalogue with fake products.
- Durable model CRUD and arbitrary catalogue publication remain future engine units; the UI does not claim they are already server-backed.
