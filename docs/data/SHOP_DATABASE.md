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

## Resolve production access without guessing

The canonical production resource is the Neon project `justurbanwears-db` with project ID `calm-glade-28091571`, primary branch `main` (`br-mute-paper-awfdn96n`), and database `neondb`. These identifiers are routing guards, not credentials. Verify them freshly through the authenticated Neon connector before every release; do not hard-code an endpoint hostname because Neon may rotate computes.

Use this order:

1. Search the Neon connector for `justurbanwears-db` and require the exact project ID above. Describe the project and require the primary/default branch above plus database `neondb`.
2. Request a connection string for that exact project, branch and database. The release requires a direct endpoint. If the connector returns a hostname containing `-pooler`, request or derive the corresponding direct endpoint only after the project and branch identity have passed; Neon direct and pooled endpoints use the same branch credentials, and the direct hostname omits `-pooler`.
3. Stage only `DATABASE_URL_UNPOOLED` in a unique temporary file outside the repository with permission mode `0600`. In Codex, keep the returned value inside the same secure tool/runtime call and write it directly to the file while emitting only the sanitized host and database. Never send the value through a PTY or terminal `write_stdin`: terminals can echo the input into task logs. Never place the URL in shell history, process arguments, tool output, tracked `.env` files, Markdown, JSON, Git, or conversation text.
4. If the connector cannot access the canonical project, use the authenticated Vercel Marketplace SSO flow for the existing `justurbanwears-db` resource and copy the direct connection from its Connect dialog without displaying it. Do not substitute a different Neon project.
5. Vercel CLI downloads and `vercel env run` may expose protected values only as `[SENSITIVE]` or empty strings. Treat those as redacted placeholders, not as credentials and not as evidence that Neon is unavailable. Continue with the connector/SSO flow above.

Before any database command, set a task-specific path without using a broad or common environment name:

```bash
JUW_DB_ENV_FILE=/private/tmp/juw-shop-release-<unique>.env
```

The file must contain exactly one non-empty `DATABASE_URL_UNPOOLED` assignment and must be deleted immediately after verification, whether the release succeeds or fails. Never commit it or leave it in `/private/tmp` for a later task.

## Guarded production sequence

Start from the committed release checkout. `git status --porcelain` must be empty. Compute the release identity from the checked-in manifest rather than copying an old revision:

```bash
git rev-parse HEAD
node -e "Promise.all([import('./scripts/shop-db/catalogue-manifest.mjs'),import('./scripts/shop-db/release-core.mjs')]).then(([m,c])=>console.log(JSON.stringify({revision:m.SHOP_CATALOGUE_MANIFEST.revision,rowCount:m.SHOP_CATALOGUE_MANIFEST.products.length,checksum:c.manifestChecksum(m.SHOP_CATALOGUE_MANIFEST)},null,2)))"
```

Parse the staged direct URL locally and set `SHOP_DB_EXPECTED_HOST` and `SHOP_DB_EXPECTED_DATABASE` to its exact hostname and decoded database name without printing the URL. Then run the read-only schema preflight:

```bash
SHOP_DB_TARGET=production \
SHOP_DB_EXPECTED_HOST=<fresh-direct-host> \
SHOP_DB_EXPECTED_DATABASE=neondb \
node --env-file="$JUW_DB_ENV_FILE" scripts/shop-db/release.mjs check
```

A pending migration that exists in the checked-in journal is applied inside the atomic release. Do not run it separately. Apply the reviewed release once:

```bash
SHOP_DB_TARGET=production \
SHOP_DB_EXPECTED_HOST=<fresh-direct-host> \
SHOP_DB_EXPECTED_DATABASE=neondb \
SHOP_DB_PRODUCTION_CONFIRM=APPLY_JUSTURBANWEARS_PRODUCTION \
SHOP_DB_EXPECTED_MANIFEST_CHECKSUM=<fresh-local-checksum> \
SHOP_DB_GIT_SHA=<committed-release-sha> \
node --env-file="$JUW_DB_ENV_FILE" scripts/shop-db/shop-release.mjs
```

The command must report the expected target, migration count, `catalogue apply` or ledger-safe `catalogue noop`, exact row count and exact checksum. Then verify independently:

```bash
SHOP_DB_TARGET=production \
SHOP_DB_EXPECTED_HOST=<fresh-direct-host> \
SHOP_DB_EXPECTED_DATABASE=neondb \
SHOP_DB_EXPECTED_MANIFEST_CHECKSUM=<fresh-local-checksum> \
node --env-file="$JUW_DB_ENV_FILE" scripts/shop-db/catalogue.mjs verify

npm run smoke:production
```

After the server catalogue cache expires, POST each newly released slug and its exact `taggedSize` to `/api/shop/catalogue/availability`. Require HTTP `200` with `{"status":"CONFIRMED"}`. Also require each affected product page to show its checked-in price, `data-state="available"`, and the purchase action. Only then record `LIVE_VERIFIED` in the garment briefs and `docs/virtual-atelier/state/current.json`.

If identity resolution, the direct connection, any guard, the atomic apply, independent verification, affected-SKU availability, or the production smoke fails, stop with the exact failed gate. Never weaken fail-closed availability, use a pooled URL for administration, operate on an adjacent project, replay a stale connection from task history, or claim the release is live.

## Command matrix

| Purpose | Command | Writes |
| --- | --- | --- |
| Validate migration history and list pending migrations | `npm run db:shop:release:check` | No |
| Apply migrations, seed, and verify in one locked transaction | `npm run db:release:shop` | Yes |
| Initial insert of catalogue and inventory | `npm run db:seed:shop` | Yes |
| Verify ledger, catalogue presentation, and inventory-row presence | `npm run db:verify:shop` | No |
| Apply a new revision's descriptive catalogue changes | `npm run db:sync:catalog` | Yes |

Run check, then `db:release:shop`; the release performs migrate → descriptive sync → verify atomically. The current `2026-08-27-catalogue-40` release must use checksum `e45ec2cd5a9be7d06eeaf2803b119e5212b9a01cecfa71ce1a44d36095ac38bc`. It adds G030 as the reviewed 48th catalogue row with its approved seven-view public media packet. The previous `2026-08-26-catalogue-39` release remains recorded by checksum `ed2580d260d9339325c997258b2c2cfa212645924f2f39db3d19360dcc1c90b1`; catalogue-38 remains recorded by checksum `3bb29dfb72f9ca3b3953f20f915ce74f62d9655c5340ece5b53cf2aedabea442`.

The 48-row manifest deliberately retains Drop 01 for recoverable operational retirement; the Drop 02 transition archives those 18 earlier rows and adopts the original eighteen Drop 02 rows into Studio in the same guarded release transaction. Garment 030 is the thirtieth Drop 02 piece and is adopted incrementally without rewriting inventory truth for pieces already operating in Studio.

Catalogue-14 remains immutable at checksum `cd7b631012c13e3bf84f001e1ebb725af01d1fddf166ce4b1d8e6123aa95a984`; it replaced only JUW-015's masked left-profile bytes with the face-corrected `lulu-v3` frame. Catalogue-13 remains immutable at checksum `7ee66d52ddf08f9c76d82cb289fd9292069fa6d3e1177f2e9fc25cdde8967f92`; Catalogue-12 remains immutable at checksum `220779647082701c63caea782d78e901591729e14b7d987c5f10535cdd6d94cf`; Catalogue-11 remains immutable at checksum `9064e58fd4e94305f3d06b9e6dbfb30d88b0c99380c7570ad1e203139a4f7677`; Catalogue-10 remains immutable at checksum `7844c8a7ccdab8b5b6a446085dc0f39c958ad9315964542ff8c78483b04291e3`; Catalogue-09 remains immutable at checksum `c7e8d47034bb8a619961a8d1302b170bcccd089b02a1c0a982094e0e68de0909`; Catalogue-08 remains immutable at checksum `909a3209574cddaccafa89c29a1770698786772c996476dafb0ff3c975673d61`.

The older `db:shop:*` names remain aliases, but there is no standalone migration-only write command. Every write runs in one transaction under the shared Postgres advisory lock. The ledger treats the same namespace/revision/checksum as a no-op and rejects a reused revision with different content. Production writes additionally require a clean git worktree, so the recorded git SHA and manifest checksum identify the exact release artifact.

## Revision and recovery policy

Never edit a revision that has been applied. Change the checked-in manifest and assign a new revision. A failed command rolls back its transaction. After a committed release, do not delete ledger history or reverse operational inventory with a seed. Recover with a reviewed forward migration or a new compensating descriptive revision, then verify. Inventory corrections are a separate operational action outside this release workflow.

Database changes are prohibited during builds, deploy builds, module import, server cold start, or request startup. `build:vercel` remains database-free, and admin migrations/scripts are excluded from the Vercel upload. Operators invoke the commands above explicitly with scoped credentials.

Production orchestration belongs in the authenticated CI/Vercel CLI caller: run `npm run db:release:shop`, then perform a source-built production deployment with `vercel deploy --prod`. Do not use `--prebuilt`; production asset pinning and service-worker release stamping require Vercel to build the exact committed source revision. This repository intentionally does not chain or auto-run that deployment sequence.
