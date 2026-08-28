# ADR 0046: Provider-neutral idempotent Virtual Atelier operations

- Status: Accepted; fail-closed code and routes deployed, production migrations applied, operational provider-routing cutover pending
- Date: 2026-08-22
- Owner: Virtual Atelier Engine
- Scope: canonical generation/edit operations, provider adapters, execution identity, lifecycle, QA and Studio projection; existing identity, body, garment, room and view authorities remain unchanged

## Context

The Virtual Atelier already has a strong production contract. Real Lulu
identity is primary, the approved body canon controls geometry, garment sources
control only visible garment truth, the light atelier is locked, accepted layers
are immutable and 05/06/07 have fixed semantics and sibling lineage.

Reproducibility is weaker at execution time. Semantic intent is recorded beside
provider-oriented prompts, numbered reference positions, a fixed reference
budget and manually supplied operation IDs. Studio's current generation
fingerprint includes the model. A model or provider change therefore looks like
a different operation even when garment, authorities, view and intended change
are identical.

Exact prompts and reference hashes are necessary but not sufficient: stochastic
providers can still distort identity, reinterpret a garment or invent an
unknown construction detail. Conversely, byte-identical imagery across different
models is not a realistic contract.

The required guarantee is **materially equivalent accepted truth** independent
of the conformant provider, plus operational idempotency that prevents duplicate
generation, duplicate cost and accidental replacement of locked work.

This ADR extends ADR 0040. The production authority order remains:

1. `docs/virtual-atelier/OPERATING-CONTRACT.md`;
2. `docs/virtual-atelier/ATELIER-CANON.md`;
3. `docs/virtual-atelier/state/current.json`;
4. the active garment brief;
5. `docs/virtual-atelier/assets/current.json`;
6. `docs/virtual-atelier/RUNBOOK.md`.

## Decision

Separate semantic operation identity from provider execution identity.

Final-scene geometry uses explicit, versioned profiles rather than a global
dimension tolerance. The provider subject remains exact 1024x1536. The
1024x1280 native-room profile binds a central `x=0,y=128,w=1024,h=1280`
one-to-one copy plus a 16-pixel inner transparent guard. Visible alpha outside
the guard fails; neither room pixels nor retained subject pixels are resampled,
invented or silently cropped. The complete profile is part of semantic identity
and the compositor/profile revisions are part of execution identity.

Implementation note (2026-08-26):
`scripts/virtual-atelier/operation-identity.mjs` provides canonical semantic
identity, execution identity, artifact/evaluation hashes, capability preflight
and append-only ledger projection. The Studio implementation and five
authenticated route handlers were introduced at exact commit `a6ef79b` and
remain present in current `main`; the same
durable four-command contract covers independent 01–04, subject and 05–07
operations, including private ordered QA and review-media authorization.
`scripts/virtual-atelier/verify-portable-bundle.mjs` verifies the minimal
private authority and active-garment packet. Production migrations `0015` and
`0016` are applied. Operational cutover remains pending because the deployed
route runtime is `ENGINE_DISABLED`, the canonical qualification-bundle resolver
returns `null`, and the new native-room profile is not yet covered by a closed
qualification receipt. The exact approved 1024x1280 room now passes the
versioned geometry policy; this is not an enabled paid-cutover claim.

Studio and the orchestrator create one immutable, provider-neutral
`AtelierOperation`. A provider adapter compiles that operation into a concrete
execution plan only after capability preflight. All providers face the same
authority, lineage, output and evaluation gates.

An accepted result is locked against the semantic operation. Repeating that
operation returns the locked artifact without invoking any provider. Switching
providers creates a different execution attempt under the same semantic
operation, not a different product intent.

## Canonical operation

The versioned `AtelierOperation` contains:

```text
contractVersion
workflowRevision
garmentId
viewRole
operationType
authorityStack[]
  role
  assetId
  sha256
  provenanceClass
  required
  permittedScope
  dominance
  privacyClass
parentLocks[]
  assetId
  sha256
  lockedLayer
changeSet[]
  mutableLayer
  region
  intendedDelta
immutableSet[]
  layer
  assetId
  sha256
garmentFacts[]
unknownFacts[]
prohibitedInferences[]
sceneSpec
cameraSpec
poseSpec
stylingSpec
renderQualityContract
outputContract
failureGates[]
correctionOf?
correctionBudget
```

Named semantic roles replace `Image 1`, `Image 2` and provider slot numbers.
Canonical serialization fixes schema version, key order, normalization and the
ordering policy for each collection. The engine derives `operationId`; an
operator or model does not author it.

The operation cannot reach preflight until every required authority resolves to
an asset ID and exact hash. `unknownFacts` and `prohibitedInferences` are first-
class constraints, not prose buried in a prompt.

### Independent garment-view roots

Views 01–04 are first-class semantic operations, not preparation performed by
a different generator:

```text
GARMENT_01_FRONT
GARMENT_02_BACK
GARMENT_03_MANNEQUIN
GARMENT_04_DETAIL
```

Each resolves the same server-owned direct-garment evidence class and has no
stage parent. Their semantic hashes differ by declared view role, output
contract and view-specific truth boundary, not by garment-number runtime code.
No candidate from one may be an authority or provider parent for another.
Subject synthesis requires immutable same-garment front, back, mannequin and
detail locks; an inferred rear lock remains inferred.

## Three hashes

### Semantic operation hash

```text
semanticOperationHash = SHA-256(
  canonical AtelierOperation
  + resolved authority and parent hashes
  + workflow revision
)
```

It excludes provider, model, prompt syntax, reference slots, seed, sampler and
transport details. It is the durable idempotency and accepted-result key.

### Execution hash

```text
executionHash = SHA-256(
  semanticOperationHash
  + adapter ID and version
  + provider, model and model revision
  + compiled prompt hash
  + reference binding/packing hash
  + preprocessing version
  + seed, sampler and parameters
  + provider policy revision
)
```

It identifies one replayable provider attempt. A provider with no deterministic
seed records that limitation. Exactly-once remote invocation is claimed only
when the provider accepts an idempotency key or exposes a durable job ID and
status lookup. Otherwise the engine provides a single local claim and durable
result reuse, not a false promise of byte replay or safe automatic reinvocation.

Every execution also persists a private reproduction record containing the
verbatim compiled prompt, exact ordered reference bindings with role, private
path or opaque storage locator and SHA-256, exclusions, adapter/provider/tool
and mode, model revision, parameters, source and output locations, dimensions,
byte counts, hashes, provider request/job IDs, technical and semantic reviews
and the exact user decision. Hashes index and verify this record; they do not
replace it. None of these private fields enter browser or public projections.

### Artifact and evaluation hashes

`artifactHash` identifies exact normalized output bytes.
`evaluationHash` identifies artifact hash plus rubric, evaluator and threshold
versions. A changed rubric can re-evaluate an artifact without pretending new
bytes were generated.

## Idempotency invariants

- A locked semantic hash returns its locked artifact immediately.
- A semantic operation has at most one active claim.
- An execution hash has at most one active local invocation claim.
- Exactly-once remote invocation requires provider idempotency or a durable
  provider job that can be reconciled after process failure.
- Concurrent equivalent requests join the existing claim or read its terminal
  result.
- Retrying an indeterminate response reuses execution ID and hash only after
  provider reconciliation proves whether the remote job exists.
- If the provider supports neither idempotency nor job lookup, an indeterminate
  remote response moves to `INDETERMINATE_PROVIDER_RESULT`; it is not
  automatically invoked again.
- A stable provider `moderation_blocked` response is determinate, not
  indeterminate. It atomically records a hash-bound no-output failure manifest,
  terminal `FAILED` execution and coarse private stage/category evidence. It
  creates no artifact, consumes no semantic correction and is never
  automatically invoked again.
- Changing provider or model alone does not change semantic identity.
- Changing an authority byte, parent lock, workflow revision, view, intended
  change or immutable set does.
- Rejected output is retained as evidence but cannot be a parent or authority.
- A lock is immutable; replacement requires a new explicitly approved semantic
  operation and lineage event.

## Provider adapters

Each adapter implements:

```text
capabilities()
compile(AtelierOperation) -> ExecutionPlan
invoke(ExecutionPlan) -> ProviderResult
normalize(ProviderResult) -> CandidateArtifact
```

Capabilities declare:

- generate, edit, mask and local-correction support;
- maximum references and bytes;
- identity/body reference behavior;
- seed and determinism behavior;
- supported dimensions, ratios, formats and colour spaces;
- negative-constraint support;
- content retention and privacy guarantees;
- timeout, cancellation, idempotency-key, remote job lookup and reconciliation
  behavior.

The execution plan records the exact binding from semantic authority role to
provider input. A deterministic reference packer may compose approved boards
when the contract permits it, but it may not silently omit, merge or weaken a
mandatory authority.

If a provider cannot carry the required authority stack, privacy class,
dimensions or local-correction isolation, preflight returns
`BLOCKED_CAPABILITY` before invocation. Provider selection is server policy and
never changes authority precedence.

Built-in ImageGen and the current Gateway/Flux path become adapters. Neither is
the semantic workflow.

## Lifecycle

```text
DRAFT
-> RESOLVED
-> PREFLIGHTED
-> CLAIMED
-> INVOKED
-> MATERIALIZED
-> TECH_QA
-> SEMANTIC_QA
-> AWAITING_APPROVAL
-> LOCKED
-> PACKETED
-> PUBLISHED
```

Side and terminal states:

- `BLOCKED_MISSING_AUTHORITY`;
- `BLOCKED_CAPABILITY`;
- `FAILED_RETRYABLE`;
- `INDETERMINATE_PROVIDER_RESULT`;
- `REJECTED_TERMINAL`;
- `BLOCKED_USER_DIRECTION`;
- `SUPERSEDED`.

Invariants:

- `RESOLVED` requires every mandatory authority.
- 01–04 are independent parentless roots through the same lifecycle; all four
  exact same-garment locks are required before subject synthesis.
- 06 and 07 independently parent accepted 05 and never each other.
- Only explicit user approval permits `LOCKED`.
- Packet and publication cannot precede lock.
- A preview or unreviewed candidate cannot be published, and candidate bytes
  are not operator-readable before `SEMANTIC_PASS`.
- Accepted layers cannot be regenerated to fix another layer.

## Event ledger and projections

Persist append-only events such as:

```text
OperationDrafted
AuthorityResolved
PreflightPassed | PreflightBlocked
ExecutionClaimed
ProviderInvoked
ProviderResultReconciled
ArtifactMaterialized
TechnicalQaRecorded
SemanticQaRecorded
UserApproved | UserRejected
CorrectionAuthorized
LayerLocked
Packeted
Published
Superseded
```

Each event has an ID, per-operation sequence, semantic and execution hashes,
actor, timestamp, previous-event hash, sanitized outcome and opaque private
evidence references. Compare-and-swap versions and uniqueness constraints
prevent two writers from advancing the same claim.

The private execution record linked by those events retains the governing
Atelier reproduction fields verbatim: compiled prompt; ordered references,
roles and exact private paths or storage locators; exclusions; tool, provider
and mode; source and output locations; dimensions; byte counts; hashes; review
evidence; and exact user decision. Public and browser projections receive only
sanitized status, progress and next action.

`state/current.json` remains the durable human-reviewable production projection
during migration and ultimately becomes reproducible from the ledger. Studio
reads a sanitized operation projection. Private prompts, paths, raw metrics,
provider credentials and canon metadata never enter browser DTOs.

Historical V2/V3 task ledgers remain provenance only. They cannot override the
current V4 authority projection.

## Quality evaluation

Technical QA is deterministic where possible:

- bytes decode and match output geometry;
- aspect, dimensions, orientation, colour space and format are correct;
- public derivatives are metadata-sanitized;
- output is one clean full image, not a board, crop, label or multi-frame sheet;
- unexpected text and watermark checks pass;
- artifact and provenance hashes are recorded;
- a local correction proves acceptable outside-region preservation.

Semantic QA applies a versioned rubric to:

- real Lulu facial identity;
- approved body geometry;
- visible garment construction and silhouette;
- unknown-detail non-invention;
- locked atelier, icon, camera and view grammar;
- pose and styling suitability;
- skin, hair, garment texture, lighting integration and optics;
- anatomy, background and generation artifacts;
- immutable-layer preservation.

Machine evaluation stores measurements, evidence locations, evaluator versions,
thresholds and verdicts. A free-form `PASS` is not independently sufficient.
Final acceptance still requires one independent review and explicit user
approval.

Cross-provider success means both executions satisfy the same versioned semantic
evaluation envelope. It never means byte equality.

## Correction budget

The default budget is one bounded correction and one recheck.

A correction identifies exactly one failed gate, one mutable region or layer,
the full immutable set and the rejected diagnostic artifact. The rejected image
does not become the correction parent. The correction receives a new semantic
hash because its change set and `correctionOf` differ.

Failure after the budget transitions to `BLOCKED_USER_DIRECTION`. The engine
does not silently begin another attempt or expand the correction region.

### Private ordered comparison and disclosure

The engine records one fixed semantic sequence against the exact same review
artifact:

```text
GARMENT -> FACE -> BODY -> ROOM -> FINAL_INTEGRATION
```

A gate excluded by the declared stage is `NOT_APPLICABLE`. When one applicable
gate fails, all later applicable gates are `NOT_EVALUATED`; a later apparent
pass cannot dilute the first failure. The server may derive the single bounded
correction, record it through the same review command under server authority
and generate the distinct correction operation. The correction repeats the
complete ordered sequence. A second failure, an unclassified failure or an
indeterminate provider result stops privately without another paid call.

Materialization and evaluator access do not create operator media access. The
sanitized facade projection contains no bytes or storage locators. An
authenticated app-owned media service may return only the exact
content-addressed review artifact whose current projection is
`SEMANTIC_PASS`, `USER_APPROVED` or `LOCKED`. It verifies operation ownership,
artifact identity and hash, performs private readback, then re-authorizes the
same projection and artifact to close the read-time race. Every earlier,
failed, rejected, superseded or blocked state is unreadable.

G005 remains historical evidence that a manual operator displayed PASS A and
PASS B for an informed whole-frame decision. That manual disclosure is not a
Studio invariant. Studio keeps a failed first attempt and its bounded
correction private and reveals only the artifact that completes closed
semantic QA. Historical approval over a pixel-difference objection did not and
does not waive a closed authority or semantic failure.

## Privacy and provenance

- Real face/body media and private garment evidence use opaque asset IDs.
- Repository state records roles, hashes and lineage, never private bytes or
  local source paths.
- Provider policy declares which privacy classes an adapter may receive.
- Provider URLs, tokens and raw prompts remain server-only.
- Verbatim prompts, ordered private reference bindings and exact private
  source/output locations remain in the private execution record required for
  reproduction; they are never emitted to public logs or operator-safe DTOs.
- Public promotion creates a separately hashed, metadata-stripped derivative
  linked to its locked private artifact.
- Deleting a transient provider result cannot remove accepted private lineage.
- No provider output becomes identity authority merely because it resembles
  Lulu.

## Studio integration

ADR 0045 exposes these typed commands:

```text
DraftOperation
ResolveAuthorities
PreflightOperation
GenerateOperation
ReviewOperation
ApproveOperation
RejectOperation
CorrectOneThing
PacketOperation
PublishOperation
```

Studio pages, Search and Ask Studio all dispatch the same commands. None calls a
provider directly. Studio shows semantic operation, missing evidence, view,
stage, approval and next action; provider names and private canon stay hidden.

The public command shape is the narrower four-moment facade
`prepare -> generate once -> review -> lock/reuse` for every stage from
`GARMENT_01_FRONT` through `SIBLING_07_RECOVERY`; the orchestration commands
above remain internal capabilities. `generate once` may complete the one
server-owned private correction loop, but it is not authority for a browser to
read intermediate bytes. The app-owned review-media boundary opens only for
the exact semantic-pass artifact.

The operator's primary candidate actions are `Keep`, `Fix one thing` and
`Reject`; `Fix one thing` is omitted when the background gate already consumed
the semantic root's correction budget. Accepted bytes are returned immediately
for an already locked semantic hash, providing the fast-render path.

## Provider qualification

A new adapter must pass a small versioned calibration suite before production
use. The suite covers at least:

- dark texture and edge preservation;
- pale fabric and colour fidelity;
- fitted body geometry and drape;
- loose or layered construction;
- identity and hairstyle stability;
- local correction with immutable surroundings.

The G004 founding target is a closed pixel-bound case, not an anchor-name
attestation. Because its canonical private originals are unavailable, the
separate revision `g004-positive-target-shop-derivatives-2026-08-26.1`
deliberately locks the three public 1120x1400 Shop derivatives as
evaluator-only positive targets. Applicable operations must verify exact
container and decoded-pixel hashes before paid dispatch and again at semantic
QA. The engine independently re-verifies resolver output, gives the evaluator
only one stage-selected frame and checks that frame again after evaluation.
Those bytes may not become provider references, parents, direct truth or
cross-garment transfer authority; identifiers, hashes and exact decoded pixels
are denied again before provider transport. The separate full-frame visual gate
is revision `g004-provider-visual-denial-2026-08-26.1`, manifest SHA-256
`360cbf8ab42d7ca344c4296d87d28f112f809ce6952069ab664731044c0ad1d3`.
Its normalized RGB NCC/MAE policy also denies calibrated duplicates after lossy
codec, colour, mirror, tiny alignment and small geometric changes before intent
or dispatch. V1 does not claim arbitrary-subimage, large-warp or untrusted-
mosaic detection, so raw constituents are checked before app-owned composition.
This derivative-only denial revision never impersonates or recovers the missing
original asset IDs or bytes.

Qualification is performed once per material provider/model/adapter/calibration revision,
not for every garment. Failure disables the adapter for the unsupported
capability rather than weakening an operation.

Production composition does not accept evaluator functions or qualification
claims from its caller. A server-owned resolver must return the exact technical
and semantic implementations plus safe descriptors bound to one canonical
six-case PASS receipt and independent-review receipt. Until that audited bundle
exists, runtime construction fails `QUALIFICATION_NOT_PASSED` before any port or
provider is invoked.

## Migration

1. Define canonical schemas, serializer, hashes and pure validator fixtures.
2. Inventory accepted V4 state, briefs, asset manifest, packets and private
   operation records.
3. Backfill semantic operations only for accepted and locked artifacts; unknown
   legacy execution fields remain unknown.
4. Prove that current accepted asset and lineage hashes remain unchanged.
5. Build ledger projection and diff it against current state.
6. Qualify the exact OpenAI-only GPT Image 2 Gateway adapter without
   regenerating accepted work or enabling provider fallback.
7. Production migrations `0015` and `0016` are applied. Compose and enable the
   same durable facade for independent 01–04, subject and 05–07 stages only as
   one verified runtime atom.
8. Shadow-write events and existing state against the fixed calibration suite;
   do not use an unreviewed next garment as the migration experiment.
9. Cut Studio reads, commands and authenticated review media to the event
   projection.
10. Remove model-coupled semantic fingerprinting and direct provider paths only
    after parity, crash recovery, disclosure-boundary and rollback tests pass.

## Rollback

Disable new claims for the affected adapter or command family and return Studio
to the last verified projection. Keep the append-only events, execution records,
private artifacts and accepted locks; rollback never deletes provenance or
regenerates accepted imagery. During dual-write migration,
`state/current.json` remains the human-reviewable recovery authority until
ledger replay and parity are proven. An adapter rollback changes routing only,
not semantic hashes, approvals or locked bytes.

## Acceptance

- Identical concurrent semantic requests create one active local claim.
- A provider with idempotency or durable job lookup performs at most one
  reconciled remote invocation per execution hash.
- Two adapters receive the same semantic hash and distinct execution hashes.
- Changing provider/model alone does not change semantic identity.
- Changing authority bytes or workflow revision does.
- An incapable adapter blocks before invocation and drops no authority.
- Crash or timeout after invocation reconciles by provider idempotency key or
  durable job ID without duplicate cost or output; a provider lacking both
  enters `INDETERMINATE_PROVIDER_RESULT` and is not automatically retried.
- The private execution record contains the verbatim prompt and complete ordered
  reference/input/output/review/decision evidence required by the governing
  Atelier reproduction contract.
- Ledger replay reconstructs the exact approved current projection.
- Existing accepted artifacts and lineage survive migration byte-for-byte.
- Independent 01–04 operations use the same facade, ledger, QA, decision and
  lock lifecycle; none parents another, and subject synthesis requires all four
  exact same-garment locks.
- 05/06/07 lineage violations and rejected-parent attempts are rejected.
- Correction budget and immutable sets are enforced.
- Every paid attempt binds a server-owned, content-hashed, stage-compatible
  provider-safety receipt. Garment-only stages attest no real-person output;
  subject/final stages attest verified-adult, authorized, consented, fully
  clothed non-sexual retail-fashion use. A missing or forged receipt spends
  zero dollars.
- A moderation-blocked output is terminally reusable with no candidate,
  parent, correction authorization or second dispatch; raw error bodies and
  private media never enter the public projection.
- Semantic gates run in exact garment/face/body/room/final order, later
  applicable gates are not evaluated after a failure, and a correction repeats
  the complete chain under a distinct semantic identity.
- Candidate media is unreadable before semantic pass and remains bound to the
  authenticated operation and exact content-addressed artifact during
  readback.
- No private path, media, prompt or identity metric enters a public projection.
- UI, Search and Ask Studio derive the same semantic operation for the same
  normalized intent.
- Two qualified adapters can produce different pixels that independently pass
  the same semantic rubric and one bounded human review.

## Consequences

JUW can change or add generation providers without rewriting production truth,
Studio workflow or approval semantics. Duplicate requests become cheap, locked
results render immediately and every attempt has exact provenance.

The cost is a canonical serializer, adapter contract, event ledger and stronger
evaluation tooling. Human approval remains necessary because semantic fashion
and identity fidelity cannot be reduced to byte hashes.

## Rejected alternatives

- Use exact prompt text or provider model as operation identity.
- Promise byte-identical output across stochastic providers.
- Maintain one universal provider prompt.
- Allow an adapter to silently drop references to fit its budget.
- Accept a declarative `PASS` without versioned evidence.
- Regenerate a locked layer to fix another layer.
- Let Search, AI or the browser call an image provider directly.
