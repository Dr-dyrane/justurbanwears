# Connected commerce lifecycle v2

This document is the release handoff for the server-backed order lifecycle. It describes checked-in code, not a claim that production has already been migrated or deployed.

## Authority and scope

- Managed Neon Auth is the only customer and Studio identity source. Shop uses `getShopCustomerSession`; Studio uses `getNeonAuth` through `requireStudioOperator`.
- Neon owns accepted orders, one-off reservations, payment-review state, settled-funds facts, fulfilment facts, returns, refunds, inventory resolution, and the customer-visible timeline.
- Browser checkout drafts remain recovery state only. A signed-in customer’s order list and detail always rehydrate from Neon.
- Payment evidence is stored privately and is not proof that money settled. An active Studio admin separately records the bank transfer reference, receiving-account label, verification time, and verifier audit.
- There is no payment provider or webhook in this release. There is no external notification worker. The in-app timeline is the truthful notification surface; durable outbox rows remain pending until a separately approved worker exists.

## Lifecycle

1. A signed-in customer places one checkout. `shop_create_order_v2` prices catalogue rows on the server, locks catalogue and inventory rows, and creates the order plus reservation atomically. Both static catalogue rows and Studio-published dynamic rows use the same tables.
2. The customer authorizes and uploads one exact JPG, PNG, WebP, or PDF to the private Blob store. The database records the exact MIME type, byte count, SHA-256, and private pathname.
3. Studio reviews the evidence. Evidence acceptance does not confirm payment.
4. An active Studio admin confirms settled funds with the transfer reference and receiving-account label.
5. Studio records quality check, ready-for-handoff, and structured handoff facts. Delivery records dispatch before delivery; pickup goes directly from ready to collected and is never described as in transit.
6. Delivery or collection completes the order and records a return deadline. `SHOP_RETURN_WINDOW_DAYS` is a whole number from 1 through 90 and defaults to **7 days** when unset or invalid.
7. The customer may submit one return during that recorded window. Studio may approve or reject it, record receipt, and progress the refund.
8. A completed refund must record an exact positive NGN amount no greater than the order total plus a reference. The amount is shown to the customer. The system does not infer whether the delivery fee should be refunded.
9. After a completed refund, Studio resolves the returned piece as `RESTOCK` or `WRITE_OFF` in the same transaction that updates inventory. The one-off inventory conservation equation remains enforced.

## Operator membership boundary

`studio_operator_membership` is tracked by canonical migration `0007_material_cyclops`. Migration 0007 adopts the older compatible table with `IF NOT EXISTS`, so Lulu’s existing explicit membership row is preserved. It does not insert, promote, or auto-bootstrap any allowlisted user.

- `operator` may review evidence and perform non-finance order, fulfilment, and return operations.
- `admin` is required to confirm settled funds and record a completed refund.
- The email allowlist is only an outer access check. It never grants an authoritative finance role.
- If Lulu’s active membership row is absent or is not the intended role, stop the release and reconcile the exact managed-auth subject and email through an explicitly reviewed administrative change. Do not make runtime code create an admin.

## Release order

1. Review the migration and application diff. Run the focused lifecycle and UI tests, scoped ESLint, `drizzle-kit check`, and one production build without database credentials that can write.
2. Configure the runtime with the pooled Neon URL, private Blob token, managed Neon Studio auth mode, Studio email allowlist, and `SHOP_RETURN_WINDOW_DAYS` (use `7` unless the business selects another 1–90 day policy).
3. Run the existing database release preflight against the exact target using a direct administrative URL and the repository safety labels. Confirm migration history ends at `0006_jittery_joystick` before applying `0007_material_cyclops`.
4. Apply the existing locked database release command. It must commit migration 0007 before application traffic reaches the new order routes.
5. Verify read-only that all v2 functions exist, the catalogue/inventory ledger is unchanged, and Lulu’s exact `studio_operator_membership` row remains active with the intended role. Absence or ambiguity is a release blocker.
6. Deploy the already-built application artifact. Do not run migrations from a build, cold start, or request.
7. Smoke-test with approved disposable stock and test identities: customer checkout/reload, private evidence, operator review, admin funds confirmation, delivery and pickup wording, customer timeline, return, exact refund, and one inventory resolution. Do not use a sellable one-off production piece for a destructive rehearsal.

Rollback after a committed migration is a reviewed forward correction. Do not delete migration history, restore inventory with catalogue seed commands, or downgrade the application while new v2 orders exist.
