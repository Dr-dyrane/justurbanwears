# ADR 0044: Studio Home service registry and stack navigation

- Status: Proposed
- Date: 2026-08-22
- Owner: Studio Experience
- Scope: authenticated Studio shell, Home information architecture and navigation; domain workflows remain governed by their existing contracts

## Context

Studio has grown into a set of capable workspaces: Wardrobe, Atelier media,
Models, Shop publication, Orders, Inventory, Stocktake and Operations. The
current shell exposes several of them through persistent desktop navigation, a
four-destination mobile dock and a route-level floating action. Other
destinations live inside Profile & Settings. This makes Studio feel like a
collection of screens and requires Lulu to remember where work lives.

Home already contains the correct operating signals: one prioritized next
task, available and live counts, ready models and recent pieces. Profile is
already available from the upper-left control. The missing layer is a stable
service registry that makes Home the complete map of Studio.

The current Klarna iPhone presentation is a useful interaction reference: a
profile control at the upper left, a central universal search, an assistant
control at the upper right, compact status and vertically linked services. JUW
adopts that information architecture, not Klarna's branding, commerce model or
visual identity. The public reference is observational and may vary by region
or release; this ADR is the durable JUW contract.

This decision refines the persistent-navigation decisions in ADR 0041 and the
header placement of Updates in ADR 0043. It does not weaken their accessibility,
truthfulness or state-derived update rules.

## Decision

Make `/studio` the authenticated control plane and the sole primary navigation
surface. Every durable Studio workspace remains a real route in a push stack,
but persistent desktop navigation, the mobile tab dock and the route-level
floating action are removed.

The shell has three stable controls:

1. **Profile**, upper left — identity, workspace, appearance, security, help
   and sign-out.
2. **Search anything**, centre — universal operator-safe discovery and action
   entry.
3. **Ask Studio**, upper right — conversational access to the same typed tools
   available to direct UI.

On narrow screens the search control may collapse to an icon plus accessible
name, but its destination and query state remain identical. Profile and Ask
Studio remain at opposite edges. The header is not a tab bar.

## Home hierarchy

Home renders in this order:

1. **Compact summary** — Needs attention, Available, Live and Active orders.
2. **Continue** — exactly one highest-priority resumable action, using the
   existing deterministic priority rules.
3. **Services** — the complete ordered registry of Studio capabilities.
4. **Recent work** — a short resumable list, never a second navigation system.
5. **Arrange Studio Home** — the final control on the page.

Home does not become a dashboard of equal cards. It gives one current action,
four small operating signals and one calm list of destinations.

## Service registry

Services are data, not hard-coded navigation fragments. Each entry has a
stable key, label, description, route, icon, capability requirement, status
projection, unresolved count and default rank.

| Stable key | Label | Responsibility | Canonical destination |
| --- | --- | --- | --- |
| `wardrobe` | Wardrobe | Intake, garment truth, piece dossiers and private drafts | `/studio/wardrobe` |
| `atelier` | Atelier | V4 operations, Wear, views, review and approved media | `/studio/media` |
| `shop` | Shop | Publication readiness, listings and public preview | `/studio/wardrobe?view=publishing` |
| `orders` | Orders | Payment review, fulfilment and returns | `/studio/orders` |
| `inventory` | Inventory | Availability, locations, holds and stocktake | `/studio/operations?view=inventory` |
| `models` | Models | Identity authority, consent, body canon and styling | `/studio/models` |
| `operations` | Operations | Updates, unresolved work, system state and recovery | `/studio/operations` |

### Presentation-tier amendment — 2026-08-22

The seven stable keys above remain the complete capability, search and domain
registry. Home does not need seven equal primary destinations to preserve that
architecture. Its visible service list is the following four-entry operator
map:

| Home destination | Context it owns |
| --- | --- |
| Wardrobe | Garment intake, piece records and Shop publication |
| Atelier | Media creation, review and Models authority |
| Orders | Fulfilment and returns |
| Operations | Attention, Inventory, holds, stocktake and scanning |

Shop, Inventory and Models remain directly addressable, searchable and
permissioned domains. They become contextual stack destinations rather than
competing Home rows. This is a presentation grouping only; it does not merge
their data ownership, authorization or lifecycle contracts.

Home ordering preferences therefore store only the four visible primary keys.
The current device fallback uses preference version 3 and migrates version 2 by
retaining the relative order of those four keys while discarding contextual
keys from the Home presentation.

`Open Shop` is a secondary action within the Shop service, not a competing
Studio destination. Compatibility routes such as `/garments`, `/shoots` and
`/konan` remain routable only where required for old links; they are not service
entries.

Services may be reordered per operator. Required services cannot be deleted or
hidden. New services enter at their default rank until the operator arranges
them. Preferences store stable keys rather than labels or route strings and
sync to the authenticated operator when the server preference store is ready;
device-local storage is an explicit temporary fallback.

## Updates placement

ADR 0043 remains authoritative for deriving updates from business state and for
deterministic unresolved signatures. This ADR supersedes only the requirement
that Updates be a permanent header bell.

Updates appear as:

- the Needs attention summary count;
- counts and status on affected service rows;
- the Operations service destination;
- search and Ask Studio results when relevant.

No update is marked resolved merely because Home, Search or Ask Studio opened
it. Resolution still comes from the source business state.

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

Deep links continue to work without first visiting Home. A deep-linked page
still exposes a clear route back to Home.

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
- Targets are at least 44 by 44 CSS pixels. Keyboard order is Profile, Search,
  Ask Studio, Continue, Services, Recent work, Arrange Home.
- Search, sheets and stack navigation preserve focus on dismiss or back.

## Responsive behavior

The information hierarchy is identical on mobile and desktop. Desktop may give
summary and Continue more horizontal room, but it does not restore a sidebar or
persistent tab strip. Service rows may use a two-column label/status layout on
wide screens while remaining one ordered list.

The mobile viewport must not reserve space for an absent dock. Safe-area
padding belongs to the page and contextual sheets, not an always-present
navigation island.

## Data and truth requirements

Summary, Continue, service counts and search results must come from one
operator-safe server projection. The current mixture of browser-machine data
and connected authority counts is not sufficient for authoritative Home
signals. Until ADR 0045's projection is active, affected values must say
`Local preview`, `Live state unavailable` or their existing truthful fallback;
the interface must not merge incompatible snapshots into an apparently exact
count.

The model service must consume the current versioned identity authority. It may
not hard-code Lulu V2, V3 or a public model path in the shell projection.

## Migration

1. Define the service registry and preference schema without changing routes.
2. Introduce the unified Home projection and compare it with current Home
   counts in a read-only shadow.
3. Mount universal Search over the projection.
4. Mount Ask Studio in read-only/navigation mode.
5. Replace current desktop links and mobile dock with the three-control header
   and Home service list.
6. Enable safe typed AI commands one domain at a time under ADR 0045.
7. Add server-backed service ordering; migrate the current device preference.
8. Remove obsolete route-action and dock code only after deep-link, back and
   contextual-action acceptance passes.

Existing URLs and business workflows remain intact throughout migration.

## Rollback

Keep the previous shell behind the same bounded release flag until the new Home
passes production observation. Rollback restores its desktop links, mobile dock,
header Updates trigger and route action while leaving routes and business data
untouched. A version-2 service-order preference may remain stored but is ignored
by the old shell. No database or garment-state rollback is required.

## Telemetry

Record privacy-safe product events for:

- Home opened and projection freshness;
- Continue destination and completion;
- service opened and service order changed;
- search opened, result category and zero-result outcome;
- Ask Studio intent category, preview, confirmation, cancellation and receipt;
- back restoration and abandoned task sheet;
- fallback shown because connected truth was unavailable.

Do not record search text, prompts, personal customer data or private authority
identifiers in product analytics.

## Acceptance

- Home exposes every current primary Studio capability without a persistent
  nav, mobile dock or navigation FAB.
- Profile, Search and Ask Studio occupy the agreed positions at 320px through
  desktop widths without overlap or horizontal scrolling.
- One deterministic Continue action and four truthful summary values render
  from the unified projection.
- Reordering services persists by stable key and does not hide required
  services.
- Direct links, browser Back, edge-swipe where supported and restored Home
  position pass on mobile and desktop.
- Keyboard, screen-reader, Reduced Motion, Reduced Transparency, Forced Colors,
  light and dark states pass focused checks.
- Updates remain state-derived and unresolved until their source work changes.
- Search and Ask Studio expose no private paths, hashes, prompts or authority
  metadata.
- Existing progressive intake, Wardrobe, Atelier, Orders, Inventory, Models and
  Operations flows remain reachable and behaviorally unchanged.

## Consequences

Studio becomes easier to learn because Home is both the status summary and the
complete map. The removal of persistent navigation gives each task more space
and preserves JUW's single-purpose interaction promise.

The tradeoff is greater dependence on reliable Back behavior, a trustworthy
Home projection and good universal search. Those are explicit release gates,
not reasons to retain two competing navigation systems.

## Rejected alternatives

- Keep the dock and merely restyle it.
- Add the service list while retaining persistent navigation.
- Put every capability inside Profile & Settings.
- Make every summary value a large dashboard card.
- Let operators hide required services.
- Treat Ask Studio as a provider-specific chatbot with direct database access.
