# ADR 0040: Studio garment and model engine

- Status: Accepted for the first vertical slice
- Date: 2026-08-12
- Owner: Studio
- Scope: private intake through a saved Wardrobe draft; Shop publishing remains separate

## Decision

Build a durable, operator-led engine behind one progressive Studio sheet.
Each action advances one state, persists one record and returns one clear result.
AI proposes; Lulu confirms. AI never decides price, stock, availability or
publication.

The first releasable slice is:

1. Photograph, upload or describe one garment.
2. Extract a small editable fact set.
3. Generate one product-only front.
4. Keep, edit or retry once.
5. Save the approved garment as a private Wardrobe draft with quantity one.
6. Offer mannequin and model try-on as optional child actions.

The garment save never waits for mannequin or model work.

## Experience contract

The sheet stays mounted for the whole task and asks one thing at a time:

`Start -> Source -> Build -> Confirm -> Wear -> In wardrobe`

- Start offers Camera, Photos and Describe as icon rows.
- Source shows one large image or one large description field.
- Build shows only `Reading`, `Garment`, `Views`, `Ready`.
- Confirm shows the image and five compact facts: category, colour, size,
  condition and price.
- Decisions use `Keep`, `Edit`, `Try again`; no dropdowns.
- Wear offers Mannequin, an existing approved model, or Add model.
- Receipt shows the accepted image as the primary proof, offers an expanded
  inspection view, states `Draft · Private · not for sale`, and keeps
  `Open garment` as the next action. Draft is a lifecycle label, never the
  visual result.

Optional unknowns save as Draft. The interface never invents confidence or
blocks a truthful garment because styling work is incomplete.

### Material and feedback

- Sheet material: 60% warm fill, 40% lucency, 4px backdrop blur.
- Persistent lenses: 2px backdrop blur.
- Dark mode has independent fills and text contrast.
- Reduced Transparency becomes opaque; Forced Colors gains boundaries.
- Press, upload, working, success, recoverable failure, offline and rejected
  states are always visible and announced through polite live regions.
- Motion is 150–200ms and removed when reduced motion is requested.

## Engine boundary

The browser sends intent and asset IDs. It never sends provider names, Blob
credentials, private paths, canonical prompts or price/stock mutations.

Server modules own:

- normalization and schemas;
- operator authorization;
- generation fingerprints and budgets;
- AI Gateway routing;
- private asset storage;
- decisions and immutable lineage;
- Wardrobe commit.

Public Shop projection is a later explicit command. A generation cannot publish
itself.

## Durable records

Neon stores structured state; private Vercel Blob stores source and generated
bytes.

| Record | Purpose |
| --- | --- |
| `studio_intakes` | Operator, kind, source mode, normalized facts, state, version and idempotency key |
| `studio_assets` | Intake, role, private Blob location, MIME, size, dimensions, SHA-256 and privacy class |
| `studio_generations` | ID allocated before invocation, operation, model, prompt version/hash, source IDs/hashes, fingerprint, result, usage/cost and error |
| `studio_decisions` | Append-only keep, edit, reject or retry decision with actor and time |
| `studio_wardrobe_items` | Private garment truth and draft/ready/archive state |
| `studio_model_profiles` | Approved model identity/styling authority; no source path is exposed to the browser |

Optimistic concurrency uses an intake version. Retried requests use an
idempotency key. A generation fingerprint is unique for:

`source hashes + normalized facts + operation + prompt version + model + parameters`

This makes duplicate clicks and network retries cheap without a second cache.

## State machines

### Intake

`DRAFT -> ANALYZING -> REVIEW -> GENERATING -> DECISION -> COMMITTED`

`ANALYZING` or `GENERATING` may move to `FAILED`; retry returns to the previous
truthful state. Archive is terminal.

### Generation

`PENDING -> RUNNING -> COMPLETE -> APPROVED | REJECTED`

The generation row exists before a provider call. Output bytes are copied to
private Blob before `COMPLETE`. A failed copy is a failed generation, never a
successful result with an expiring provider URL.

One first candidate and one bounded correction are allowed per operator action.
Further attempts require a new explicit action.

## AI lanes

Models are server policy, discovered from AI Gateway and replaceable without UI
changes.

| Lane | Job | Default policy |
| --- | --- | --- |
| Intake | Normalize a description or visible facts into strict JSON | `zai/glm-4.6v-flash`, with thinking disabled, JSON-only output and local Zod validation |
| Vision check | Compare source and candidate for visible garment truth | Prefer verified free vision; currently `zai/glm-4.6v-flash` |
| Prompt critic | Remove unsupported claims and compress the final prompt | Prefer a second free model; currently `poolside/laguna-s-2.1-free` |
| Image | Product front, mannequin or approved-model try-on | Prefer the lowest verified actual-cost image endpoint that passes truth gates; currently BFL Flux 2 through Gateway |

The live Gateway catalogue is checked at release and cached for one hour.
Catalogue price fields are advisory: actual Gateway generation metadata is the
cost authority and is persisted for every call. Unknown or unavailable model
identifiers fail closed. `voidc` is not a verified Gateway identifier, so it is
not embedded in runtime policy.

The first source-guided BFL edit was exercised through the live Gateway on
2026-08-12. `bfl/flux-2-klein-4b` accepted the AI SDK image-plus-text prompt and
returned one JPEG for $0.016. The Gateway model catalogue currently describes
that endpoint as text-input only, so the executable release check—not the
catalogue label—is the capability authority.

A later production-linked recheck on 2026-08-12 corrected the AI SDK 7 vision
request from the retired `image` content shape to a typed `file` part. The free
`zai/glm-4.6v-flash` analysis still ended in an upstream retry failure before
image generation, so the run stopped with $0.00 additional paid spend. AI Build
remains preview-only until a new bounded recheck identifies a healthy vision
route and the authenticated persistence path passes end to end.

Paid image fallbacks are disabled by default. Enabling one requires an explicit
server allowlist and a known per-image ceiling within the environment cap.
Image calls use zero SDK retries. Provider usage and cost are written to the
generation ledger before an over-cap result is rejected.

## Token and image-call budget

- Normalize facts locally before any call.
- Hash and reuse identical sources.
- Use `providerOptions.gateway.caching = "auto"` for stable text prefixes.
- Route provider endpoints with `sort = "cost"` where supported.
- Send only the current action, normalized facts and required source assets.
- Do not resend chat history or the complete catalogue.
- Cap extraction and critique output through strict schemas and short fields.
- Deduplicate every image request by generation fingerprint.
- Make one image call per user action; corrections are explicit.
- Record model, usage and cost against every generation.

## API contract

- `POST /api/studio/intakes` creates an intake.
- `GET /api/studio/intakes/:id` returns the operator-safe snapshot.
- `POST /api/studio/intakes/:id/assets` stores one source.
- `POST /api/studio/intakes/:id/analyze` proposes facts.
- `POST /api/studio/intakes/:id/generate` creates or reuses one candidate.
- `POST /api/studio/intakes/:id/decision` appends keep/edit/reject/retry.
- `POST /api/studio/intakes/:id/commit` saves a private Wardrobe item.

Uploads are image-only, size-limited and MIME-verified. Responses use no-store.
Errors return a stable code plus one user-safe recovery action.

## Authorization

Every mutation requires a server-resolved operator identity and an allowlisted
Studio role. UI visibility is not authorization.

The engine supports two hosting modes behind one `StudioOperator` port:

- OpenAI/Sites workspace: dispatcher-authenticated user headers plus a server
  allowlist.
- Vercel public app: the production admin session provider selected for Studio.

Until a production Vercel operator session is connected, mutation routes remain
disabled there and the existing device-local intake remains the visible fallback.
A browser-supplied identity header or shared secret is never an acceptable
substitute.

## Portability

Keep the domain, schemas, fingerprints, prompts and state transitions free of
Vercel imports. Adapters provide database, blob, identity and AI calls. This
allows the same engine to run with Neon/Blob/Gateway, a test repository or a
future worker without changing the operator experience.

## Release slices

1. **Garment vertical:** source, facts, product-front candidate, decision,
   Wardrobe draft.
2. **Mannequin child action:** approved garment to anonymous mannequin.
3. **Model authority:** choose an approved profile or create one with consent.
4. **Try-on:** approved garment plus approved model authority, one view.
5. **Catalogue CRUD:** explicit publish/update/archive commands with audit and
   stock transactions.

The first slice is accepted only when one browser action is visible in Neon,
one private source/result is addressable in Blob, duplicate clicks reuse the
same generation, unauthorized requests fail, and a committed garment appears
in Wardrobe after reload.

## Release queue after the first slice

1. Activate the production operator session, Neon migration, private Blob and
   AI Gateway environment; keep the local intake fallback until authenticated
   end-to-end proof passes.
2. Turn the Wear choice into durable mannequin/model child jobs with visible
   queued, running, failed and completed states.
3. Add server update and archive commands; destructive deletion remains a
   separately authorized action with audit history.
4. Mount only the selected Garments or Publishing surface, paginate or
   virtualize long collections, and serve card-sized image derivatives. Target
   fewer than 1,500 initial DOM nodes and under 2 MB initial transfer while
   retaining mobile LCP below 2.5 seconds and CLS below 0.1.
5. Add a working sign-in action and intake telemetry for start, source mode,
   generation duration/cost, failure stage, completion and abandonment.
6. Validate real authenticated INP and the full browser → API → Neon → Blob →
   reload story before calling the engine production-ready.
