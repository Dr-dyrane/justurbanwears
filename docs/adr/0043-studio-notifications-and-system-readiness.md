# ADR 0043: Studio updates and system readiness

- Status: Accepted
- Date: 2026-08-13
- Owner: Studio Operations

## Context

Studio exposes garment, model, publishing, order, return, and persistence state, but it had no shared place where Lulu could see unresolved work. Individual banners and counters were easy to miss. This made the product feel like a collection of screens rather than one operating system.

## Decision

1. Add one global **Updates** centre to the authenticated Studio header. Its bell shows an unresolved-work count and opens the existing native task sheet on desktop and mobile.
2. Derive updates from business state instead of duplicating records: save failures, reserved sales, open returns, draft garments, listings in review, and incomplete model profiles.
3. Give each update a deterministic signature. A changed set or lifecycle state becomes new and unresolved; completed work disappears. Opening an update never mutates garment, stock, order, or return state.
4. Use the badge as a work count, not a messaging receipt. Source records remain governed by their existing browser or server persistence boundary.
5. Keep language short and action-led. Each row has one destination, a 44px-or-larger target, keyboard focus, screen-reader naming, light/dark treatment, reduced-motion support, and visible unresolved state.
6. Do not request operating-system notification permission on first use. This release does not claim background Web Push, email, SMS, WhatsApp, or cross-device inbox delivery.

## Production-readiness ledger

| Capability | State | Release truth |
| --- | --- | --- |
| Studio sign-in and operator gate | Ready | Passwordless email-code auth and operator authorization exist. |
| Garment intake, AI review, private draft persistence | Ready | Authenticated engine path persists private work. |
| Mannequin, approved-model try-on, editorial Wear work | Ready after its migration/seed release | Durable Wear jobs and private model authority are a separate release dependency. |
| In-app work awareness | Ready | Updates centre, unresolved-work count, exact work destinations. |
| Arbitrary catalogue create/update/delete from Studio | Not ready | Publication still depends on approved catalogue contracts and the canonical release path. |
| Connected customer orders and inventory | Not ready | Current Studio operational mutations are not the unmerged server order plane. |
| Cross-device notification history | Not ready | Requires a server event ledger and user receipts. |
| Email or Web Push delivery | Not ready | Requires explicit opt-in, provider/outbox, retry, quiet-hours, unsubscribe, and delivery receipts. |
| Roles beyond the operator allowlist | Partial | Add managed roles and least-privilege administration before inviting more operators. |
| Audit, reversal, and recovery | Partial | Reservation release exists; catalogue CRUD and notification delivery still need durable audit history. |
| Offline/conflict handling | Partial | Local recovery exists, but connected writes need conflict and idempotency proof. |
| Support and observability | Partial | Analytics exists; add operator-visible incident/support paths and alerting for failed durable jobs. |

## Consequences

Lulu gets one dependable view of work that needs attention without notification spam or accidental state changes. We may call Studio ready for guided in-app operations only when the relevant engine migration and model seed are live. We must not call the whole commerce system complete until catalogue CRUD, connected orders/inventory, server notification history/delivery, roles, recovery, and production support are closed with end-to-end evidence.

## Verification

- A new state signature creates an unresolved update; resolving the source record removes it.
- Resolving the source record removes its update.
- Links open the matching Studio view without mutating data.
- The sheet passes 320px and desktop, light and dark, keyboard focus/return, and screen-reader naming checks.
- The readiness ledger remains the release checklist for later system work.
