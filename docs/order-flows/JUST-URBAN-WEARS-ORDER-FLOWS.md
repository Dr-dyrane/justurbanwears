# Just Urban Wears order flows

This handoff documents the customer and Lulu workflows for the current WhatsApp checkout bridge, plus the planned connected Neon and Studio workflow.

## Shareable images

- [Customer order flow](./just-urban-wears-customer-order-flow.png)
- [Lulu order flow](./just-urban-wears-lulu-order-flow.png)

Editable SVG versions live beside the PNG files.

## 1. Customer flow — live now

1. The customer arrives from Instagram, WhatsApp, search, a shared product link, or the installed PWA.
2. They browse or search the wardrobe and open a product to review its photographs, condition, measurements, tagged size, price, and availability.
3. They add the one-off piece to their bag. Adding it to the bag does **not** reserve it.
4. At checkout they enter their name, email, and phone number.
5. They choose one of the current handoff options:
   - Lagos delivery — ₦2,500 — 1–3 working days.
   - Studio pickup — free — after payment, by appointment.
   - Nationwide delivery — ₦4,500 — 3–7 working days.
6. They review the item, delivery fee, and total, then select **Continue on WhatsApp**.
7. The website saves a `PAYMENT_REQUIRED`, `LOCAL_ONLY` checkout on that browser/device.
8. When online, WhatsApp opens with a prepared message containing the reference, items, size, pricing, customer details, and handoff information.
9. The customer reviews the message and taps **Send**.
10. Lulu manually confirms that the piece is still available and sends payment instructions.
11. The customer pays outside the website and sends the payment reference or evidence through WhatsApp.
12. Lulu verifies payment, prepares the piece, and coordinates delivery or pickup through WhatsApp.

### Customer truth points

- A saved checkout is not the same as a submitted order.
- Lulu receives nothing until the customer taps **Send** in WhatsApp.
- The website cannot currently detect the WhatsApp send, payment, dispatch, or delivery.
- If the customer is offline, checkout remains saved locally and they must reconnect to continue.
- Saved checkout history is limited to the browser/device that created it.
- Payment details are never collected by the website.
- Delivery estimates are guidance, not live carrier tracking.

## 2. Lulu flow — live now

1. A prepared order request arrives in Lulu’s WhatsApp.
2. Lulu checks the order reference, piece, SKU, tagged size, total, customer contact, and delivery or pickup choice.
3. She verifies that the published listing and physical piece are still available.
4. She manually selects **Reserve sale** in Studio, which creates a separate local Studio order in `RESERVED`, increments reserved stock, and changes the listing to `RESERVED`.
5. She confirms availability and sends the payment instructions and reference through WhatsApp.
6. She verifies the payment against the actual payment account—not only a screenshot.
7. She quality-checks, prepares, and packs the piece.
8. She arranges delivery and shares dispatch details, or agrees a Studio pickup appointment.
9. She selects **Mark sold** in Studio at the business-defined completion point.
10. For a return, she opens a return case and chooses **Restock to review** or **Write off** after inspection.

### Lulu truth points

- WhatsApp and Studio are not connected today.
- Studio does not automatically receive customer checkouts.
- Lulu must manually match the WhatsApp request to a published listing.
- **Mark sold** changes the local stock lifecycle; it does not notify the customer or prove courier delivery.
- Studio currently stores no customer contact, checkout reference, payment evidence, address, quality-check, dispatch, or delivery state.
- Studio data is currently device-local.

## 3. Current status systems

Do not conflate the customer checkout record and the Studio inventory order.

| Surface | Live states | Meaning |
| --- | --- | --- |
| Customer checkout | `PAYMENT_REQUIRED` | Checkout saved on the originating device; payment and submission are not confirmed. |
| Studio order | `RESERVED` → `SOLD` → optional `RETURNED` | Lulu’s manual inventory lifecycle. |

The following connected statuses exist in the Postgres schema but are **not yet live customer synchronization**:

`PAYMENT_REQUIRED → ORDER_RECEIVED → QUALITY_CHECK → READY_FOR_HANDOFF → IN_TRANSIT → DELIVERED`

An order may also become `CANCELLED`. The precise business meaning of `ORDER_RECEIVED` versus payment confirmation must be finalized before that transition is enabled.

## 4. Planned connected flow

The final server-backed workflow will replace the local/manual gap:

1. Customer selects **Place order**.
2. The server validates the live product, price, delivery fee, and stock.
3. Neon creates the authoritative order and item snapshots.
4. Inventory is reserved transactionally so two customers cannot buy the same piece.
5. Lulu receives the detailed order in a secured Studio inbox.
6. WhatsApp opens as the customer conversation channel, without being the only order record.
7. Lulu verifies payment and advances the order status in Studio.
8. The customer sees a synchronized, private status page and receives relevant WhatsApp updates.
9. Cancellation releases the reservation; completed delivery closes the order.

Until this connected workflow ships, use this rule:

> WhatsApp is the customer communication and payment-coordination channel. Studio is the manual stock lifecycle. They are not synchronized yet.

## 5. Configuration

The temporary handoff destination is configured in Vercel as the protected environment variable `SHOP_WHATSAPP_ORDER_NUMBER`. Do not hardcode the number in application code, documentation, screenshots, or tests.
