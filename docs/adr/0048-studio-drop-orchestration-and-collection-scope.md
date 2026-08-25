# ADR 0048: Studio drop orchestration and collection scope

- Status: Proposed
- Date: 2026-08-23
- Owner: Studio Platform
- Scope: catalogue collection identity, Studio wardrobe targeting, active-drop resolution and the operator-safe Wardrobe projection; catalogue release integrity remains governed by its existing ledger

## Context

Drop 02 is real catalogue state today. It contains nineteen one-off pieces,
`JUW-025` through `JUW-043`, and is the current public Shop drop. Studio does
not yet hold that fact as a first-class business subject.

The current implementation spreads drop meaning across three mechanisms:

1. `shop_catalogue_items.drop_label` stores a free-text merchandising label on
   every catalogue row.
2. `CURRENT_SHOP_DROP = "Drop 02"` decides which rows the public Shop treats as
   current.
3. `shop_seed_ledger` records release revision, checksum, target and row count.

These mechanisms are useful but not equivalent. A label is presentation, the
constant is deployment policy and the seed ledger proves release integrity.
None provides a stable collection identity, collection lifecycle, active-drop
selection, Studio target or safe comparison between drops.

Studio-native publication previously wrote the literal label `Studio wardrobe`,
which made an otherwise valid publication invisible to current-drop reads. The
bounded compatibility correction writes `CURRENT_SHOP_DROP` instead. That
prevents immediate divergence but remains a transitional patch: it still
assigns collection membership through application text rather than database
identity.

Without a first-class collection contract, a future Drop 03 would require a
coordinated constant change, label rewrite and UI interpretation. Renaming a
drop could look like moving products. Draft and archived drops cannot be
distinguished safely. Studio cannot truthfully say which collection a private
piece is being prepared for, and the interface would either hide that context
or expose internal release machinery.

This ADR extends ADR 0044, ADR 0045 and ADR 0047. Home remains the navigation
map, the unified projection and command plane remains the only application
entry, and progressive stack-page grammar remains authoritative. This ADR does
not turn Drop into an eighth Studio service.

## Decision

Make a Shop collection the durable identity behind a customer-facing drop.
Store lifecycle and membership by stable IDs, resolve the active collection on
the server, and expose only a compact collection scope in Wardrobe.

The engines keep the full schema, constraints, release evidence and command
history. Lulu sees the current collection, its useful counts and a clear way to
switch scope when needed.

## Collection model

Introduce `shop_collections` with the following logical contract:

```text
id                 UUID primary key
key                immutable unique key, for example `drop-02`
label              editable display label, for example `Drop 02`
ordinal            unique positive sequence number
version            positive optimistic-concurrency version
state              DRAFT | ACTIVE | ARCHIVED
activatedAt        nullable timestamp
archivedAt         nullable timestamp
createdAt
updatedAt
```

The implementation uses a database enum or an equally strict check constraint
for collection state. A partial uniqueness constraint permits at most one
`ACTIVE` collection. State/timestamp checks require:

- `DRAFT`: no activation or archive timestamp;
- `ACTIVE`: an activation timestamp and no archive timestamp;
- `ARCHIVED`: an archive timestamp.

`key` is API and route identity. `id` is relational identity. `label` is
presentation and may change without changing membership. `ordinal` defines
business sequence and must not be inferred by parsing the label. `version`
protects commands from stale previews; it is not a release revision.

Add these relationships:

```text
shop_catalogue_items.collection_id
  -> shop_collections.id ON DELETE RESTRICT

studio_wardrobe_items.target_collection_id
  -> shop_collections.id ON DELETE RESTRICT
```

Every catalogue item belongs to exactly one collection. A Studio wardrobe item
receives a target collection when it is committed to the wardrobe. The target
may be changed while the piece is a private draft, through a typed command, but
is frozen when publication begins. Publication copies the same collection ID
into the catalogue row atomically; it never authors a drop label.

`drop_label` remains temporarily as a denormalized compatibility field for
existing Shop readers. During dual-write it is derived from the referenced
collection label. It is not accepted as command input and never wins over
`collection_id`. Removing it is a later destructive cleanup after every reader
uses the collection relationship; it is not part of this migration.

## Invariants

- Collection identity is `id`/`key`, never display text.
- There is at most one active collection.
- A collection key and ordinal are immutable after creation.
- An archived collection accepts no new wardrobe targets or catalogue members.
- A published piece cannot be moved between collections by a generic edit.
  Correcting historical membership requires a permissioned correction command,
  material preview and audit receipt.
- Activation is transactional: the selected draft becomes active and the
  previous active collection becomes archived in the same command.
- A collection version changes for lifecycle or editable collection metadata;
  catalogue item revision and release revision remain separate.
- `shop_seed_ledger` continues to prove what catalogue release was applied. It
  does not choose the active collection and does not represent its lifecycle.
- Inventory, order, hold and custody state continue to reference SKU. Changing
  collection state never rewrites those business facts.
- Public and private media rules are unchanged. Collection projections contain
  no private paths, prompts, hashes or model-authority internals.

## Active collection resolution

The server resolves the active collection from `shop_collections`, not from a
constant or the browser. The query must return exactly one row or a truthful
degraded result:

- zero active rows -> `NO_ACTIVE_COLLECTION`;
- more than one active row -> integrity failure; no publication proceeds;
- one active row -> canonical current collection.

New Wardrobe intake defaults to this active collection. An authorized operator
may instead select a `DRAFT` collection from progressive disclosure when
preparing a future drop. The resolved collection ID is saved with the wardrobe
item so a later activation cannot silently retarget existing work.

Public Shop current-drop reads use the active collection ID. A URL or cached
label never overrides server resolution. Historical collection pages may read
an archived collection by stable key without making it active.

## Drop comparison

A drop comparison is a read projection over collection identity, not a diff of
labels and not a seed-ledger comparison. Given two collection IDs, the server
can return:

- lifecycle, ordinal and active/archive differences;
- total, private, ready, published, available, reserved and sold counts where
  the operator is authorized;
- SKU membership in each collection;
- pieces added to or absent from either collection;
- publication readiness and unresolved-work summaries.

Release checksum and revision may be shown in permissioned diagnostics, but
they do not define the comparison. A catalogue release can update one
collection without creating a new collection, and a collection can span more
than one release.

## Operator-safe projection

ADR 0045's projection port exposes a permission-filtered collection scope:

```text
CollectionScope
  id
  key
  label
  ordinal
  state
  version
  isCurrent
  counts
    pieces
    private
    ready
    published
    available
  nextAction?
  updatedAt
```

The projection may include a bounded list of selectable collection scopes.
Counts use the same server snapshot and capability rules as the Wardrobe list.
Unavailable sources produce a degraded marker rather than a blended or stale
number. Draft collections and private counts are visible only to authorized
Studio operators. The public Shop projection receives only public collection
identity and eligible public pieces.

The primary Wardrobe query accepts `collectionKey` and defaults to the active
collection. Search, Continue, Updates and Ask Studio carry the same canonical
collection scope; they do not independently infer it.

## Typed commands and idempotency

Collection mutations use ADR 0045's command envelope, preview, confirmation,
expected version and durable receipt. The initial command set is:

- `CreateCollection`;
- `RenameCollection`;
- `ActivateCollection`;
- `ArchiveCollection` for a non-active collection;
- `SetWardrobeTargetCollection` for a private draft;
- `CorrectPublishedCollectionMembership` under elevated permission.

`CreateCollection` is idempotent by normalized command intent and requested
stable key. Repeating a successful request returns its original receipt.
Lifecycle commands require the current collection version. Activation holds a
database lock over active-state resolution and changes the new and previous
collections in one transaction. A duplicate or indeterminate retry reuses the
same command ID and idempotency key.

Publication commands do not accept `dropLabel`. They resolve the wardrobe
item's frozen `targetCollectionId`, verify that the collection is publishable,
insert the catalogue membership and publication records atomically, and return
the collection label in the operator-safe receipt.

Ask Studio may propose these commands, but it uses the same preview and
confirmation as direct UI. It cannot invent a collection, choose a target from
prose or bypass an archived/draft lifecycle gate.

## Studio interaction

Drop is Wardrobe context, not a service and not a Home metric.

- Home keeps the four summary signals from ADR 0044. There is no fifth Drop
  orb, no Drop service row and no collection dashboard.
- Wardrobe shows one compact scope control above its primary collection, for
  example `Drop 02 · 19 pieces`. The active collection is the default.
- Tapping the control opens one bounded sheet. It shows Current first, then
  authorized Draft collections and Past collections through progressive
  disclosure.
- Selecting a collection updates the durable Wardrobe URL using its stable key,
  refreshes the list and counts, and preserves Back/refresh behavior.
- A future-drop intake inherits the selected draft target and confirms it in
  the save receipt. Lulu is not asked to reselect it at every step.
- Piece pages show the collection as quiet metadata. Changing a private draft's
  target is a bounded sheet action; published membership correction is not a
  casual selector.
- Search and Ask Studio understand `Drop 02`, `current drop` and stable keys,
  but results route to Wardrobe or a piece. They do not create a parallel Drop
  workspace.

The UI never exposes `collection_id`, seed checksum, migration state, source
table, release target or command internals in the primary path. Receipts state
what changed in operator language: `Saved to Drop 03`, `Drop 03 is now live`,
or one exact failure and recovery action.

## Transitional projection and compatibility

Before `collection_id` is authoritative, a transitional adapter constructs
collection scopes from one explicit, reviewed SKU-membership fixture. Drop 01
contains its eighteen canonical SKUs, including `JUW-004`; Drop 02 contains
exactly `JUW-025` through `JUW-043` and remains current through
`CURRENT_SHOP_DROP`.

The adapter must not derive keys by accepting arbitrary text. Existing
`drop_label` values such as `Archive` and historical `Studio wardrobe` remain
truthful presentation or lifecycle evidence and are not rejected or rewritten
by the additive migration. A catalogue row outside the reviewed fixture stays
unmapped and cannot publish through the collection-ID path until an authorized
target is assigned; it is never silently folded into the active drop.

The current compatibility patch that writes `CURRENT_SHOP_DROP` for
Studio-native publication remains in place until the foreign-key path is live.
It is a safety patch, not the final authority. Once publication writes
`target_collection_id`/`collection_id`, the constant is retained only as a
short-lived read fallback and then removed from runtime selection.

## Migration and backfill

The migration is additive and observable:

1. Add the collection state type and `shop_collections` table with constraints.
2. Insert stable rows for every recognized existing drop. Backfill Drop 01 as
   `ARCHIVED` and Drop 02 as `ACTIVE`, preserving their exact labels and
   ordinals.
3. Add nullable `collection_id` to `shop_catalogue_items` and nullable
   `target_collection_id` to `studio_wardrobe_items`.
4. Backfill catalogue membership from the explicit reviewed SKU-to-ID fixture,
   independent of `drop_label`. Verify all eighteen Drop 01 SKUs and all nineteen
   Drop 02 SKUs exist and resolve to their expected collection before
   continuing. Preserve every legacy `drop_label` byte.
5. Backfill existing Studio wardrobe targets from their adopted publication's
   catalogue membership. For an unpublished private item, require an explicit
   active/draft resolution; do not guess from a title, timestamp or media.
6. Add foreign keys, indexes and membership/lifecycle checks. Keep both new
   foreign-key columns nullable during this additive observation phase so
   truthful legacy and unpublished rows can remain unmapped. A later guarded
   migration may make catalogue membership non-null only after every row has
   an authorized target. Require a target before the new publication path can
   publish.
7. Run the new collection projection beside the label adapter and compare
   active collection, membership, counts and Shop results in a read-only
   shadow.
8. Move Wardrobe, publication and public Shop reads to collection IDs. Keep
   `drop_label` synchronized as compatibility output during the observation
   window.
9. Remove `CURRENT_SHOP_DROP` from runtime selection after production proves
   database active resolution. Retain `drop_label` until a separately reviewed
   destructive cleanup.

Backfill and activation run in transactions with exact expected canonical
membership counts. A missing canonical SKU, duplicate ordinal, multiple active
rows or membership mismatch aborts the migration without modifying publication
or inventory. An unknown or legacy presentation label does not abort the
additive migration and does not determine collection identity.

## Rollback

Because the first migration is additive, application rollback restores the
known-label projection and `CURRENT_SHOP_DROP` read path while leaving the new
table and foreign-key columns dormant. The Studio publication compatibility
patch remains; rollback never restores `Studio wardrobe` as a drop label.

Rollback does not rewrite SKUs, inventory, orders, media, publications or seed
ledger history. Dual-written labels keep the old readers operational. The
foreign-key columns and collection rows are not dropped during emergency
rollback, and `drop_label` is not removed until the rollback window is closed.

## Telemetry

Record privacy-safe events for:

- collection scope opened and changed;
- current, draft or past scope selected;
- collection created, activated or archived by command outcome;
- wardrobe target assigned or changed before publication;
- active-resolution degraded outcome;
- transitional label/ID projection mismatch.

Do not record private garment evidence, customer data, prompts, hashes, raw
command payloads or identity-authority metadata.

## Acceptance

- The database identifies Drop 02 by stable collection ID/key and verifies its
  nineteen members `JUW-025` through `JUW-043`.
- Renaming a collection does not move a piece or alter current-drop selection.
- Exactly one active collection is resolved by the server; zero or multiple
  active collections fail truthfully and block publication.
- New Studio wardrobe items receive a durable target collection, and Studio
  publication no longer writes or chooses a literal drop label.
- `shop_seed_ledger` continues to report release integrity without being used
  as collection lifecycle state.
- Wardrobe exposes one compact, accessible collection selector; Current is the
  default and Draft/Past remain progressively disclosed.
- Home gains no Drop orb, service or duplicate navigation.
- Collection selection survives direct link, refresh and Back, and Search,
  Continue, Updates and Ask Studio preserve the same scope.
- Duplicate collection commands return the original receipt; stale versions
  cannot activate, archive or retarget a collection.
- Migration preserves the existing public Drop 02 product set and all
  inventory/order state, and rollback does not require destructive data
  reversal.
