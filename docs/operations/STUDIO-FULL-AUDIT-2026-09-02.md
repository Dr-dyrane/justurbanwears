# Studio baseline audit and remediation plan — 2026-09-02

Status: `BASELINE_AUDIT_COMPLETE / DEEP_DISCOVERY_IN_PROGRESS / WAVE_1A_IN_PROGRESS`

Audited revision: `50f1f857f33758baf56450435e79ef7eaa4499e4`

Production surface: `https://www.justurbanwears.com/studio`

This is a point-in-time verification and delivery plan. It does not replace the
Studio ADRs, authorize a database change, authorize provider spend, or certify
that a later revision remains equivalent.

## Objective

Studio must carry either authorized JUW admin through Home, Wardrobe,
publication, Atelier media, Models, Orders, Inventory, stock count, Operations
and Ask Studio using one current server projection, one interaction grammar and
the same guarded domain commands.

At every step the operator must be able to answer:

1. What record or service am I viewing?
2. What is its current, authoritative state?
3. What is the one useful action now?
4. What will change before I confirm?
5. What actually changed after the command finished?

## Intended contracts and known documentation drift

ADRs 0044, 0045, 0047 and 0048 are still marked `Proposed`. They describe the
intended Studio contract and are implemented in part, but their status must not
be presented as a completed ratification:

- [ADR 0044](../adr/0044-studio-home-service-registry-and-stack-navigation.md)
  owns Home, service navigation, global Search and the stack shell.
- [ADR 0045](../adr/0045-studio-unified-projection-search-and-command-plane.md)
  requires one operator-safe projection and one command envelope.
- [ADR 0047](../adr/0047-studio-progressive-stack-page-experience.md)
  requires Orient, Act, Progress, Review, Confirm and Receipt.
- [ADR 0048](../adr/0048-studio-drop-orchestration-and-collection-scope.md)
  makes collection ID/key and server membership authoritative.
- [Release checklist](RELEASE-CHECKLIST.md) remains the release gate.

The document set also contradicts the shipped navigation:

- ADR 0041 still accepts route-level floating action buttons, while ADR 0044
  removes them in favour of Home-owned service navigation.
- ADR 0043 still requires a header Updates bell, while ADR 0044 moves updates
  into the Home/service stack. ADR 0043's readiness ledger also predates the
  shipped catalogue CRUD, orders, inventory, roles and recovery surfaces.
- The Studio screenshot-proof README still depicts obsolete work cards and
  floating action buttons.

Remediation must either accept/supersede the relevant ADRs and refresh the
screenshots, or explicitly document why the older contract remains. Historical
screenshots and proposed acceptance numbers are evidence, not current business
truth.

Two observations from the audit are intentional and should not be “fixed” into
new navigation:

- Home owns primary navigation. Non-Home headers intentionally contain Back,
  the page title and Ask Studio; Profile is not required on every route.
- Publication remains a separate domain, but its everyday operator entry may
  remain a succinct Wardrobe view instead of a duplicate service page.

## Evidence baseline

### Evidence identity

| Evidence | Identity |
| --- | --- |
| Canonical alias | `https://www.justurbanwears.com` |
| READY production deployment | `dpl_2c7CC69RLMv4y4Wa6jB1xkuW5JpD` (`justurbanwears-gb4mogd9e-drdyranes-projects.vercel.app`) |
| Deployment source revision | `50f1f857f33758baf56450435e79ef7eaa4499e4`, verified from Vercel deployment metadata |
| Deployment created | `2026-09-02 18:48:43 PDT` |
| Audit window | `2026-09-02`, America/Los_Angeles; exact start/end were not captured |
| Authenticated role | An authenticated Studio admin session; the baseline notes did not capture the exact actor subject |
| Captured viewports | Mobile `390 × 844`; wide desktop and native-island checks were performed but exact desktop dimensions were not retained |

The missing actor, exact desktop dimensions and exact audit start/end make this
a discovery baseline, not final certification. The deeper audit must write an
immutable run manifest before its first request.

Production identity was rechecked read-only at `2026-09-02 20:56 PDT` with:

```bash
npx vercel inspect https://www.justurbanwears.com --json
npx vercel api /v13/deployments/dpl_2c7CC69RLMv4y4Wa6jB1xkuW5JpD
curl -fsSL https://www.justurbanwears.com/sw.js
```

### Rendered production coverage

The authenticated production review exercised:

- Studio Home and Settings;
- universal search, including a name search for the violet garment;
- Wardrobe default, publication and Archived scopes;
- one real piece and its editable facts;
- Media, Create media and one media record;
- Models and Lulu V4 authority;
- Orders empty state;
- Operations default and Inventory;
- Stock count;
- Ask Studio and conversation History.

Mobile checks used a 390 by 844 viewport on Home, Wardrobe, piece, Create media,
Operations and Ask Studio. No horizontal overflow was observed. Desktop checks
covered the established wide shell and native right island.

No paid generation, order transition, publication, permanent deletion or
Atelier lock was executed.

### Automated evidence

- The audit session reported a passing release TypeScript check and 116 passing
  focused mutation/control-plane tests, but did not retain the exact command
  manifest. These results are directional evidence and must be rerun with exact
  commands captured before remediation release.
- A retained discovery run covered seven responsive/navigation suites: 42 of
  43 assertions passed. The remaining failure is a stale source-shape
  assertion for the simulator `AppShell`; it expects one-line JSX while the
  same operator projection is now formatted across multiple lines.
- Production route rendering produced no browser-console error during the
  covered read journeys.

### Existing dirty boundary

The audit began with 15 visible pre-existing changes. Most are Virtual Atelier
work, but `lib/server/studio-atelier-repository.ts`, `package.json`,
`tsconfig.release.json` and Studio Atelier tests overlap the audited runtime or
its verification boundary. They must be preserved and ownership-resolved before
an overlapping edit.

The workstation also contains ignored iCloud-style clones such as
`app-shell 2.tsx`, `operations-desk 2.tsx` and `wardrobe-workbench 2/3.tsx`.
This is workstation-local hygiene because `.git/info/exclude` is not repository
state. The point-in-time inventory found 33 duplicate files under
`components/studio`, 22 duplicate documents and 233 duplicate-named files
across active source/document directories. They do not ship in the release
configuration, but they pollute search and ordinary TypeScript discovery.

### Audit-side production observation

During confirmation-dialog inspection, `Confirm at Wardrobe rail` on JUW-048
executed immediately rather than opening a review. It wrote an observation at
`2026-09-03T02:51:00.233Z`. Expected and observed location remained Wardrobe
rail; custody, availability, drop and publication did not change. No other
production write was attempted. The absence of a confirmation boundary is
recorded below as `STU-003`.

### Discovery/remediation checkpoint — Wave 0, cell 1

The first side-effect-free local cell reproduced `STU-006` on the authenticated
real route `/studio/wardrobe/wardrobe-seed-juw-025`. The piece itself loaded,
but its Atelier eligibility request returned 500 and Vinext displayed the Sharp
native-module build overlay. The static import path crossed two boundaries:

1. eligibility imported durable projection recovery through the full durable
   engine, which imports the Sharp-backed lock compositor; and
2. eligibility imported qualification availability through the full qualified
   evaluator, which also imports the Sharp-backed subject compositor.

The local correction extracts a repository-only durable projection reader, a
pure stage-readiness mapper and a capability-only qualification resolver. The
full production runtime re-exports the same stage helpers, so executable engine
behavior and all fail-closed qualification gates remain unchanged.

Retained proof after one clean local server restart:

- real piece route: 200;
- `/api/studio/application`, `/api/studio/authority`, `/api/studio/wardrobe`,
  piece lifecycle and piece Atelier eligibility: 200;
- rendered Atelier state: `Current flow`, with the truthful direct-source
  blocker and current-photo fallback;
- build overlays: zero;
- focused eligibility/durable/runtime tests: 51 passed, 0 failed;
- release TypeScript check: passed;
- paid provider calls, production writes, database mutations and deployment:
  none.

Independent read-only discovery also confirmed `STU-009A–C`. The currently
passing 46 focused Ask tests do not exercise a real two-actor repository race,
rapid failed thread creation, a conversation beyond its retrieval/model
windows, or malicious stored/tool text. Those scenarios remain release gates,
not inferred passes.

### Discovery/remediation checkpoint — Wave 1A collection truth

The operator identified the current public collection as all 34 Drop 02 pieces.
The checked-in 52-row release manifest independently resolves that exact set as
`JUW-025` through `JUW-058`, while retaining 18 historical Drop 01 members.
Authenticated production readback at the start of this cell showed that the
first-class Drop 02 row held only 17 members, even though the public catalogue
and Wardrobe contained the full 34. The mismatch is therefore a stale
collection backfill, not permission to infer a new SKU range.

Cell `STU-001` uses one guarded forward migration to align the 34 exact released
SKUs and their published Wardrobe targets. It rejects missing rows, conflicting
membership, an incorrect active collection or a conflicting Wardrobe target;
it does not rewrite inventory, orders, media, publication state or legacy drop
labels. Once a database collection projection is present, Wardrobe and Search
no longer fall back to compatibility membership: an unmatched published piece
is labelled `Unassigned`.

## Findings

| ID | Priority | Finding | Evidence and consequence | Required acceptance |
| --- | --- | --- | --- | --- |
| `STU-001` | P1 | Collection truth is split | Production reports Drop 02 as 17 members, Wardrobe labels/lists 34, ADR 0048 records a proposed historical expectation of 19 (JUW-025–043), and `studio-drop-context.test.ts` asserts 34. None of those numbers alone is current business authority. | Collection rows, release ledgers, publication history and an operator decision establish the intended current set. Then migration fixture, ADR, tests, server projection, Wardrobe, Home, Search and Ask change together. Unmapped pieces appear as `Unassigned`; nothing is silently backfilled to 19 or 34. |
| `STU-002` | P1 | Attention has two meanings | Home and desktop Operations context report 2 items because the shared summary counts private pieces and notifications. The Operations page reports 0 because it considers location mismatches and due orders. | One server-owned actionable selector supplies Home, Continue, Operations tabs and Ask. Private drafts receive their own truthful label instead of being silently reclassified as operational exceptions. |
| `STU-003` | P1 | Expected-location confirmation mutates immediately | `Confirm at Wardrobe rail` dispatches `recordLocation(..., "CONFIRM")` directly. The currently passing `studio-inventory-detail-surface.test.ts` source assertion codifies this defective direct mutation instead of detecting it. | Opening review and Cancel write nothing. Confirm creates one observation and one receipt. Double-tap remains single-flight; a lost response reconciles to the original receipt without replay. |
| `STU-004` | P1 | A failed refresh can present stale truth as ready | After a successful load, an application refresh failure retains `status = ready`; Home and desktop context continue rendering the old snapshot without a stale/degraded indicator. | A failed refresh preserves useful last-known data only with visible `as of` and degraded-source state. Consequential actions revalidate or block. |
| `STU-005` | P1 | Create media and Scan do not adopt the wide shell correctly | `/studio/media/new` and `/studio/scan/[sku]` miss exact route matching. Create media keeps a legacy two-column grid inside the 28–32rem right island, compressing and overlapping its controls. | Both routes receive explicit context/adaptive ownership. Create media is legible at the native canvas width, all controls fit, and the same hierarchy works at 390px and wide desktop. |
| `STU-006` | P1 | The local real garment route is not a reliable QA surface | The read-only Atelier eligibility composition imports the production runtime, which imports the Sharp execution service. Vinext fails to bundle the Linux Sharp runtime and returns 500/build overlay on real piece routes. | Read-only eligibility imports no paid/heavy execution dependency. A clean local server loads Home, Wardrobe, piece and Atelier eligibility without overlay or 500. |
| `STU-007A` | P1 | Media draft writes are not atomic | Back/detail media can be persisted before the final draft compare-and-swap, leaving partial durable state when the final claim fails. | One media preparation command owns all writes or compensates them deterministically; duplicate, stale and interrupted requests reconcile to one receipt. |
| `STU-007B` | P1 | Order/refund/return commands lack replay identity | These transitions do not consistently expose a durable semantic/idempotency identity that can be read after a timeout or lost response. | Each transition binds actor, expected revision, semantic fingerprint and durable idempotency key, then resolves to an exact replay-addressable receipt. |
| `STU-007C` | P1 | Direct piece, Models and stock-count mutations trail Ask safeguards | Several direct paths use weaker idempotency, stale-version or reconciliation behavior than prepared Ask operations. | Each owning domain adopts the common envelope one independently releasable command family at a time; direct UI and Ask produce the same domain outcome and receipt. |
| `STU-008` | P2 | Ask route context is piece-only | The durable focus schema supports Piece, Drop, Order, Inventory, Media, Model and Service, but shell entry passes context only from `/studio/wardrobe/[id]`. | Entering Ask from any record/service carries its current canonical focus. Explicit references replace focus; ordinary follow-ups inherit it; fresh tool truth always wins. |
| `STU-009A` | P1 | Shared Ask turns are not serialized on the server | The client single-flight guard is tab-local. Two admins or tabs can acquire different message IDs on the same thread, both invoke the model, interleave pending messages and race unversioned focus writes. | One atomic server-owned active-turn lease and monotonic ordering protect each thread. The same message joins/replays; a different concurrent message returns a typed busy result with preserved input. Focus updates are owned by the winning turn/version. |
| `STU-009B` | P2 | Ask History/New can race thread creation | `New` clears the local transcript before thread creation succeeds and has neither a synchronous shared guard nor a create idempotency key. Failure can pair the old active thread with an empty transcript; rapid taps can create multiple threads. | New, resume, rename and archive are single-flight and recoverable. The visible thread changes only after durable creation succeeds, and repeated creation identity returns one thread. |
| `STU-009C` | P2 | Long Ask worklanes and untrusted record text are under-specified | UI retrieval stops at 120 messages and model context at the latest 20 completed messages. Structured focus survives, but ordinary worklane context has no durable summary/pagination. Stored record fields and tool output enter model context without an explicit untrusted-data instruction boundary or adversarial fixture. | Durable summaries plus older-message pagination preserve the worklane, while every stored/tool-derived value is labelled untrusted data and cannot become an instruction. Long-thread and adversarial-data fixtures prove both boundaries. |
| `STU-010` | P2 | Archived Wardrobe has no desktop context case | `collection=archived` renders the correct list but the left context falls through to `Unavailable`. | Archived has explicit subject, count and read-only lifecycle copy derived from the same projection. |
| `STU-011` | P2 | Several labels obscure valid distinctions | `Inventory 54`, `34 available` and `36 expected` are individually plausible but unexplained; Models says one model is ready while Create media says on-model is unavailable; the publication filter is also presented as a second `Shop` identity. | Copy names the set being counted (`All records`, `Available now`, `Expected at this location`) and explains when authority readiness differs from generation capability. Publication remains a clearly named Wardrobe filter with no duplicate list identity. |
| `STU-012A` | P2 | Studio route recovery is incomplete | Studio lacks route-level error/not-found recovery that preserves the authenticated shell. | Errors and unknown records keep authenticated navigation, explain the failure and offer one safe recovery action. |
| `STU-012B` | P2 | Assistive feedback is incomplete | Ask announces busy state but not completed replies, and one mobile media control is 36px. | Reply completion is announced, dialog naming/focus return is correct and every pointer target is at least 44px. |
| `STU-012C` | P2 | iOS safe-area behavior is not certified | Safe-area configuration is internally inconsistent and was not exercised on a real iOS engine/device. | Header, nested sheets, composer and fixed actions remain reachable on real iOS Safari with keyboard open/closed and all supported insets. |
| `STU-013` | P2 | Workstation-local ignored source clones create diagnosis risk | `.git/info/exclude` hides `* 2*` and `* 3*`, while ordinary `tsconfig.json` includes all TS/TSX and the release config excludes the clones. Tools can inspect an obsolete implementation that production never builds. | Every ignored clone is compared by exact path and hash. Unique work is deliberately integrated or preserved outside the source tree; exact obsolete clones are removed only under separate cleanup authority. Local and release discovery see the same canonical source set. |
| `STU-014A` | P3 | Navigation consumers drift from the Studio boundary | Create media still uses client router pushes instead of the production-safe Studio link boundary. | All Studio-internal transitions use the canonical link/navigation contract and retain loading/back behavior. |
| `STU-014B` | P3 | Route metadata inherits Shop identity | Some Studio routes expose Shop metadata rather than route-specific Studio identity. | Representative Home, Wardrobe, Media, Operations, Orders and Ask documents expose intentional Studio metadata. |
| `STU-014C` | P3 | Simulator aliases and stale assertions are undocumented | Operations order/return aliases still serve the lifecycle simulator, but look dead from production-route inspection. One simulator assertion also encodes obsolete source formatting instead of behavior. | Document the aliases as simulator compatibility grammar and make tests assert shipped behavior rather than formatting or obsolete copy. |

### Finding evidence index

| Finding | Current source/test evidence | Missing proof | Rendered route |
| --- | --- | --- | --- |
| `STU-001` | `studio-drop-context`, `studio-application-projection`, `studio-change-drop-ui`, `studio-published-collection-membership-command` | Operator-approved membership plus one migrated production-like fixture | `/studio/wardrobe`, Search, Home, Ask |
| `STU-002` | `studio-home.tsx`, `operations-desk.tsx`, `studio-desktop-context-stage.tsx` | One selector regression across every consumer | `/studio`, `/studio/operations` |
| `STU-003` | `studio-inventory-detail-surface`, `studio-decision-experience` | Real open/Cancel/Confirm/double-tap/lost-response behavior | `/studio/operations?view=inventory` |
| `STU-004` | `components/studio/studio-provider.tsx` refresh path | Failed-refresh regression with stale/as-of UI and command blocking | Home plus any consequential sheet |
| `STU-005` | `studio-desktop-context-stage`, `studio-adaptive-workspace` (primarily source-pattern assertions) | Rendered native-island/mobile geometry and interaction | `/studio/media/new`, `/studio/scan/[sku]` |
| `STU-006` | Eligibility import graph, 51 focused Atelier tests and clean local route/API render | Production build and authenticated deployed-route proof remain | `/studio/wardrobe/[id]` |
| `STU-007A` | `studio-create-media-reliability`, pending-media and completion-engine tests | Atomic multi-media CAS and interrupted-write reconciliation | `/studio/media/new`, piece media flow |
| `STU-007B` | `connected-order-reliability`, `assisted-order-recovery`, order transition routes | Domain idempotency/receipt lookup after response loss | `/studio/orders/[reference]` |
| `STU-007C` | garment-lifecycle/idempotency, Lulu identity/Models and stock-count tests | Same semantic envelope/receipt through direct UI and Ask | Piece, Models, Stock count |
| `STU-008` | `studio-ask-experience`, assistant thread/focus/tool-service tests | Every record/service entry carries focus and refreshes truth | Each service → `/studio/ask` |
| `STU-009A–C` | Ask route/thread repository, 46 focused control-plane tests and source audit | Real concurrent two-actor repository call, rendered History/New race, long-thread and adversarial-data fixtures | `/studio/ask` |
| `STU-010` | `studio-desktop-context-stage` | Explicit archived context at native/wide desktop | `/studio/wardrobe?collection=archived` |
| `STU-011` | application projection plus Wardrobe/Models/Create-media UI | Cross-route count/readiness copy acceptance | Home, Wardrobe, Models, Create media |
| `STU-012A–C` | mobile UX, decision experience and media surface tests | Error routes, screen-reader trace and real iOS safe-area/keyboard proof | Representative stack routes and nested sheets |
| `STU-013` | Workstation path/hash inventory and TypeScript configs | Reviewed keep/remove manifest under separate authority | Not a rendered route |
| `STU-014A–C` | navigation contract, route sources and metadata output | Representative navigation/back/loading and document metadata | Home, Wardrobe, Media, Operations, Orders, Ask |

## Remediation and verification order

Each wave has one integration owner on `main`, disjoint implementation paths,
one independent review and one integration-gate pass. A failed gate allows one
bounded correction and recheck; it does not open another audit loop.

### Discovery pass — before remediation

Run the side-effect-free fixture and read-only browser scenarios first. Install
a browser/network fence that rejects every production `POST`, `PUT`, `PATCH`
and `DELETE` under `/api/studio/`, then exercise the P0/P1 matrix without paid
calls or persistent writes. Newly observed defects update this document before
the implementation cells are assigned.

Gate:

- an immutable run manifest records revision, deployment, routes, viewports,
  role, commands, timestamps and environment fingerprints;
- every finding has reproducible source/test/rendered evidence;
- production command/event tables contain no audit actor, fixture ID,
  idempotency prefix or run-window write.

### Wave 0 — restore a deterministic local baseline

Scope:

1. Resolve ownership only for overlapping dirty paths:
   `lib/server/studio-atelier-repository.ts`, `package.json`,
   `tsconfig.release.json` and affected Studio Atelier tests. Preserve unrelated
   Virtual Atelier documents/state exactly as found.
2. Keep the ignored `* 2*`/`* 3*` clone inventory as separately authorized
   workstation hygiene, not a prerequisite for unrelated Studio fixes.
3. Decouple read-only Atelier eligibility from Sharp and the paid execution
   runtime.
4. Correct the stale simulator source-shape assertion without changing route
   behavior.
5. Accept/supersede the contradictory proposed ADRs and refresh obsolete
   screenshot proof without changing runtime behavior.

Gate:

- intentional `git status` only;
- local and release TypeScript discovery agree;
- clean local Home, Wardrobe, piece and Atelier eligibility requests return
  successful responses;
- no Sharp/Vinext overlay;
- focused navigation and Atelier route tests pass.

### Wave 1A — establish collection truth

Scope:

1. Compare the proposed ADR value 19, the test fixture value 34, production
   membership 17, collection rows, release ledgers and publication history.
2. Obtain and record the operator-approved current membership; do not infer it
   from any historical count.
3. Apply one guarded membership migration, expose every unassigned item
   explicitly, remove the Wardrobe fallback and update ADR, fixture and every
   consumer together.

Gate:

- server projection, rendered counts, Search and Ask agree exactly;
- forward/reverse moves preserve inventory, orders, media and publication
  truth;
- an unmapped item is never silently assigned.

### Wave 1B — location confirmation

Replace the direct observation with the existing succinct
Review/Confirm/Receipt dialog. Opening and Cancel write nothing; Confirm binds
actor, expected revision, location and idempotency identity.

Gate: one observation and receipt after Confirm; double-tap and response loss
reconcile without a second write.

### Wave 1C — attention and projection freshness

Define one actionable attention selector and separate private-draft counts.
Add visible `as of`/degraded state after refresh failure and force fresh
revalidation before a consequential command.

Gate: Home, Operations, Continue and Ask agree; simulated refresh failure never
presents stale data as current or permits an unchecked write.

### Wave 1D — command safety, one family per release cell

Close media atomicity, then order/refund/return replay identity, then direct
piece lifecycle, Models and stock count. Each family receives expected revision,
semantic fingerprint, durable idempotency, exact receipt and
`INDETERMINATE` reconciliation before the next family begins.

Gate per cell: duplicate, stale, ambiguous and interrupted commands are
exercised; two admins cannot silently overwrite; Cancel and double-tap cause
zero extra writes; every success resolves to one receipt.

### Wave 2 — responsive workspace and operator clarity

Scope:

1. Give Create media and Scan explicit wide-shell/adaptive behavior.
2. Add Archived desktop context.
3. Clarify count-set and model-readiness copy.
4. Collapse the duplicate Shop/Publishing presentation into one succinct
   Wardrobe publication filter while retaining Publication domain ownership.
5. Add Studio error/not-found recovery, streaming announcements, minimum target
   sizes and verified safe-area behavior.
6. Correct Studio route metadata and safe navigation consumers.

Gate:

- 320, 390, 512 native-canvas, 1100 and 1600px checks in light/dark;
- long names, long descriptions, empty/loading/degraded/error states;
- keyboard, focus restoration, reduced motion, reduced transparency and forced
  colors;
- no overlap, clipping, horizontal scroll or orphaned left stage.

### Wave 3 — finish Ask Studio as the conversational control plane

Scope:

1. Add a server-owned per-thread active-turn lease, ordered turns and
   version-owned focus updates before any live-model concurrency test.
2. Carry canonical focus from every supported Studio route.
3. Make thread New/Resume/Rename/Archive single-flight, idempotent and
   recoverable without clearing the current transcript first.
4. Add durable worklane summaries/older-message pagination and mark stored
   record/tool text as untrusted data rather than instructions.
5. Verify the same typed tool outcome across the deterministic fallback and
   live-model path.
6. Exercise clarification, prompt-injection resistance, stale focus, cancelled
   confirmations and receipt reconciliation.
7. Keep direct UI fully usable when the model or Gateway is unavailable.

Gate:

- the same conversation can be resumed by both admins with actor attribution;
- `JUW-026` → `What is its description?` → `Change it to…` preserves focus and
  stops at review;
- name, fuzzy and ambiguous searches behave deterministically;
- 402, 429, 503, timeout, abort and interrupted-stream states are recoverable;
- no model text can invent a record, confirm for the operator or mutate without
  the owning command.

### Wave 4 — disposable end-to-end certification

Run the deeper scenario matrix below against a preview deployment backed by a
fully isolated disposable environment and test-only identities. Production
receives only mechanically fenced read-only release smoke after the same
revision is `READY`.

Gate:

- application, API, database and rendered receipt agree for every scenario;
- all namespaced records are removed with before/after evidence;
- production collection, catalogue, inventory, orders, media and authority
  snapshots are unchanged, while legitimate concurrent admin changes are
  separately attributed from the audit actor/IDs/time window;
- exact commit, deployment and cleanup receipts are retained.

## Deeper scenario audit

A deeper audit is likely to find additional defects because the first pass did
not exercise real concurrent admins, interrupted writes, paid model selection,
provider failures, long-lived conversation recovery, a live order lifecycle or
real iOS safe areas.

Run the non-mutating discovery subset before remediation, then repeat the
relevant matrix after remediation as final certification. The first pass finds
unknowns; the second proves the fixes.

### Environment tiers

| Tier | Purpose | Allowed side effects |
| --- | --- | --- |
| Scenario fixtures | Fast route, state, copy and responsive coverage | None; in-memory/read-only only |
| Pure live-model harness | Real Ask instructions, 12 tool schemas, tool choice, focus, injection resistance and bounded prose | Provider spend only; tools use a capture/fixture executor with no database or domain call |
| Isolated disposable preview | Real auth, thread persistence, database writes, concurrency and receipts | Namespaced data only; isolated Neon, Blob prefix/store, test identities, disabled outbox/payments/publication/analytics and a non-production alias |
| Production smoke | Confirm the released revision and current business truth | Read-only requests behind a network fence that rejects all Studio writes |

### Real-use-case matrix

| Scenario | Essential edge cases | Evidence |
| --- | --- | --- |
| Find and continue a piece | SKU variants, full/partial name, typo, two similar names, route context, pronouns | Exact canonical ID/focus and rendered record |
| Edit live facts | Name, description, price, no-op edit, invalid value, two admins editing the same revision | One winner, stale command blocked without lost input, private revision, Cancel, receipt and unchanged public value until publish |
| Publish revision | stale preview, two-tab double confirm, abort/lost response after server commit, replay | One publication write/receipt; readback returns the original receipt |
| Move collection | zero/multiple active collections, active↔archived invalid target, stale membership, reverse move | Truthful blocker or exact collection receipt; inventory/order/media unchanged |
| Archive and permanent delete | protected history, live piece, eligible test draft, wrong typed confirmation | Fail-closed protection and exact deletion receipt only in disposable data |
| Inventory location | open/cancel review, confirm expected, move, stale revision, interrupted response | Zero writes before Confirm; one observation/move receipt and consistent attention count |
| Hold/release | expiry boundary, conflicting admin, connected order, retry | One hold identity and correct availability consequence |
| Stock count | frozen snapshot, mismatch, late inventory change, close replay | Same snapshot, explicit mismatch, one close receipt |
| Order/return | payment review, fulfilment, cancellation, refund, return, concurrent actor | One versioned command/receipt per transition and matching inventory |
| Media preparation | missing/corrupt Blob, wrong MIME, oversized/duplicate upload, unavailable model, navigation recovery | Zero-spend blocker or one durable request; no hidden substitute or duplicate paid job |
| Models authority | self-review, second-admin review, revoke during use, stale form | Correct authority gate and actor attribution |
| Ask shared thread | second admin resumes, simultaneous messages, New double tap, archive/resume, conversation beyond the 20-message model window | One ordered shared history, stable fresh focus and no duplicate thread |
| Ask model behavior | explicit/fuzzy target, follow-up, user injection, malicious stored/tool text, unsupported command, expired prepared operation | Exactly one permitted typed tool first; data never becomes instruction; bounded prose; refresh/re-prepare before execution |
| Session/privacy | expiry or membership revocation while a sheet is open; direct private-media URL after logout | Command fails closed with no partial write; private bytes/paths remain inaccessible |
| Failure recovery | offline, mocked 402/429/503/timeout, aborted paid stream, stale projection, indeterminate paid result | Preserved input and idempotent resume; ambiguous paid evidence is quarantined, not erased |
| Search/deployment races | old slow search after newer query; cached browser spanning a deployment | Only newest results render; one deployment identity and no stale chunk/CSS 404 |
| UI/UX | 320–1600px, 200% zoom, empty/one/large sets, long data, nested sheets, keyboard, VoiceOver, real iOS Safari, motion/contrast/safe areas | Screenshots, DOM measurements, focus trace, announcements and accessibility results |

## Proposed AI Gateway budget protocol

The suggested two-dollar lane is useful for Ask Studio's text/tool orchestration.
It is not yet authorized by this document.

Current implementation references:

- [AI Gateway overview and configuration](https://vercel.com/docs/ai-gateway);
- [dynamic model discovery](https://vercel.com/docs/ai-gateway/models-and-providers);
- [budget behaviour](https://vercel.com/academy/ai-gateway/set-a-budget);
- [authentication and BYOK scope](https://vercel.com/docs/ai-gateway/authentication-and-byok);
- [cost attribution and routing](https://vercel.com/kb/guide/cost-aware-model-routing-with-ai-gateway).

Vercel describes the API-key quota as a soft cap: a request that crosses the
quota may finish, while later requests are rejected. Therefore a `$2.00` key
quota is only a backstop. The actual operator ceiling must be enforced by
serialized application-side accounting and a conservative reserve before each
whole Ask turn.

### Prerequisite instrumentation

The current route is not yet attributable enough for this audit:

- `studio-assistant-agent.ts` emits only static tags and has no server-owned
  audit run/user injection point;
- `app/api/studio/ask/route.ts` and the message schema persist token usage, not
  Gateway generation IDs or cost;
- connection detection can fall back to `VERCEL_OIDC_TOKEN`, which could bypass
  the intended dedicated audit key.

Before any paid request, add a small server-owned audit seam to the existing
agent factory. It must attach a non-client-controlled run ID/test user, capture
every model step's Gateway generation ID, reconcile each ID through Gateway
generation information/`totalCost`, and stop when any generation or cost is
missing. Prove that the audit process uses the dedicated key and cannot fall
back to OIDC or another system credential. The spend report is secondary
evidence, not a substitute for per-generation reconciliation.

Before the first paid request:

1. Create a dedicated short-lived Gateway key with a `$2.00` soft quota and no
   refresh. Record automatic top-up, BYOK billing and credential-fallback state.
   Inject it only into the local audit harness/preview process; Gateway keys are
   not inherently confined to one preview project.
2. Discover currently available tool-capable models from Gateway rather than
   hard-coding a remembered slug.
3. Use only synthetic, namespaced data—never customer PII or private
   garment/model evidence—and an approved provider/retention allowlist.
4. Tag every request with `feature:studio-ask`, `env:ephemeral` and
   `audit:<runId>`, and set `user` to the namespaced test operator through the
   server-owned seam.
5. Retain the existing 420-output-token ceiling, first-step required typed tool
   and no automatic retry. Bound the run to 12 conversations, 24 provider
   generations and an explicit maximum input-token count per generation.
6. Run one request at a time. Before each normal two-generation Ask turn (tool
   selection, then final prose), require measured spend plus a conservative
   worst-case cost for the entire next turn to remain at or below `$1.50`.
   Missing cost, generation identity or a running/indeterminate prior request
   stops the lane.

Most cases should call the exact production `createStudioAssistantAgent`
factory with an explicitly keyed Gateway client and a pure capture/fixture tool
executor. This exercises the real instructions, 12 schemas, required-first tool
choice and model-generated answer while making zero Studio database or domain
calls.

Run on the configured model:

- exact SKU read and fuzzy-name read;
- durable-focus follow-up (`What is its description?`);
- ambiguous target clarification;
- prepared name/description/price edit without confirmation;
- prepared permanent delete without confirmation;
- unsupported mutation;
- user prompt injection and malicious text inside a tool-result fixture.

Run a representative subset—exact read, focus follow-up, prepared edit and
injection—on one dynamically discovered economical, tool-capable alternative.
At this audit snapshot those candidates are `openai/gpt-5.4` and
`openai/gpt-5.4-mini`; re-query the live catalogue immediately before an
authorized run. Accept the same typed outcome and safety invariants, not
identical wording.

Mock/deterministic tests remain responsible for exhaustive 402, 429, 503,
timeout and combinatorial failure coverage. A deliberate abort may be one paid
reconciliation case; the live lane otherwise proves model semantics and real
Gateway accounting, not synthetic provider outages.

Allow at most one optional authenticated browser pass against the isolated
preview to prove auth → shared thread → focus → stream → persistence. It may
read or prepare namespaced records but must never post confirmation to the Ask
operation-confirm endpoint. The pure harness remains the primary paid path.

### Cleanup contract

Every human-readable fixture uses `QA-STUDIO-<runId>`; every server-generated
UUID is recorded in an immutable setup manifest. Before the first write, the
manifest proves that database branch, deployment/alias, Blob target, auth
subjects, outbox/payment/publication/analytics sinks and Gateway credential all
differ from or cannot deliver to production.

Cleanup then:

1. closes preview ingress and revokes the Gateway key first;
2. waits for zero pending/running/leased/in-flight operations;
3. reconciles every ambiguous model or mutation result; an indeterminate result
   quarantines the environment instead of deleting evidence;
4. exports only sanitized reports and receipts;
5. deletes and verifies every exact test Blob object/prefix;
6. removes audit environment variables, test identities and preview aliases,
   then deletes the preview deployment and disposable Neon branch (branch
   deletion is also the truthful removal boundary for archived Ask threads);
7. queries production command/event/outbox tables for zero audit actor, exact
   fixture UUID, idempotency prefix and run-window activity;
8. attributes legitimate concurrent Studio changes separately, then verifies
   no public URL exposes a fixture and the production catalogue, collection,
   inventory, orders, media and Models snapshots contain no audit residue.

Gateway billing/request logs and the incurred spend are external audit evidence
and cannot truthfully be described as deleted. The promise is zero production
business-data side effects, not zero provider telemetry.

Paid Atelier image generation is excluded from this two-dollar lane. The
Virtual Atelier contract requires every returned paid byte and accounting
checkpoint to be persisted before policy or QA. An image-generation audit
therefore cannot both run and erase every artifact; it needs separate explicit
authority, private storage and the normal evidence-retention lifecycle.

## Release and stop conditions

Do not start the paid lane until the operator explicitly authorizes the spend
and the disposable target, key budget and cleanup manifest are visible.

Do not release while any P1 finding remains open, collection counts disagree,
local real-route QA is broken, a consequential direct mutation lacks command
identity, or a test artifact cannot be proven outside production.

Stop a verification path at its first broken boundary, record the evidence and
fix that bounded defect before continuing. Do not repeatedly rerun already
verified journeys.

`LIVE_VERIFIED` requires the exact revision, a `READY` deployment, authenticated
fresh-browser checks of the affected Studio routes, consistent server/data
readback, and proof that disposable artifacts were removed.
