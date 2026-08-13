# justurban wears order flows

This handoff records the customer and Lulu workflows that are live today, then separates the planned connected workflow that has not shipped.

## Shareable guides

- [Customer order guide](./just-urban-wears-customer-order-flow.png)
- [Lulu order checklist](./just-urban-wears-lulu-order-flow.png)
- [Lulu garment-intake guide](./just-urban-wears-lulu-garment-intake.png)

Accessible, editable SVG masters live beside the PNG files.

## Lulu garment intake — live private flow

The signed-in Studio keeps the workflow to one decision at a time:

`Camera / Photos / Describe → Build → Confirm → Keep or Edit → optional Wear → In Wardrobe`

The final receipt shows the accepted garment image, offers **Expand**, and says
**Draft · Private · not for sale**. The garment save does not wait for mannequin
or model work.

The production intake, Wear generation, Neon persistence, private Blob storage,
reload recovery, and operator-only access passed the acceptance recorded in
[ADR 0042](../adr/0042-studio-wear-engine-production-acceptance.md). Product back
and fabric detail remain explicitly missing until Lulu supplies truthful source
coverage. Publication is a separate confirmed action.

## Studio mobile UX reference

The compact operator UI is documented in [ADR 0041](../adr/0041-studio-mobile-ux-and-reference-proof.md).
Its live local browser evidence uses the approved Lulu + JUW-001 Coral Drift
Dress reference pair and is stored in [`docs/screenshots/studio-ux/`](../screenshots/studio-ux/README.md).

## Customer flow — live now

1. The customer browses or searches the wardrobe and reviews the piece’s photographs, condition, measurements, tagged size, price, and availability.
2. They add the one-off piece to their bag. The bag does **not** reserve it.
3. At checkout they enter their name, email, and phone number. For delivery, they also enter the destination address.
4. They choose a current handoff:
   - Lagos delivery — ₦2,500 — estimated 1–3 working days.
   - Studio pickup — free — by appointment after payment.
   - Nationwide delivery — ₦4,500 — estimated 3–7 working days.
5. They review the piece, handoff fee, and total.
6. The website saves a `PAYMENT_REQUIRED`, `LOCAL_ONLY` checkout on that browser and device.
7. When the customer is online and the WhatsApp handoff is available, **Continue on WhatsApp** opens a prepared message for review. Opening the draft does not send it.
8. The customer reviews the message and taps **Send** in WhatsApp.
9. Lulu manually checks the physical piece, confirms availability, and sends payment instructions.
10. The customer pays outside the website and shares the reference through WhatsApp.
11. Lulu verifies the actual payment, prepares the piece, and manually coordinates delivery or pickup.

### Customer truth

- Saved checkout ≠ sent request ≠ confirmed order.
- Lulu receives nothing until the customer taps **Send** in WhatsApp.
- The website cannot detect a WhatsApp send, payment, preparation, dispatch, pickup, or delivery.
- If WhatsApp does not open, the checkout remains only on that device. It is not queued or sent automatically, and there is no current in-app resume action from the saved-checkout page.
- The customer must contact Lulu manually or start again after connectivity is restored.
- Payment details are never collected by the website.
- Delivery estimates are guidance, not carrier tracking.

## Lulu flow — live now

1. Lulu waits until the customer’s sent message appears in WhatsApp.
2. She checks the checkout reference, piece, SKU, tagged size, total, customer contact, and delivery or pickup choice.
3. She matches the message to the published listing and physical piece.
4. She manually selects **Reserve sale** on that listing in Studio. This creates a separate device-local Studio stock order in `RESERVED` and changes the listing to `RESERVED`.
5. She confirms availability and manually sends the amount, payment instructions, reference, and timing through WhatsApp.
6. She verifies the actual payment account and amount—not only a screenshot—then acknowledges payment in WhatsApp.
7. She quality-checks, prepares, and packs the exact piece.
8. She arranges delivery and shares dispatch details, or agrees a Studio pickup appointment.
9. She keeps the customer updated manually in WhatsApp.
10. She selects **Mark sold** in Studio at the business-defined completion point.
11. For a return, she inspects the piece and chooses **Restock to review** or **Write off**.

### Lulu truth

- WhatsApp and Studio are not connected today.
- WhatsApp does not create a Studio order; Lulu must match and reserve the listing manually.
- **Reserve sale** and **Mark sold** change only the local stock lifecycle. They do not message the customer or prove payment, dispatch, pickup, or delivery.
- Studio stores no customer contact, checkout reference, payment evidence, address, quality-check, dispatch, or delivery state.
- Studio data is device-local.
- Studio currently has no cancellation or release-reservation action. Do not represent cancellation as an available operator step.

## Current status truth

Do not conflate the customer checkout record with the Studio stock order.

| Surface | Live states | Meaning |
| --- | --- | --- |
| Customer saved checkout | `PAYMENT_REQUIRED` | Saved on the originating device; sending, acceptance, and payment are not confirmed. |
| Studio stock order | `RESERVED` → `SOLD` → optional `RETURNED` | Lulu’s separate, manual, device-local stock lifecycle. |

The shared domain vocabulary also includes `ORDER_RECEIVED`, `QUALITY_CHECK`, `READY_FOR_HANDOFF`, `IN_TRANSIT`, `DELIVERED`, and `CANCELLED`. Those labels are not evidence of live customer synchronization. In particular, opening WhatsApp or saving a checkout must never be interpreted as `ORDER_RECEIVED`.

## Future connected workflow — not live

The target server-backed workflow is intentionally separate from the live guides above:

1. The customer selects **Place order**.
2. The server validates the live product, price, handoff fee, and stock.
3. Neon becomes the authoritative order store only after the connection, migration, credentials, and release checks are complete.
4. Inventory is reserved transactionally so two customers cannot buy the same one-off piece.
5. Lulu receives the order in a secured Studio inbox.
6. Lulu verifies payment and advances the order in Studio.
7. The customer sees a private synchronized status page.
8. Cancellation releases the reservation; completed handoff closes the order.

WhatsApp may remain the customer conversation channel, but opening a prepared draft still does not prove it was sent. Automated WhatsApp messages require a separate, approved messaging integration and are not part of the live workflow documented here.

Until the connected workflow is deployed and verified:

> WhatsApp is the manual customer conversation and payment-coordination channel. Studio is the separate local stock lifecycle. They are not synchronized.

## Configuration

The temporary WhatsApp destination is provided through the protected Vercel environment variable `SHOP_WHATSAPP_ORDER_NUMBER`. Never hardcode or expose the number in application code, documentation, images, or tests.
