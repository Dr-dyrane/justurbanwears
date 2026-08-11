# Shop database operations

Postgres is authoritative for server catalogue rows and operational inventory after release. The checked-in `scripts/shop-db/catalogue-manifest.mjs` is the reviewed presentation input; it is not runtime state. The current immutable SKU format is `JUW-NNN`. Migration `0002_deep_steel_serpent` retires the synthetic `DYN-081`–`DYN-092` namespace as `JUW-001`–`JUW-012`, guarded by exact SKU/slug preconditions; the inventory foreign key cascades only the identifier and the migration verifies that every stock counter and timestamp remains unchanged. Slugs and descriptive presentation fields may change through a new descriptive-sync revision. Availability and stock counters are operational fields and are initialized once only; neither seed nor descriptive sync overwrites them.

## Required environment

- `DATABASE_URL_UNPOOLED` (or `POSTGRES_URL_NON_POOLING`): direct admin connection only. Runtime `DATABASE_URL`/`POSTGRES_URL`, pooler hosts, and PgBouncer URLs are rejected.
- `SHOP_DB_TARGET`: exactly `local`, `preview`, or `production`.
- `SHOP_DB_EXPECTED_HOST` and `SHOP_DB_EXPECTED_DATABASE`: must exactly match the direct URL before any connection is opened.
- `SHOP_DB_PRODUCTION_CONFIRM=APPLY_JUSTURBANWEARS_PRODUCTION`: required only for production writes.
- `SHOP_DB_EXPECTED_MANIFEST_CHECKSUM`: required for production writes and must equal the locally validated SHA-256 printed by the tool. It can also pin preview writes.
- `SHOP_DB_GIT_SHA`: optional 7–64 character hexadecimal CI override; writes otherwise record `git rev-parse HEAD`.

A preview command must use `SHOP_DB_TARGET=preview` and the dedicated preview branch host. Never reuse the production host as a preview target. Vercel's `VERCEL_ENV`, when present, must agree with the declared target.

## Command matrix

| Purpose | Command | Writes |
| --- | --- | --- |
| Validate migration history and list pending migrations | `npm run db:shop:release:check` | No |
| Apply migrations, seed, and verify in one locked transaction | `npm run db:release:shop` | Yes |
| Initial insert of catalogue and inventory | `npm run db:seed:shop` | Yes |
| Verify ledger, catalogue presentation, and inventory-row presence | `npm run db:verify:shop` | No |
| Apply a new revision's descriptive catalogue changes | `npm run db:sync:catalog` | Yes |

Run check, then `db:release:shop`; the release performs migrate → descriptive sync → verify atomically. The current `2026-08-11-catalogue-09` release must use checksum `c7e8d47034bb8a619961a8d1302b170bcccd089b02a1c0a982094e0e68de0909`. It adds `JUW-015`, the Cocoa Cowl Gathered Midi Dress, as the sixteenth catalogue and inventory row with one available unit and six approved public media slots. Catalogue-08 remains immutable at checksum `909a3209574cddaccafa89c29a1770698786772c996476dafb0ff3c975673d61`; Catalogue-07 remains immutable at checksum `6ea433b7d761df987ddbb9f0dd02899994277c671404931594e5af6404b112d7`. The older `db:shop:*` names remain aliases, but there is no standalone migration-only write command. Every write runs in one transaction under the shared Postgres advisory lock. The ledger treats the same namespace/revision/checksum as a no-op and rejects a reused revision with different content. Production writes additionally require a clean git worktree, so the recorded git SHA and manifest checksum identify the exact release artifact.

## Revision and recovery policy

Never edit a revision that has been applied. Change the checked-in manifest and assign a new revision. A failed command rolls back its transaction. After a committed release, do not delete ledger history or reverse operational inventory with a seed. Recover with a reviewed forward migration or a new compensating descriptive revision, then verify. Inventory corrections are a separate operational action outside this release workflow.

Database changes are prohibited during builds, deploy builds, module import, server cold start, or request startup. `build:vercel` remains database-free, and admin migrations/scripts are excluded from the Vercel upload. Operators invoke the commands above explicitly with scoped credentials.

Production orchestration belongs in the authenticated CI/Vercel CLI caller: run `npm run build:vercel`, then `npm run db:release:shop`, then `vercel deploy --prebuilt --prod`. This repository intentionally does not chain or auto-run that deployment sequence.
