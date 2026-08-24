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

Run check, then `db:release:shop`; the release performs migrate → descriptive sync → verify atomically. The current `2026-08-24-catalogue-27` release must use checksum `06aea430d648ca057307f16b56b486ac3895d7cde663b4540301ebb6e9250dd9`. It extends the reviewed manifest from 34 to 35 rows with reserved SKU JUW-042 as Drop 02: the fuchsia strapless ruched cascade-ruffle mini dress; JUW-041 remains reserved for Garment 017. The release uses the approved provisional dress price while keeping unknown tagged size, condition, and measurements behind explicit confirmation-before-payment copy. The previous `2026-08-23-catalogue-26` release remains recorded by checksum `a3bdfdab5432ce78fd887ce5dd9d9d0ed4d974a69f829c0513631a5f79437f62`.

The 35-row manifest deliberately retains Drop 01 for recoverable operational retirement; the Drop 02 transition archives those 18 earlier rows and adopts the seventeen new rows into Studio in the same guarded release transaction. Later Drop 02 additions are adopted incrementally without rewriting inventory truth for pieces already operating in Studio.

Catalogue-14 remains immutable at checksum `cd7b631012c13e3bf84f001e1ebb725af01d1fddf166ce4b1d8e6123aa95a984`; it replaced only JUW-015's masked left-profile bytes with the face-corrected `lulu-v3` frame. Catalogue-13 remains immutable at checksum `7ee66d52ddf08f9c76d82cb289fd9292069fa6d3e1177f2e9fc25cdde8967f92`; Catalogue-12 remains immutable at checksum `220779647082701c63caea782d78e901591729e14b7d987c5f10535cdd6d94cf`; Catalogue-11 remains immutable at checksum `9064e58fd4e94305f3d06b9e6dbfb30d88b0c99380c7570ad1e203139a4f7677`; Catalogue-10 remains immutable at checksum `7844c8a7ccdab8b5b6a446085dc0f39c958ad9315964542ff8c78483b04291e3`; Catalogue-09 remains immutable at checksum `c7e8d47034bb8a619961a8d1302b170bcccd089b02a1c0a982094e0e68de0909`; Catalogue-08 remains immutable at checksum `909a3209574cddaccafa89c29a1770698786772c996476dafb0ff3c975673d61`.

The older `db:shop:*` names remain aliases, but there is no standalone migration-only write command. Every write runs in one transaction under the shared Postgres advisory lock. The ledger treats the same namespace/revision/checksum as a no-op and rejects a reused revision with different content. Production writes additionally require a clean git worktree, so the recorded git SHA and manifest checksum identify the exact release artifact.

## Revision and recovery policy

Never edit a revision that has been applied. Change the checked-in manifest and assign a new revision. A failed command rolls back its transaction. After a committed release, do not delete ledger history or reverse operational inventory with a seed. Recover with a reviewed forward migration or a new compensating descriptive revision, then verify. Inventory corrections are a separate operational action outside this release workflow.

Database changes are prohibited during builds, deploy builds, module import, server cold start, or request startup. `build:vercel` remains database-free, and admin migrations/scripts are excluded from the Vercel upload. Operators invoke the commands above explicitly with scoped credentials.

Production orchestration belongs in the authenticated CI/Vercel CLI caller: run `npm run db:release:shop`, then perform a source-built production deployment with `vercel deploy --prod`. Do not use `--prebuilt`; production asset pinning and service-worker release stamping require Vercel to build the exact committed source revision. This repository intentionally does not chain or auto-run that deployment sequence.
