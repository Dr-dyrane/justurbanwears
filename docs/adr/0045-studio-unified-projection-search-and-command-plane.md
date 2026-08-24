# ADR 0045: Studio unified projection, search and command plane

- Status: Proposed
- Date: 2026-08-22
- Owner: Studio Platform
- Scope: operator-safe Studio reads, universal search, typed commands and agent tooling; Virtual Atelier generation semantics are defined in ADR 0046

## Context

Studio currently combines two useful but different worlds:

- a browser/local Studio machine used by existing screens and scenarios;
- a connected server authority snapshot used for current pieces, orders, holds,
  models and notifications.

Home already mixes connected counts with local garment recents. Other workspaces
use their own clients and lifecycle services. This is acceptable during staged
delivery, but it cannot support an authoritative Home summary, universal search
or a safe assistant. An assistant connected directly to each screen would
duplicate business logic and eventually bypass version, evidence, role or
publication gates.

The repository already contains the correct command ingredients: schema-checked
lifecycle commands, expected revisions, literal confirmations, idempotency keys,
append-only decisions and operator-safe authority DTOs. This ADR unifies their
entry and read surfaces without replacing the domain services.

## Decision

Create one server-owned Studio application plane with two ports:

1. **Projection port** — composes operator-safe, versioned read models for Home,
   services, search, Updates and record pages.
2. **Command port** — routes schema-valid typed commands to their owning domain
   service and returns an auditable receipt.

Direct UI, universal Search and Ask Studio use these same ports. None may call a
provider, write a database table or mutate a domain aggregate directly.

## Domain ownership

The application plane routes; it does not absorb domain behavior.

| Domain | Owns |
| --- | --- |
| Wardrobe | intake, garment facts, revision and private item lifecycle |
| Atelier | semantic operations, generated candidates, decisions and locks |
| Publication | listing projection, public media contract, publish/unpublish/archive |
| Orders | order transitions, payment-review state, fulfilment and returns |
| Inventory | availability, location, holds, release and stocktake |
| Models | versioned identity/body/styling authority and consent |
| Operations | derived updates, incidents, recovery destinations and system readiness |

The command registry identifies each command's owner, input schema, required
role, expected version/revision, idempotency policy, confirmation policy,
preview builder, execute function and receipt serializer.

## Operator-safe projection

Define a versioned `StudioProjection` containing:

```text
projectionVersion
generatedAt
sourceRevisions
operator
summary
continueAction
services[]
recentRecords[]
updates[]
searchDocuments[] or searchCursor
capabilities
degradedSources[]
```

Every field records enough provenance to determine freshness without exposing
private media, hashes, paths, prompts, provider configuration or internal reason
codes. Projection records use canonical IDs and routes.

Projection construction follows these rules:

- Server authority wins for connected business truth.
- Local scenario data is an explicitly labelled, isolated projection source.
- Device-local drafts may be shown in a distinct local section but are never
  silently added to server counts.
- Unavailable sources produce a degraded marker and truthful fallback; their
  last value is not presented as current without an `as of` time.
- Identity authorities are versioned data. No projection adapter may hard-code
  `LULU_V2`, `LULU_V3` or a public model asset path.
- Private and public media remain separate projections.

## Search

Universal search queries an operator-safe index produced from projection data.
The initial searchable kinds are:

- service;
- garment or piece;
- SKU;
- order;
- customer display reference where authorized;
- model profile;
- Atelier operation;
- media record;
- update or operational task.

Results contain only a canonical ID, kind, primary label, compact secondary
label, lifecycle state, route, permitted actions and match explanation.

Ranking is deterministic:

1. exact SKU, order ID or canonical identifier;
2. exact normalized title or name;
3. prefix and known alias;
4. token match;
5. recent operator activity.

Search supports keyboard navigation, recent queries stored on device, empty and
offline states, bounded pagination and cancellation. Server logs retain query
performance and result category, not raw search text containing personal data.

Search may surface action suggestions, but selecting a write action opens its
command preview. Search never executes a mutation directly.

## Ask Studio

Ask Studio is a tool-mediated operator assistant, not an unrestricted chatbot.
Its control flow is:

```text
operator text
-> classify intent
-> resolve canonical record IDs
-> construct typed command or read query
-> schema and permission validation
-> read answer OR command preview and field-level diff
-> explicit confirmation when required
-> execute through command port
-> durable receipt and next destination
```

The model sees the minimum operator-safe context needed for the current action.
It does not receive the full catalogue, private source archives, identity
metrics, provider secrets, raw prompts or unrelated task history.

Read and navigation intents may complete immediately. Drafting and reversible
low-risk local preferences may use lightweight confirmation. Publication,
finance, stock, identity authority, order transitions, deletion and other
consequential commands require the owning domain's literal confirmation and
expected revision.

When intent is ambiguous, Ask Studio asks one bounded question. It never guesses
a SKU, price, stock quantity, garment construction fact, identity authority or
publication target.

## Command envelope

All mutations use a common outer envelope around the existing domain command:

```text
commandId
commandType
targetKind
targetId
payload
expectedVersion or expectedRevision
idempotencyKey
confirmation
requestedBy
requestedAt
source: UI | SEARCH | AGENT | AUTOMATION
```

The server resolves `requestedBy`; browser or model-supplied identity is not
trusted. The idempotency key is unique for the normalized command intent and
operator action. A repeated envelope returns the original receipt.

Every receipt contains:

```text
receiptId
commandId
status
targetId
beforeRevision
afterRevision
consequence
occurredAt
nextRoute
reversalCommand?
```

Receipts disclose operator-safe consequences, not internal stack traces or
private evidence references.

## Preview and confirmation

Every consequential command implements a pure preview that states:

- the exact record affected;
- changed fields and before/after values;
- stock, order, publication or visibility consequence;
- evidence or authority gate that will be consumed;
- whether reversal exists;
- the literal confirmation required.

The preview is produced by the domain service from current truth. An AI-written
summary may explain it but cannot replace it.

## Updates and event flow

Domain events remain authoritative. Operations derives updates from business
state as established by ADR 0043. Successful commands refresh or invalidate only
their affected projection segments. Clients do not optimistically erase an
update before the server observes the resulting business state.

Long-running Atelier operations expose stage, progress, next action and a
poll/subscription cursor through the projection. Provider details and private
canon metadata remain server-only.

## Offline, recovery and scenarios

- Read-only cached projection may render with a clear `Last updated` time.
- Connected mutations are unavailable offline unless a specific domain defines
  a durable outbox and conflict contract.
- Existing device-local intake can remain a labelled private draft path during
  migration; it does not claim a server save.
- Simulator state is isolated, read-only outside its declared commands and
  visually labelled. It never shares idempotency keys with production.
- Retry after an indeterminate response reuses the same command ID and
  idempotency key, then retrieves the existing receipt.

## Authorization and privacy

- Authentication and Studio role are resolved on the server for every query
  and command.
- Projection fields and search kinds are capability filtered.
- Finance, publication, model authority and destructive actions retain their
  current least-privilege requirements.
- AI tool availability is derived from the same capability map as visible UI.
- No command can become legal merely because Ask Studio proposed it.
- Logs redact raw prompts, search text, emails, addresses, private media paths,
  authority hashes and provider credentials.

## Performance

- Home reads one compact projection rather than joining domain state in the
  browser.
- Projection segments have independent ETags or revision tokens.
- Search returns a first bounded page and cancels superseded queries.
- Images use existing card-sized public or authorized private derivatives.
- Ask Studio streams explanatory text separately from authoritative command
  preview data; a slow model never delays direct UI commands.
- Projection refresh after a command is targeted rather than a full Studio
  reload.

## Failure behavior

Stable operator-safe outcomes include:

- `STALE_REVISION` — refresh preview;
- `DUPLICATE_COMMAND` — return original receipt;
- `NOT_AUTHORIZED` — no mutation;
- `MISSING_AUTHORITY` — identify one required evidence action;
- `CAPABILITY_UNAVAILABLE` — direct to supported UI or wait state;
- `SOURCE_UNAVAILABLE` — label degraded projection;
- `VALIDATION_FAILED` — preserve operator input and focus the field;
- `INDETERMINATE` — poll by command ID, never issue a new mutation.

## Migration

1. Inventory existing clients and map each read and mutation to a domain owner.
2. Define projection and command schemas with pure fixtures.
3. Build the server projection beside the existing authority snapshot.
4. Compare counts, routes, lifecycle labels and capability filtering in a
   read-only shadow.
5. Move ADR 0044's Home and service registry to the new projection.
6. Apply ADR 0047's progressive stack-page grammar, beginning with the
   Wardrobe-to-Atelier pilot.
7. Add universal Search in read-only mode.
8. Wrap existing lifecycle, publication, inventory and order commands in the
   command envelope without changing domain logic.
9. Add Ask Studio for read and navigation, then enable command families one at
   a time after focused E2E acceptance.
10. Move Atelier operations to ADR 0046's command/event projection.
11. Retire browser joins and hard-coded model compatibility values after parity
    and rollback checks pass.

## Rollback

Each migrated surface retains its previous read client until projection parity
and affected behavior pass in production. A rollback routes that surface back to
the previous client and disables the corresponding Search or Ask Studio command
family. It does not delete command receipts, domain events or server records.

If projection construction fails, Studio renders the last authorized snapshot
with its `as of` time or the existing truthful unavailable state. It never falls
back to an unlabelled mixture of local and connected records. Commands already
accepted by a domain remain authoritative and are recovered by receipt ID.

## Acceptance

- Home, every service row, Updates and search read the same versioned projection.
- Connected and local/scenario truth are never silently combined.
- Exact identifier searches return the correct canonical route; unauthorized
  records and fields never appear.
- UI, Search and Ask Studio produce the same command schema and preview for the
  same intent.
- Duplicate commands return one receipt and do not repeat the domain mutation.
- Stale revisions fail before mutation and refresh to a new preview.
- Publication, stock, order, finance and identity commands cannot bypass
  literal confirmation or role checks.
- An indeterminate network response can recover by command ID without a second
  write.
- Current V4 identity authority reaches Studio through versioned server data;
  no V2/V3 constant or public asset path decides current identity.
- Private paths, hashes, prompts, personal data and provider configuration are
  absent from browser DTOs, search documents, analytics and AI context.
- Direct UI remains fully usable when Ask Studio is slow or unavailable.
- Focused E2E checks cover search, command preview, confirmation, success,
  stale revision, unauthorized, offline and back/refresh recovery.

## Consequences

Studio gains one truthful application model and one safe mutation path. The
Klarna-style Home, search and assistant become alternate entrances to the same
system rather than parallel implementations.

The cost is schema and projection work plus careful migration of existing
clients. Domain logic remains where it is, limiting the blast radius and making
the change reversible by surface.

## Rejected alternatives

- Let Home continue joining local and connected state in the browser.
- Give Search direct access to raw database tables or private source archives.
- Let Ask Studio call provider APIs or database mutations directly.
- Maintain separate CRUD implementations for UI and AI.
- Treat optimistic UI as proof that a connected write succeeded.
- Encode the current Lulu version or public authority path in client state.
