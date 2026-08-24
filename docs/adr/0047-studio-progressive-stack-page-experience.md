# ADR 0047: Studio progressive stack-page experience

- Status: Proposed
- Date: 2026-08-22
- Owner: Studio Experience
- Scope: every Studio service, record and bounded workflow after navigation from ADR 0044; domain truth remains governed by its existing contracts

## Context

ADR 0044 makes Home the complete Studio map and establishes Profile, Search and
Ask Studio as the stable shell controls. That decision must remain intact. A
simple Home is insufficient, however, if Wardrobe, Atelier, Shop, Orders,
Inventory, Models and Operations each become a different kind of complicated
application after Lulu opens them.

Each workspace currently exposes a different amount of lifecycle, evidence and
operational complexity. Lulu must often understand which record is
authoritative, which step comes next and whether an action was actually saved.
This ADR extends ADR 0044's simplicity into every service, record and bounded
workflow without changing its Home hierarchy or service registry.

## Decision

Extend ADR 0044 with one shared progressive interaction grammar for the whole
Studio. Every service and record carries the same clarity through orientation,
action, progress, review, confirmation and receipt.

ADR 0044 continues to own Home, shell controls, service ordering and navigation.
This ADR begins when a service or record opens. Domain complexity remains
available through progressive disclosure; it is not placed in the primary path
merely because an engine, audit or release process needs it.

## Whole-Studio interaction grammar

Every service, record and bounded workflow follows six stages:

1. **Orient** — name the current subject, its truthful state and why attention
   is needed.
2. **Act** — present one primary next action; secondary inspection remains
   available but visually quiet.
3. **Progress** — show a short, human-readable stage and preserve input while
   work is pending.
4. **Review** — show the evidence, proposed result and material differences
   before mutation.
5. **Confirm** — ask only for the decision the engine cannot make for Lulu.
6. **Receipt** — state exactly what changed, where it was saved, its current
   visibility and the next meaningful destination.

This grammar applies whether the entry came from Home, Search, Ask Studio, a
deep link or an Update. Those entry points may change how the record is found;
they do not create different workflows.

At every point Studio answers four questions without requiring a menu or
documentation:

- What am I looking at?
- What state is it in?
- What is the one useful thing I can do now?
- What happened after I acted?

The primary path does not expose provider names, prompts, hashes, storage paths,
database terminology, authority-stack internals, retry counters or release
mechanics. Those belong in permissioned inspection and provenance views.

## Service workflow contracts

Each service keeps its domain state machine but presents it through the shared
six-stage grammar.

| Service | Primary operator journey | Receipt truth |
| --- | --- | --- |
| Wardrobe | `Source -> visible facts -> garment proof -> confirm -> save` | Private draft or updated piece, missing evidence and next action |
| Atelier | `resolve authorities -> preflight -> generate/edit -> review -> Keep/Fix one thing/Reject -> lock` | Accepted view, rejected attempt or one exact missing-authority action |
| Shop | `readiness -> listing preview -> material diff -> confirm -> publish/update/unpublish` | Public state, exact revision and customer-visible consequence |
| Orders | `order received -> verify -> prepare -> handoff -> complete/return` | New order state, inventory consequence and fulfilment next step |
| Inventory | `find/scan -> inspect availability/location -> propose hold or change -> confirm` | Quantity/location/hold consequence and reversal where allowed |
| Models | `authority -> consent -> readiness -> styling -> approve/archive` | Current approved identity/styling authority and permitted use |
| Operations | `attention -> source context -> resolve or route -> receipt` | Source business state changed or one truthful unresolved blocker |

No service invents an additional workflow merely for AI. Direct controls and
Ask Studio both dispatch the same domain commands described by ADR 0045.

## Service-page template

A service page contains, in order:

1. stack header with Back/Home, service title and at most one contextual action;
2. compact state summary with freshness or degraded status;
3. one Continue/current-work area;
4. the service's primary collection or evidence surface;
5. collapsed secondary history, diagnostics or settings when applicable.

A record page replaces the service summary with record identity and lifecycle,
then uses the same Continue, evidence and receipt pattern. Long histories do not
push the current decision below the fold by default.

Lifecycle vocabulary is shared. `Draft`, `Private`, `Ready`, `In review`,
`Published`, `Reserved`, `Blocked`, `Failed` and `Archived` retain one meaning
across Home, services, Search, Ask Studio and Updates. Engine-specific states
are translated into these operator states plus a precise next action.

## Continuity and recovery

- A saved operation can be resumed from Home, its service, Search or an Update
  without changing identity or creating another job.
- Pending work keeps its route, input and evidence visible after refresh.
- Navigating away from unsaved input invokes the existing guarded-navigation
  contract.
- An indeterminate command is recovered by command or operation ID; the UI does
  not invite a duplicate submission.
- Recoverable failure preserves the last accepted truth and offers one concrete
  next action.
- A blocked workflow names one missing authority, permission or external state;
  it does not expose an internal error dump.
- Completed work ends with a receipt, not an unexplained disappearance from the
  queue.

## Update continuity

ADR 0043 remains authoritative for deriving updates from business state. ADR
0044 owns where Updates appears in the simplified shell. Opening an Update must
enter the same service or record workflow at its current Orient or Review stage.
It does not create a special resolution UI and does not mark work resolved merely
because the destination opened.

## Stack-page grammar

- Home owns primary navigation.
- A service destination is a durable route with browser history and direct
  linking.
- Service and record pages have a visible Back control, concise title and at
  most one contextual primary action.
- Back returns to the previous meaningful position and restores Home scroll
  when Home was the origin.
- Sheets are reserved for bounded decisions and progressive intake.
- Durable subjects, review queues and records remain pages.
- A contextual bottom island may appear only when a current selection or task
  requires it, consistent with the Experience System. It is never persistent
  navigation.
- A workflow cannot replace a stack page with a chain of unrelated modals.
- One sheet remains mounted through one bounded progressive task so source,
  progress, review and correction state are not lost between steps.

Deep links continue to work without first visiting Home. A deep-linked page
still exposes a clear route back to Home.

### Single stack-header amendment — 2026-08-22

Every non-Home Studio route renders exactly one shell-owned stack header:

1. a left Back-to-Home control;
2. the concise page or record name centred in the header;
3. Ask Studio at the right edge.

Search is optional on stack pages and appears only when the current collection
has a distinct discovery need; it is not duplicated by default. Page bodies do
not repeat the service name, marketing-style eyebrow or explanatory hero copy.
They begin with current state, one contextual action or the primary collection.
Record pages must not add a second local Back control. Bounded create, edit,
hold, confirm and intake work remains in task sheets with focus restoration.

## Search and Ask Studio

Search and Ask Studio depend on the unified projection and command plane in ADR
0045. They are not separate data clients.

Search is operator-safe and can discover services, garments, SKUs, orders,
customers, models, operations and media. Results prefer exact identifiers,
then names and known aliases, then recent activity. A result opens its canonical
route and never exposes private file paths, prompts, hashes or raw authority
metadata.

Ask Studio can answer, navigate and propose commands. It cannot bypass domain
authorization, evidence gates or confirmations. Its write flow is:

`request -> structured intent -> preview/diff -> confirm -> typed command -> receipt`

## Visual and interaction system

- Preserve JUW's warm-neutral canvas, semantic colour tokens and borderless
  editorial hierarchy.
- Reserve liquid glass for the three header controls, task sheets and truly
  floating contextual material.
- Service rows are calm, mostly flat and separated by spacing and typography,
  not a grid of glass cards.
- Each row has one label, one short status or description, an optional count and
  one forward affordance.
- Use the existing motion envelope; reduced motion removes spatial
  interpolation without removing state feedback.
- Reduced Transparency uses opaque semantic surfaces. Forced Colors gains
  explicit boundaries and native focus visibility.
- Targets are at least 44 by 44 CSS pixels. On stack pages keyboard order is
  Back/Home, record identity, primary action, review evidence, confirmation and
  then secondary inspection. ADR 0044 continues to own global-header order.
- Search, sheets and stack navigation preserve focus on dismiss or back.
- Progress is described in operator language such as `Reading the garment`,
  `Preparing the view` or `Waiting for your review`; decorative AI prose is not
  a substitute for state.
- Dense evidence and provenance use progressive disclosure and are never
  removed when required for a consequential decision.

## Responsive behavior

The service and record hierarchy is identical on mobile and desktop. Desktop
may place current action and supporting evidence beside one another, but it does
not restore a parallel navigation sidebar or expose more primary actions. A
collection may use a two-column label/status layout on wide screens while
remaining one ordered semantic list.

The mobile viewport must not reserve space for an absent dock. Safe-area
padding belongs to the page and contextual sheets, not an always-present
navigation island.

## Data and truth requirements

Record state, Continue, lifecycle counts, evidence readiness and search results
must come from one operator-safe server projection. The current mixture of
browser-machine data and connected authority is not sufficient for an
authoritative cross-service journey. Until ADR 0045's projection is active,
affected values must say `Local preview`, `Live state unavailable` or their
existing truthful fallback; the interface must not merge incompatible snapshots
into apparently exact state.

The model service must consume the current versioned identity authority. It may
not hard-code Lulu V2, V3 or a public model path in the shell projection.

## Migration

1. Inventory each service's current entry, states, primary actions, decisions,
   receipts, error recovery and deep links.
2. Introduce ADR 0045's unified projection and compare current service state in
   a read-only shadow.
3. Apply the shared page template and six-stage grammar to one evidence-heavy
   pilot: Wardrobe through Atelier review.
4. Verify that direct UI, Search and Ask Studio enter the same pilot state and
   dispatch the same commands.
5. Convert Shop, Orders, Inventory, Models and Operations one service at a time,
   preserving domain behavior, routes and accepted evidence.
6. Retire duplicated forms, modal chains and client-side state joins only after
   each service's old and new outcomes match.
7. Remove transitional service implementations after complete cross-service
   journeys and recovery acceptance pass.

Existing URLs and business workflows remain intact throughout migration.

## Rollback

Migrate one service at a time behind a bounded surface flag. Rollback restores
that service's former page composition while leaving routes, domain events,
receipts and business data untouched. It does not roll back ADR 0044's Home or
navigation decision. Any command already accepted by its domain remains
authoritative.

## Telemetry

Record privacy-safe product events for:

- workflow started, resumed, reviewed, confirmed, completed or abandoned;
- time from service entry to the next meaningful action;
- duplicate-action suppression and recovery outcome;
- entry source: Home, Search, Ask Studio, Update or deep link;
- command preview, confirmation, cancellation and receipt;
- back restoration and abandoned task sheet;
- fallback shown because connected truth was unavailable.

Do not record search text, prompts, personal customer data or private authority
identifiers in product analytics.

## Acceptance

- Direct links, browser Back, edge-swipe where supported and restored Home
  position pass on mobile and desktop.
- Keyboard, screen-reader, Reduced Motion, Reduced Transparency, Forced Colors,
  light and dark states pass focused checks.
- Updates enter the canonical service workflow and remain unresolved until their
  source work changes.
- Direct UI, Search and Ask Studio expose no private paths, hashes, prompts or
  authority metadata and dispatch the same typed commands.
- Existing progressive intake, Wardrobe, Atelier, Orders, Inventory, Models and
  Operations flows remain reachable and preserve domain truth.
- Every service and record answers subject, state, next action and action result
  using the shared interaction grammar.
- Wardrobe-to-Atelier, Atelier-to-Shop, Order-to-Inventory and
  Update-to-resolution journeys maintain record identity and resumable state.
- No primary workflow screen presents more than one competing primary action.
- Every consequential mutation shows authoritative preview/diff, confirmation
  and receipt; AI explanatory text cannot replace them.
- Refresh, Back and recoverable failure preserve accepted truth and do not
  duplicate a command or generation.
- Provider, prompt, hash, storage and database internals stay outside the
  primary operator path while remaining available to authorized inspection.

## Consequences

Studio becomes easier to learn because the same operating grammar follows Lulu
from ADR 0044's Home through every service, record and receipt. Home remains the
status summary and complete map, while each destination becomes equally simple.

The tradeoff is greater dependence on reliable Back behavior, a trustworthy
shared projection and consistent receipts. Those are explicit release gates,
not reasons to retain multiple competing workflow grammars.

## Rejected alternatives

- Simplify only Home while allowing every service to keep a different workflow
  grammar.
- Replace domain workflows with one generic CRUD form.
- Put engine/audit fields in the primary path for implementation convenience.
- Build separate workflows for direct UI, Search and Ask Studio.
- Treat successful navigation or optimistic UI as a durable receipt.
