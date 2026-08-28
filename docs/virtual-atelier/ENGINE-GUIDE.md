# Virtual Atelier engine guide

- Scope: server-side generation engine, authority resolution, persistence,
  qualification, review and lock contracts
- Governing property: garment-independent and idempotent
- UI boundary: Studio UI is a sanitized client of the engine projection; it
  never owns provider, prompt, authority, QA or lifecycle truth
- Provider policy: exact `openai/gpt-image-2` through Vercel AI Gateway,
  OpenAI-only
- Final-scene canvas status: the approved 1024x1280 room is supported by the
  versioned guarded native-room profile described below
- Deployment status: engine code, persistence migrations `0015` and `0016`,
  and five authenticated Atelier route handlers were introduced at exact
  commit `a6ef79b`; those two production migrations are applied. This release
  adds concrete production ports and route composition plus migrations
  `0017`-`0020`; they remain unapplied until guarded database qualification and
  release complete
- Operational cutover status: fail-closed. The route runtime returns
  `ENGINE_DISABLED`, the canonical qualification-bundle resolver returns
  `null`, and the native-room profile has no closed qualification receipt
- Updated: 2026-08-27

This guide turns the manual evidence accumulated from Garments 001 through 024
into one reusable **01–07 semantic-view engine contract**. The durable facade
scope includes independent 01–04 garment production, subject synthesis, 05 and
the independent 06/07 siblings. It does not plan or encode the next garment.
This is deployed fail-closed architecture, not an enabled paid-cutover claim.
Concrete server ports and route composition are implemented in this release.
Production dispatch remains blocked until their migrations are qualified and
applied, the private authority/profile preflight passes and the canonical
closed qualification bundle is installed. Applied migrations do not, by
themselves, authorize provider work.
`OPERATING-CONTRACT.md`, `ATELIER-CANON.md`, current state, garment truth,
the exact asset manifest and the Runbook remain the sources of production
truth. The engine compiles and carries that truth without weakening it.

## Governing engine invariant

The runtime is **garment-independent**. G001-G024 are calibration fixtures,
locked-result history and evaluation evidence only. They may populate a trusted
truth bundle or a qualification test, but they may never produce a
garment-number `if`, `switch`, route, adapter or retry branch. New garments are
data consumed by the same declaration compiler, stage recipes, authority
resolver, lifecycle and quality gates.

Runtime branching is permitted only on versioned semantic facts such as stage,
view, output mode, evidence class, capability result and durable lifecycle
state. A garment-specific failure becomes a generic invariant plus a regression
fixture; it does not become garment-specific production code.

This is an engine contract, not a UI contract. Components and routes render the
sanitized projection and dispatch commands. They do not choose providers,
compile prompts, carry private authority bytes or advance lifecycle state.

## Public four-command workflow

The public server workflow has exactly four moments:

```text
prepare -> generate once -> review -> lock/reuse
```

The authenticated operator identity comes from server context, not an
untrusted request-body field.

| Command | Caller supplies | Server owns | Idempotent result |
| --- | --- | --- | --- |
| `prepare` | one strict typed declaration | file verification, current state, manifest, garment truth, eligible lock projection, compiler and both receipts | equivalent truth produces the same operation and reuses its projection |
| `generate` | the `operationId` returned by `prepare` | adapter, provider/model, canonical prompt, ordered references and packs, retention consent, hash-bound stage-compatible safety context, attempt, execution hash, claim/fence, paid call, artifacts, accounting and QA | concurrent calls join; a materialized, moderation-terminal or locked operation is returned without another paid call |
| `review` | `operationId` plus `Keep`, `Fix one thing`, or `Reject` | candidate and QA evidence, event version, correction lineage and remaining correction budget | the same decision reuses the recorded transition; a conflicting second decision is rejected |
| `lockOrReuse` | `operationId` | approved artifact, exact room bytes, deterministic composite when required, immutable lock and parent descriptor | an existing lock is returned immediately |

`Fix one thing` contains one bounded reason and one bounded target. The server
may authorize at most one correction operation for a root semantic operation.
The caller never supplies `correctionOf`, a correction ordinal, a parent review
state or another attempt number.

The facade is `createStudioAtelierEngineFacade` in
`lib/server/studio-atelier-engine-facade.ts`. Its ports are server-owned:

- `resolveFileVerification`
- `resolveTrustedTruth`
- `prepareCompiledOperation`
- `readProjection`
- `materializeOnce`
- `advanceQualityOnce`
- `recordReviewOnce`
- `lockApprovedOnce`

`createDurableStudioAtelierEngine` in
`lib/server/studio-atelier-durable-engine.ts` binds that narrow facade to the
durable operation repository, QA transitions, correction authorization and the
trusted lock service. `createStudioAtelierExecutionService` performs the
fenced paid materialization. `createStudioAtelierLockService` reloads approval,
subject and room authority server-side before compositing or locking.

`createStudioAtelierProductionRuntime` is the server-only composition and
readiness boundary. Its asynchronous construction derives G004 readiness by
running the internally owned exact resolver; callers can neither declare that
readiness nor replace the resolver. Production callers provide only five typed
infrastructure ports: file verification, trusted truth, execution context,
correction preparation and locked-room resolution. They cannot supply either
evaluator function, evaluator descriptor or a qualification PASS declaration.
The server-owned qualification resolver must return the exact v2 qualification
receipt: six-case evidence, independent-review receipt, receipt-bound technical
and semantic evaluators, and the exact transparent-subject profile, native-room
canvas policy, compositor revision and room-profile/stage evidence matrix. No
such all-case and all-profile PASS bundle is checked in yet, so production
construction intentionally stops with `QUALIFICATION_NOT_PASSED` before any
port or provider call. It also requires verified ledger, private-store,
OpenAI-only policy and private authority evidence. An explicitly blocked room
leaves 01–04 and subject scope representable but stops 05–07 before execution
intent, claim or provider invocation. It does not fabricate any missing
resolver or evaluator.

A route must not accept an implementation or result for any of those ports.
Provider, model, prompt, hashes, attempt, consent or retention acknowledgement,
private locators, QA evidence and authority bytes are never caller-authored
command fields and never enter a public/browser projection.

## Private comparison, correction and media boundary

The facade result is status-only. Returning no bytes from that DTO is
necessary but insufficient: private candidate media must remain unreadable by
the operator and browser until closed semantic QA passes.

`createStudioAtelierBackgroundGate` is the server-only driver for the bounded
agent-mode loop. `createStudioAtelierAgentEngine` is its production composition
factory: it binds the durable facade to the closed lifecycle-ledger failure
resolver, so a server caller cannot accidentally substitute a browser-authored
comparison result. It uses the same facade commands and semantic-root correction
budget; it is not a fifth public command:

1. prepare or reuse the semantic operation;
2. generate/materialize once under the durable fence;
3. evaluate the exact review artifact in the fixed order
   `GARMENT -> FACE -> BODY -> ROOM -> FINAL_INTEGRATION`;
4. record a stage-excluded position as `NOT_APPLICABLE`;
5. after the first applicable failure, record all later applicable positions
   as `NOT_EVALUATED`;
6. if one bounded reason and target are derivable, record server-owned
   `FIX_ONE_THING`, create one distinct correction operation and repeat the
   complete chain; and
7. on a second, unclassified or indeterminate failure, stop at
   `BLOCKED_USER_DIRECTION` without another provider call.

The correction is a new semantic operation, not a second invocation of an
uncertain execution and not an invisible expansion of the mutable region. It
consumes the one correction ordinal for the semantic root. If it was consumed
in the background, the later human projection may not offer another fix.

`studioAtelierCandidateVisibility` is the state policy, and
`createStudioAtelierReviewArtifactService` is the authenticated byte boundary.
The service may return only the exact artifact in `SEMANTIC_PASS`,
`USER_APPROVED` or `LOCKED`; it resolves the authenticated operator's
operation, verifies the durable artifact tuple and content hash, reads private
bytes without exposing storage coordinates, then re-authorizes the unchanged
projection/artifact before returning. `DRAFT`, `MATERIALIZED`, technical pass
or failure, semantic failure, rejection, supersession and blocked states all
fail closed. Internal persistence and evaluator services may read paid bytes to
perform their server-owned duties; that does not make the media reviewable.

The historical manual G005 run displayed its PASS A/PASS B frames for the
user's whole-frame decision. That fact remains calibration and audit history.
Studio does not reproduce its disclosure timing: a failed first candidate and
its correction remain private, and only the eventual exact `SEMANTIC_PASS`
artifact crosses the review-media boundary.

## Declaration and trusted compiler

The executable Studio boundary is the strict
`juw.studio-atelier-declaration.v1` schema in
`lib/studio/atelier/declaration-compiler.ts`. The caller declares typed intent;
it does not author `juw.atelier-operation.v1`.

`prepare` performs this deterministic sequence:

1. Parse the strict declaration and reject unknown fields.
2. Ask the server-owned file-verification resolver for exact evidence. A
   declaration cannot contain or counterfeit this receipt.
3. Resolve the server-owned truth bundle from current state, the exact private
   manifest, garment truth and the durable lock projection.
4. Validate stage, view, change, immutable, rear-evidence and correction rules.
5. Compile the canonical `juw.atelier-operation.v1` object.
6. Persist the declaration receipt, truth receipt, source hashes, canonical
   operation, semantic hash and root/correction lineage.

The declaration receipt binds the declaration schema, validator revision,
canonical source hash and `fileVerification: PASS`. The truth receipt binds the
truth-bundle version, state-file hash, private manifest revision/hash and
garment-truth revision/hash. Repeated prepare may accept a fresh verification
timestamp, but it must reject changed truth bytes for an existing operation.

The manual operation record remains useful for semantic preflight, legacy
manual runs and historical qualifiers, and continues to use:

```bash
npm run atelier:verify:operation -- storage/garments/drop-02/NNN/operations/<operation>.json
```

Current records must declare the exact engine `stage`, matching `view`, exact
authority/parent hashes and derived semantic identity. Legacy records are read
only through `--legacy-read-only`. A strict pass is reported as
`SEMANTIC_PREFLIGHT_ONLY`; `paidInvocationAllowed` remains false because this
validator has no execution hash, durable claim/fence or provider
reconciliation checkpoint.

It is calibration and semantic evidence, not a second form a worker authors
for an engine run and not a free-form paid execution request. Provider prompt
prose is compiled only by `juw-atelier-canonical-prompt-v4` from the canonical
operation, exact ordered physical bindings and verified server-owned safety
context. Manual correction records are
also non-dispatching; the durable engine derives a correction from the exact
failed receipt and enforces the one-ordinal root fence.

### Provider safety context and moderation terminal

The execution-context port resolves two independent receipts: non-ZDR
retention acknowledgement and provider safety context. The safety receipt is
content-hashed and binds the exact semantic operation hash and stage. The
execution record then binds that receipt to the authenticated operator, exact
operation, provider/model, retention acknowledgement and recorded time. The
receipt selects one of two stage-checked claims:

- garment-only output: non-sexual retail catalogue evidence with no real
  person as an output target; or
- subject/final output: verified adult, consented and authorized likeness use,
  fully clothed non-sexual retail-fashion presentation.

The server execution-context resolver derives this evidence from trusted
current-state consent and permission; it never mints it from a browser field.
The canonical prompt renders only the fixed factual claim. No caller prose or
browser field can weaken or replace it. Missing, malformed, forged or
stage-incompatible evidence fails before execution intent, claim or spend.

OpenAI `moderation_blocked` is parsed by its stable error code; optional details
are restricted to `input`, `output` or `unknown` plus safe coarse categories.
The engine atomically records a hash-bound no-output provider-failure manifest
and terminal `FAILED` execution. It records no artifact, never enters technical
or semantic QA, preserves the root correction budget and reuses that terminal
row on repeat. Unrecognized or genuinely uncertain post-dispatch errors remain
`INDETERMINATE_PROVIDER_RESULT`. Provider response bodies, prompts and private
media never enter the moderation evidence or public projection.

## Semantic stages, never garment branches

Every garment uses the same ten semantic stage recipes. The first four are
independent root operations through the same facade and lifecycle as the later
stages:

| Stage | Semantic result | Required lineage |
| --- | --- | --- |
| `GARMENT_01_FRONT` | clean `GARMENT_FRONT` view 01 | server-resolved `DIRECT_GARMENT_EVIDENCE`; no stage parent |
| `GARMENT_02_BACK` | direct or quarantined inferred `GARMENT_BACK` view 02 | server-resolved `DIRECT_GARMENT_EVIDENCE`; no stage parent |
| `GARMENT_03_MANNEQUIN` | source-safe neutral `MANNEQUIN_FRONT` view 03 | server-resolved `DIRECT_GARMENT_EVIDENCE`; no stage parent |
| `GARMENT_04_DETAIL` | close visible `FABRIC_DETAIL` view 04 | server-resolved `DIRECT_GARMENT_EVIDENCE`; no stage parent |
| `SUBJECT_A` | first garment-specific front subject | exact same-garment locks for front, back, mannequin and detail plus complete front identity/body truth |
| `SUBJECT_B` | the one bounded subject refinement | eligible Pass A translation donor, all four same-garment locks and the same real identity/body truth |
| `ROOM_FINAL_05` | front subject aligned for the locked room | approved subject lock plus exact room and garment safeguard |
| `SIBLING_06` | independent left-profile subject | accepted same-garment 05 plus face, side body, direct angle and room truth |
| `SIBLING_07_CORE` | independent right-rear-3Q subject | accepted same-garment 05 plus face, back body, direct angle and room truth |
| `SIBLING_07_RECOVERY` | bounded rear/profile recovery | the same 05 plus complete face/rear/profile truth and room truth |

The four garment stages have no parent roles. A 01 candidate cannot become the
provider parent for 02, 03 or 04, and no early-view candidate chain is valid.
Their shared authority role is direct garment evidence plus the compiled
garment facts, unknowns and prohibited inferences. Locking 02 never converts an
inferred rear presentation to direct evidence. Subject compilation fails unless
`GARMENT_FRONT_LOCK`, `GARMENT_BACK_LOCK`, `MANNEQUIN_FRONT_LOCK` and
`FABRIC_DETAIL_LOCK` all resolve to the same garment and exact immutable bytes.

06 and 07 are siblings from accepted 05 and never parent one another. A
rejected, superseded, merely materialized or semantically failed artifact is
never eligible as a parent.

Logical authority membership is part of the semantic operation. Physical
packing is an adapter-only transport choice. Every deterministic or attested
pack records its ordered constituent IDs/hashes, recipe revision, output hash,
dimensions and provider slot. Reference limits never justify dropping truth.

## Exact Gateway policy

The candidate adapter policy is deliberately narrow:

- model: `openai/gpt-image-2`
- transport: Vercel AI Gateway
- provider allow-list: `openai` only
- fallback models: none
- provider reference maximum: four
- SDK retries: zero
- timeout: 180 seconds
- quality: `medium`
- requested canvas: `1024x1536`
- default accounting cap: US$0.10 per image
- prompt: versioned compiler output only
- private identity: server-resolved non-ZDR/retention acknowledgement required

GPT Image 2 has no idempotency key or durable job lookup through this adapter.
The engine therefore promises a single fenced local dispatch and durable reuse,
not fictional exactly-once behavior at the remote provider. An uncertain
post-dispatch result becomes `INDETERMINATE`; it is never automatically spent
again. Do not put the paid invocation inside an auto-retrying workflow step.

Garment 01–04 and subject stages use the base `atelier-gpt-image-2-v2`
full-frame profile and produce one opaque JPEG. Final-scene stages use the distinct
`atelier-gpt-image-2-transparent-subject-v1` profile and request one transparent
PNG subject on the exact `1024x1536` provider canvas. Adapter capability preflight
must match stage, output mode, format and required alpha before a claim.

GPT Image 1.5, GPT Image 1 mini, Flux and Seedream are not automatic fallbacks.
A different adapter is eligible only after it passes the same versioned
calibration envelope.

## Transparent subject, then app-owned room

`ROOM_FINAL_05`, `SIBLING_06`, `SIBLING_07_CORE` and
`SIBLING_07_RECOVERY` use
`TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE`:

1. Resolve and verify the exact locked room descriptor before any paid call.
2. Resolve one exact versioned native-room canvas profile: 1024x1536
   same-canvas, or 1024x1280 with the guarded central subject window.
3. Ask the model for subject pixels only; the room is alignment authority and
   must not appear in the generated layer.
4. Persist the raw PNG before policy.
5. Normalize hidden RGB under alpha zero with
   `transparent-rgb-zero-png-v1` and store a separate `SUBJECT_LAYER` artifact.
6. Gate PNG format, provider dimensions, alpha structure and connected subject
   occupancy. For native 4:5, require all visible alpha inside
   `x=16..1007,y=144..1391`, copy `x=0,y=128,w=1024,h=1280` one-to-one, then
   composite over the already preflighted exact room with
   `sharp-native-room-window-v2` under the same paid execution lease.
7. Store the separate `COMPOSITE` and make that exact artifact—not the
   `SUBJECT_LAYER`—the `MATERIALIZED` candidate for technical QA, semantic QA
   and human review.
8. Record human `Keep` for that composite as `USER_APPROVED`; materialization
   alone is not approval.
9. During `lockOrReuse`, reload the exact reviewed composite, its exact subject
   source and exact room bytes server-side. Read/hash-verify both artifacts and
   deterministically recompute the expected composite in memory. Record
   `LOCKED` only when its hash equals the already reviewed composite; never
   write different post-approval bytes.

The model never owns a pixel-locked room. Caller-supplied approval objects,
room bytes or artifact bytes are not accepted by the lock command.

## Private Lulu V4 authority status

All **11** operational Lulu V4 authority assets under revision
`LULU_V4_2026-08-25.7` were read back from private Blob and verified on
2026-08-26. Verification matched every declared SHA-256, byte size, MIME type
and dimension; no public/provider URL was used as authority. The verified
private readback manifest is 9,338 bytes with SHA-256
`d245096f4582e6638bbc9ab1c9abe41df9aa447736372824cdc6803d651824bb`.
Every asset explicitly records `ACCEPTED_OPERATIONAL_AUTHORITY` and
`LOCKED_IMMUTABLE`. Revision `.7` preserves the exact verified bytes of the
immutable `.6` predecessor; it closes the per-asset authority-status contract.

| Verified asset | Dimensions |
| --- | --- |
| `lulu.face.operation-board.full.v1` | 1536x2050 PNG |
| `lulu.face.v4.front.lock.v1` | 1122x1402 PNG |
| `lulu.body.canon.v4` | 1022x1536 PNG |
| `lulu.body.canon.v4.three-view` | 1022x1260 PNG |
| `lulu.body.canon.v4.front` | 341x1260 PNG |
| `lulu.body.canon.v4.side` | 340x1260 PNG |
| `lulu.body.canon.v4.back` | 341x1260 PNG |
| `lulu.body.real.angle-contact.v4` | 1080x1040 JPEG |
| `lulu.body.real.gym-rear-profile.v4` | 360x782 JPEG |
| `lulu.body.rear.operation-board.full.v1` | 1800x900 PNG |
| `juw.atelier.empty-plate.v1` | 1024x1280 PNG |

Re-run the private readback verifier whenever the source manifest or a Blob
object changes:

```bash
npx vercel env run -- npm run blob:sync:lulu-v4-authority
```

The command must report all assets as verified private predecessors or verified
uploads. A local file, list response or successful upload alone is not enough;
readback verification is the gate.

## Qualified native-room canvas profile

The currently approved room plate is
`juw.atelier.empty-plate.v1`, SHA-256
`0b591197d2de1b490c4305ac0aed4d1089564562c7b1005411a8340168aabb72`,
at **1024x1280**. `juw.atelier-native-room-canvas.v1` accepts that exact native
canvas while keeping the provider subject at **1024x1536**. The compositor
requires every nonzero alpha pixel inside a 16-pixel guard around the retained
central 1024x1280 window, then performs an integer 1:1 row copy and composites
over the unchanged room. It performs no room resize, stretch, crop, pad,
extension or generation and no subject interpolation. Any visible alpha in a
discarded band or guard fails instead of being silently cropped.

This removes the former dimension mismatch only. Paid cutover remains blocked
by `ENGINE_DISABLED`, unapplied release migrations, missing target-environment
authority readback and the absent closed qualified-evaluator bundle. The new
profile must also be included in that qualification evidence before final-scene
dispatch is enabled.

## Durable execution and crash checkpoints

The persistence layer records operations, executions, immutable private
artifacts, append-only hash-linked lifecycle events and a compare-and-swap
projection. The current lifecycle is:

```text
DRAFT
-> MATERIALIZED
-> TECHNICAL_PASS | TECHNICAL_FAIL
-> SEMANTIC_PASS | SEMANTIC_FAIL
-> USER_APPROVED | USER_REJECTED
-> LOCKED | SUPERSEDED | BLOCKED_USER_DIRECTION
```

An execution state of `COMPLETE` means paid bytes are durably materialized. It
does not mean technical pass, semantic pass, user approval or lock.

Every paid operation follows this order:

1. Persist the compiled operation, declaration/truth receipts and semantic
   hash.
2. Persist the execution intent, exact adapter/model, compiled prompt and hash,
   ordered bindings, parameters, policy revision and execution hash.
3. Acquire one database claim, lease and fence for the operation.
4. Persist `provider_invocation_started_at` before dispatch.
5. Invoke Gateway once with `maxRetries: 0`.
6. Stage every returned raw output in immutable private content-addressed Blob.
7. Persist `provider_result_received_at`, usage, exact cost, warnings,
   sanitized request/model evidence, duration and the complete raw-result
   manifest with those exact Blob coordinates under the same fence.
8. Index every staged raw artifact. A crash here resumes indexing from the
   checkpointed Blob coordinates with zero provider calls.
9. Quarantine missing/over-cap accounting without discarding paid bytes.
10. Record the normalized JPEG, or both transparent `SUBJECT_LAYER` and exact
    deterministic `COMPOSITE`. Finalize execution and append `MATERIALIZED`
    transactionally with the normalized JPEG or `COMPOSITE` as the review
    artifact.

Expired recovery distinguishes no-dispatch work, an uncertain dispatched call
and a retained provider result. It may safely resume local materialization from
retained evidence, but it may not repeat an unreconciled remote call.

Only a `LOCKED` projection can resolve as a parent. Event sequence, previous
event hash and projection version are enforced transactionally. One correction
ordinal per semantic root is enforced in storage, and the exhausted path ends
at `BLOCKED_USER_DIRECTION`.

## Quality and correction gates

Technical QA is derived by the engine from the closed
`juw.atelier-technical-qa.v1` schema, rubric, evaluator and threshold. It binds
the exact review artifact and records format, byte hash, dimensions, aspect,
colour space, single-image geometry, alpha structure where required,
watermark/text findings and normalized hash. Semantic QA is likewise derived
from the closed `juw.atelier-semantic-qa.v2` contract and uses the versioned
multi-era G001/G004/G005/G009/G023/G024 baseline for:

- real Lulu identity and hair;
- connected approved body geometry;
- visible garment construction, surface, texture and drape;
- conservative treatment of unknown rear construction;
- view grammar, pose and anatomy;
- photographic skin/material response and optics;
- immutable truth and exact room ownership.

Each assessment stores its rubric, evaluator, threshold and evaluation hash.
Machine evidence is stored server-side. A free-form or evaluator-authored
aggregate `PASS` is invalid.

G004 is no longer satisfied by the string `"G004"`. The engine maps subject A,
subject B and final 05 to the exact G004/05 derivative; 06 to G004/06; and both
07 stages to G004/07. Independent garment 01–04 operations record the target as
`NOT_APPLICABLE`. Before an applicable paid dispatch, and again before semantic
QA, the server reads all three content-addressed WebPs, verifies MIME, size,
1120x1400 geometry, container SHA-256 and decoded sRGB RGBA pixel SHA-256, then
re-verifies the resolver result at the engine boundary. The closed evaluator
receives a fresh copy of only the one stage-selected 05, 06 or 07 frame; the
engine rehashes that copy after evaluation before accepting evidence. Persisted evidence
contains only the calibration revision, manifest/readback receipt hashes,
candidate hash, selected target hash/pixel hash and scoped axis decisions—never
the bytes or storage pathname.

The binding is revision
`g004-positive-target-shop-derivatives-2026-08-26.1`, manifest SHA-256
`451368db5dd7845fc716dbb661d7bd9153297a99802f6f8f1c441babda8aa635`
and readback-receipt SHA-256
`516438224ef2117c328baffde236fb7d8e3565ea6d8477147754b6de77773dc0`.
Its three frames are deliberately locked public Shop derivatives because the
canonical private originals could not be recovered. This is a new evaluator-
only calibration revision, not restoration of the missing originals.

G004 may measure only its declared positive-target axes: front/profile/rear
view and camera grammar, room/scene integration, subject scale, heel-aware
stature, poise and secondary translation continuity. Direct real Lulu identity
and body evidence plus the current garment's direct evidence always outrank it.
G004 is forbidden from provider references, parent locks, direct truth,
current-garment construction/colour/texture, jewellery, footwear or styling.
The operation schema and execution service deny every locked derivative and
recorded-original ID/hash, then compare decoded raw provider-input pixels to
the derivative pixel deny set before any packing, intent or dispatch. The
additional normalized RGB NCC/MAE policy is revision
`g004-provider-visual-denial-2026-08-26.1`, bound by manifest SHA-256
`360cbf8ab42d7ca344c4296d87d28f112f809ce6952069ab664731044c0ad1d3`.
It denies calibrated full-frame copies across lossy codec, colour, mirror, tiny
alignment and small geometric changes, rather than only byte-renamed or
losslessly re-encoded frames. V1 does not claim arbitrary-subimage, large-warp
or untrusted-mosaic detection; raw constituents are checked before app-owned
boards or composites are assembled. This derivative-only denial revision does
not restore or stand in for the missing canonical originals.
Any G004 mismatch stops for user direction. If the same closed assessment also
identifies a specific mutable semantic gate, the G004 mismatch still dominates
and no private correction spend is authorized.

The semantic evidence is one ordered ledger:

```text
GARMENT -> FACE -> BODY -> ROOM -> FINAL_INTEGRATION
```

The engine validates the ordering rather than accepting five unrelated
verdicts. A stage-excluded gate is exactly `NOT_APPLICABLE`. Once an applicable
gate fails, every later applicable gate must be `NOT_EVALUATED`; an evaluator
may not report a later pass that dilutes the first failure. Early garment
stages therefore keep face/body/room positions explicit but non-applicable,
while subject stages treat room as non-applicable and final-scene stages apply
the complete chain.

Only a semantic-pass candidate can be read or kept, and final lock still
requires the recorded human `Keep` decision. Machine QA cannot approve Lulu,
and human review cannot waive a recorded `SEMANTIC_FAIL`.

A bounded correction names one failed gate, one target layer/region and the
complete immutable set. Its rejected diagnostic output remains evidence but
does not become a parent. The server drives that correction privately, gives it
a distinct semantic identity and reruns the entire ordered gate ledger. Failure
after the one correction blocks for user direction without another spend.

## Calibration corpus and G024 evidence

Use G001-G024 only as a fixed calibration corpus. Useful stress cases include:

- G004's exact version-locked derivatives for positive camera, room, scale and
  05/06/07 view-grammar comparison only;
- G005 for identity/body/room separation and holistic subject rebase;
- G009/G021/G023 for side/rear body authority and rejected-parent bans;
- G010/G011 for bounded construction correction;
- G017/G018 for moderation/provider failure and safe recovery;
- G024 for black texture, sculpted shoulder, angle grammar and fused rear
  transport.

Gold outputs are evaluation targets, never undeclared provider inputs. G004's
declared calibration revision uses already-public Shop derivatives; other
private gold output remains private. Qualification is per material
adapter/model/policy/calibration revision, not per new garment.

`G024-FUSED-QUALIFICATION-2026-08-26.json` remains binding calibration history:

- Separate face and rear boards passed transport controls, while the original
  combined four-reference shape reached OpenAI and failed twice with HTTP 400.
- The attested fused identity/rear pack preserved all logical authorities in
  three physical inputs and completed through exact `openai/gpt-image-2`.
- That shadow run cost US$0.077736 and produced output SHA-256
  `844556aaef56f50270a545f5d992368229041d0f849eee590446b0581232f2bd`.
- Technical transport passed; semantic QA rejected identity/body drift,
  shoulder/hem drift, mirrored view grammar, synthetic material response and
  locked-room regeneration.
- The run used a public G024/05 derivative because the exact private master was
  unavailable to that qualifier. Its output is non-promotable and may never be
  a parent.

The fused pack is transport-qualified, not final-scene-qualified. Do not repeat
the rejected one-pass scene shape. Its generic lesson is the current transparent
subject plus deterministic composite path; G024 itself has no runtime branch.

## Worker handoff and verification

Every worker changing the engine must:

1. Follow the repository read order in `AGENTS.md`, including the G024 evidence
   before touching fused recovery.
2. Change engine contracts, server ports and tests, not Studio UI, unless UI is
   separately assigned.
3. Keep all runtime behavior garment-independent. Add new garments as truth
   data and calibration fixtures only.
4. Keep the four-command facade narrow. Never expose provider, prompt, hashes,
   attempts, consent, private bytes or server ports to callers.
5. Preserve semantic-versus-execution hashing, exact ordered bindings,
   crash checkpoints, private raw-byte retention and lock-only parent
   resolution.
6. Add a failing generic regression test for every discovered authority,
   lineage, idempotency, persistence, alpha/composite or QA defect.
7. Never bypass the native-room profile: exact supported dimensions, guarded
   alpha window, 1:1 copy, unchanged room pixels and profile-bound identity.
8. Never reduce G004 calibration to an anchor label. Preserve the exact
   manifest/readback receipt, decoded-pixel hashes, stage mapping and
   evaluator-only scope; a new byte requires a new calibration revision.

Run the focused engine suite:

```bash
npx tsx --test \
  tests/studio-atelier-declaration-compiler.test.ts \
  tests/studio-atelier-contracts.test.ts \
  tests/studio-atelier-persistence.test.ts \
  tests/studio-atelier-execution-service.test.ts \
  tests/studio-atelier-engine-facade.test.ts \
  tests/studio-atelier-durable-engine.test.ts \
  tests/studio-atelier-agent-engine.test.ts \
  tests/studio-atelier-background-gate.test.ts \
  tests/studio-atelier-private-failure-resolver.test.ts \
  tests/studio-atelier-production-runtime.test.ts \
  tests/studio-atelier-review-artifact.test.ts \
  tests/studio-atelier-g004-calibration.test.ts \
  tests/studio-atelier-quality-contracts.test.ts \
  tests/studio-atelier-lock-service.test.ts \
  tests/studio-atelier-subject-layer.test.ts \
  tests/studio-gpt-image-2-gateway.test.ts \
  tests/studio-native-atelier-stack.test.ts
npm run test:atelier
npm run typecheck
```

Before release, also run the full TypeScript contract suite and lint the changed
engine files:

```bash
npm run test:contracts
npx eslint \
  lib/studio/atelier \
  lib/ai/studio-gpt-image-2-gateway.ts \
  lib/ai/studio-gpt-image-2-subject-layer.ts \
  lib/server/studio-atelier-engine-facade.ts \
  lib/server/studio-atelier-durable-engine.ts \
  lib/server/studio-atelier-agent-engine.ts \
  lib/server/studio-atelier-background-gate.ts \
  lib/server/studio-atelier-candidate-visibility.ts \
  lib/server/studio-atelier-execution-service.ts \
  lib/server/studio-atelier-garment-reference-board.ts \
  lib/server/studio-atelier-lock-service.ts \
  lib/server/studio-atelier-private-failure-resolver.ts \
  lib/server/studio-atelier-production-runtime.ts \
  lib/server/studio-atelier-repository.ts \
  lib/server/studio-atelier-review-artifact.ts \
  lib/server/studio-atelier-subject-compositor.ts \
  tests/studio-atelier-declaration-compiler.test.ts \
  tests/studio-atelier-contracts.test.ts \
  tests/studio-atelier-persistence.test.ts \
  tests/studio-atelier-execution-service.test.ts \
  tests/studio-atelier-durable-engine.test.ts \
  tests/studio-atelier-agent-engine.test.ts \
  tests/studio-atelier-background-gate.test.ts \
  tests/studio-atelier-private-failure-resolver.test.ts \
  tests/studio-atelier-production-runtime.test.ts \
  tests/studio-atelier-garment-reference-board.test.ts \
  tests/studio-atelier-review-artifact.test.ts \
  tests/studio-atelier-quality-contracts.test.ts \
  tests/studio-atelier-lock-service.test.ts \
  tests/studio-atelier-subject-layer.test.ts \
  tests/studio-gpt-image-2-gateway.test.ts
```

Run the zero-spend qualification report before release:

```bash
npm run atelier:check:qualification -- --compact
```

Do not enable a production final-scene claim merely because tests pass. The
exact readback-verified room must resolve to a supported native profile, the
subject alpha window must pass, and the composed route runtime plus closed
qualification bundle must pass the target-environment readiness atom first.
