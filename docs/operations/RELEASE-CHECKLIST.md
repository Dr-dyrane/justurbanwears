# Release checklist

## Repository and environment

```bash
npm install
npm run verify
npm run env:check:runtime
npm run env:check:release
```

Do not release with lint, type, contract, build, rendered HTML, metadata, brand-asset, or environment failures. Confirm runtime and release credentials target the intended Neon branch and Blob stores.

## Database and catalogue

```bash
npm run shop:release:dry-run
npm run shop:db:verify
```

Review target, expected host/database, manifest checksum, migrations, Git SHA, SKU changes, and publication operations. Database writes run from an authenticated operator environment, never Vercel build hooks.

## Preview acceptance

Verify public shop/search/product/bag/checkout, passwordless sign-in and resume, one-off availability failure, Studio authorization, garment intake and completion approval, publication, order operations, payment evidence, fulfilment, returns, keyboard navigation, focus restoration, reduced motion, and light/dark themes.

## Production

After Vercel reports `READY`:

```bash
npm run smoke:production
```

The smoke covers shop HTML, product JSON-LD, auth, manifest, favicon, social preview, order authorization, and invalid availability input.

## Reconciliation and rollback

For real orders, confirm one reference/idempotency record, matching reserved inventory, complete payment history, matching customer/Studio state, visible outbox status, and consistent fulfilment timestamps.

A code rollback does not reverse business transitions. Identify a schema-compatible safe deployment, retain accepted orders/evidence, reconcile outbox and reservations, redeploy, rerun smoke, and document manual correction with actor, reason, and evidence.
