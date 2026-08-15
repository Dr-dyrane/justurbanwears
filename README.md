# justurban wears

**justurban wears** is a connected, one-off fashion commerce system: a public wardrobe for customers and a protected Studio for Lulu to capture, complete, review, publish, sell, and fulfil each physical garment.

Production: `https://www.justurbanwears.com`

## Product thesis

```text
approved garment evidence
→ human-reviewed media completion
→ catalogue publication
→ one-off reservation
→ payment evidence
→ fulfilment
→ completion or return
```

The public experience stays editorial and simple. The private Studio carries operational complexity and preserves the distinction between direct photography, derived garment media, and model-reference imagery.

## Current system

The public shop has a server-derived catalogue, live one-off availability, search, saves, bag, checkout, passwordless customer accounts, server-authoritative orders, returns, PWA installation, manual payment evidence, and product JSON-LD. Browser storage holds recoverable customer projections only; it is not authoritative for stock, orders, payment, or fulfilment.

The protected Studio has passwordless authentication, explicit operator membership, garment intake, media completion, human approval, publication, order operations, payment review, returns, and notifications. Generated output keeps its provenance and cannot become publishable without operator approval.

Automatic gateway payment confirmation is not connected yet. The current governed payment-evidence path remains the source of payment review until a provider webhook integration verifies reference, amount, currency, signature, and idempotency.

## Architecture

```text
app/                         pages and API routes
components/shop/             customer experience
components/studio/           private operator experience
lib/shop/domain/             commerce entities and client projections
lib/shop/server-order/       authoritative order service, validation, stores, outbox
lib/studio/engine/           intake, completion, wear, and publication services
db/shop-postgres-schema.ts   Drizzle/Postgres contract
drizzle/shop-postgres/       reviewed database migrations
scripts/shop-db/             guarded catalogue and release operations
```

See [`docs/architecture/STATE-MACHINES.md`](docs/architecture/STATE-MACHINES.md), [`docs/operations/RELEASE-CHECKLIST.md`](docs/operations/RELEASE-CHECKLIST.md), and [`docs/performance/BUDGETS.md`](docs/performance/BUDGETS.md).

## Local setup

Requirements: Node.js `>=22.13.0` and npm.

```bash
npm install
cp .env.example .env.local
npm run env:check
npm run dev
```

## Validation

```bash
npm run verify
```

This validates the environment template, lint, TypeScript, brand contracts, TypeScript contract tests, the production build, and server-rendered HTML/metadata. The same gate runs on every pull request and push to `main`.

Operational checks:

```bash
npm run env:check:runtime
npm run env:check:release
npm run shop:release:dry-run
npm run smoke:production
```

Production smoke runs after successful production deployment events, on demand, and daily. The scripts report missing variable names only; secret values are never printed.

## Release invariants

- One physical SKU cannot have two active sale outcomes.
- Server order state outranks browser projections.
- Checkout retries reuse an idempotency key only while the payload is unchanged.
- Payment upload, verification, and order payment are separate decisions.
- Generated media never becomes a direct capture.
- Nothing generated is published without operator approval.
- Database migrations and catalogue publication never run from the Vercel build.
- Private evidence media remains private.

## Routes

Public: `/shop`, `/shop/search`, `/shop/products/[slug]`, `/shop/saved`, `/shop/bag`, `/shop/checkout`, `/shop/account`, `/shop/orders`, and `/shop/orders/[reference]`. The root route still redirects to `/shop` until the dedicated brand entrance ships.

Protected Studio: `/studio`, `/studio/wardrobe`, `/studio/models`, `/studio/operations`, `/studio/orders`, and `/studio/orders/[reference]`, with compatibility routes under `/garments`, `/shoots`, and `/konan`.

## PWA and offline policy

The service worker precaches only the offline shell and does not cache authenticated, customer, Studio, API, order, or framework-data responses. Offline fallback is limited to public wardrobe navigation.
