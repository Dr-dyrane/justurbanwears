# Canonical state machines

Server state is authoritative; client state is a recoverable projection.

## Order lifecycle

```text
PAYMENT_REQUIRED → PAYMENT_REVIEW → PAID → PACKED
                 → OUT_FOR_DELIVERY | READY_FOR_PICKUP → COMPLETED
```

Exceptional paths end in `CANCELLED` or move through `REFUND_DUE → REFUNDED`. Canonical server states are `PAYMENT_REQUIRED`, `PAYMENT_REVIEW`, `PAID`, `PACKED`, `OUT_FOR_DELIVERY`, `READY_FOR_PICKUP`, `COMPLETED`, `CANCELLED`, `REFUND_DUE`, and `REFUNDED`.

Every transition validates actor authority, current version, allowed predecessor state, and inventory consequences. The shopper projection exposes fewer states and must never reconstruct server truth.

## Payment evidence

```text
AUTHORIZED → UPLOADED → VERIFIED | REJECTED
```

Upload success does not mark an order paid. Verification is a separate finance decision, followed by an explicit order transition.

## Returns

```text
REQUESTED → APPROVED → COLLECTED → RECEIVED → RESOLVED
          ↘ REJECTED
```

Eligibility uses the recorded delivery/collection timestamp and configured return window. Return state cannot mutate order finance without an explicit transition.

## Garment media truth

Provenance: `DIRECT_CAPTURE`, `DERIVED_FROM_DIRECT`, `MODEL_REFERENCE`.

Truth roles: `VERIFIED_GARMENT`, `STYLED_MODEL_REFERENCE`.

Completion source modes are `APPROVED_FRONT` and `UPLOADED_AUTHORITY`; jobs move through `PENDING → RUNNING → COMPLETE → APPROVED`, with `FAILED` and `REJECTED` exits. Approval may promote an asset into a publishable role but may not rewrite provenance.

## Invariants

1. A one-off SKU cannot be sold twice.
2. Availability is confirmed at checkout, not inferred from rendering.
3. Changed checkout payloads require a new idempotency key.
4. The accepted server lines must match before the browser clears them.
5. Browser persistence failure cannot undo an accepted server order.
6. Payment upload, verification, and order payment are separate decisions.
7. Generated imagery never masquerades as direct photography.
8. Publication requires an approved asset set and human decision.
9. Order, payment, return, and publication transitions remain auditable.
