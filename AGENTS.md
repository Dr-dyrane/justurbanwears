# JustUrbanWears agent operating contract

This file governs every AI-assisted task in this repository. It is especially strict for the Lulu virtual-atelier workflow.

## Mandatory read order

Before any model, garment, catalogue-media, identity, body, atelier, branding, or view-generation task, read:

1. `docs/virtual-atelier/OPERATING-CONTRACT.md`
2. `docs/virtual-atelier/ATELIER-CANON.md`
3. `docs/virtual-atelier/state/current.json`
4. The active garment brief under `docs/virtual-atelier/garments/`
5. `docs/virtual-atelier/assets/current.json`
6. `docs/virtual-atelier/RUNBOOK.md`

For any Studio or Virtual Atelier generation-engine task, also read:

7. `docs/virtual-atelier/MODUS-OPERANDI.md`
8. `docs/virtual-atelier/audits/G001-G024-WORKFLOW-AND-SEMBLANCE-AUDIT.md`
9. `docs/virtual-atelier/ENGINE-GUIDE.md`
10. `docs/adr/0046-provider-neutral-idempotent-virtual-atelier-operations.md`

Do not act from the latest user sentence alone. The repository state is the durable production memory.

## Studio engine scope

The Studio generation engine is **garment-independent and idempotent**.
Garments G001-G024 are calibration data, locked-result history and regression
fixtures only. Never add a garment-number runtime branch, adapter, route,
prompt path or retry rule. A new garment supplies validated truth data to the
same compiler, stage recipes, lifecycle and quality gates.

The durable four-command contract covers one end-to-end semantic-view engine:
independent garment views 01-04, subject synthesis, 05 and the independent
06/07 siblings. The four early stages are `GARMENT_01_FRONT`,
`GARMENT_02_BACK`, `GARMENT_03_MANNEQUIN` and `GARMENT_04_DETAIL`. They use the
same declaration compiler, facade, claim/fence, artifact ledger, ordered QA,
review and lock lifecycle as later stages. They are independent root
operations over direct garment evidence; no 01-04 candidate may parent another.
Subject synthesis requires all four exact same-garment locks. Do not claim
production cutover merely because the contracts exist: migrations, server
port composition, authority/canvas preflight and the closed qualification suite
must also pass in the deployed environment.

Engine work is not UI work. Studio surfaces consume the sanitized engine
projection and dispatch exactly four server commands:

```text
prepare -> generate once -> review -> lock/reuse
```

- `prepare` accepts one strict typed declaration and returns the derived
  operation ID.
- `generate` accepts that operation ID and crosses the paid dispatch fence at
  most once; repeats join or reuse durable work.
- `review` accepts only `Keep`, `Fix one thing`, or `Reject`. A fix names one
  bounded reason and target.
- `lockOrReuse` accepts only the operation ID and returns the approved immutable
  lock or reuses an existing lock.

The public four moments do not make every materialized frame visible. During
`generate`, the server privately compares the exact review artifact in the
fixed order `GARMENT -> FACE -> BODY -> ROOM -> FINAL_INTEGRATION`. A gate that
does not apply to the declared stage is recorded `NOT_APPLICABLE`. After the
first applicable failure, later applicable gates are `NOT_EVALUATED`. The
server may derive one bounded `FIX_ONE_THING`, create one new semantic
correction operation and repeat the complete ordered chain. A second failure,
an unclassified failure or an indeterminate provider result blocks without
another paid call. This is the one correction budget for the semantic root;
the later human `Fix one thing` action is available only when that budget was
not already consumed.

The facade and its sanitized projection never return image bytes. The
authenticated app-owned review-media boundary must also fail closed unless the
current durable projection is `SEMANTIC_PASS`, `USER_APPROVED` or `LOCKED`, and
must re-authorize the same content-addressed artifact after reading it. Thus a
candidate remains unreadable by the operator/browser—not merely absent from a
DTO—through materialization and failed QA. Only an exact `SEMANTIC_PASS`
artifact may be shown for `Keep`, `Fix one thing` or `Reject`.

The authenticated operator identity, file-verification receipt, current-state
truth, manifest, eligible parents, provider/model, prompt, hashes, attempt,
consent and retention evidence, authority bytes, QA evidence and lifecycle
version are server-owned. Routes and browser clients may not supply them or
implement an engine port.

## Studio UI workflow contract

Every Studio mutation surface follows one projection-driven interaction
contract, whether it is backed by the current legacy service or the durable
Atelier facade:

1. Render server state as the authority. Never infer approval, completion or
   retry eligibility from a spinner, elapsed time or a locally remembered step.
2. Present one primary action derived from the current projection. Advanced
   choices remain secondary and progressively disclosed.
3. Acquire a synchronous client single-flight guard before starting a request.
   Disable conflicting actions and announce a specific pending label
   immediately; a React state update alone is not a duplicate-click fence.
4. Bind every mutation to stable semantic identity, expected revision and a
   durable idempotency key where the server contract supports one. Preserve the
   same key across a lost response, retry and same-tab reload. Never mint a new
   key merely because the network result is unknown.
5. After an ambiguous response, reread and reconcile the server projection.
   Never blindly replay a paid generation or report failure while durable work
   may have advanced.
6. Resume pending work through bounded-backoff polling or an equivalent durable
   status channel. Transient read failures may show a connection notice but may
   not silently stop recovery or trigger provider work.
7. Reconcile and reuse materialized work internally before offering another
   provider call, but keep its bytes hidden until `SEMANTIC_PASS`. Reuse a
   reviewable or locked artifact before offering regeneration. Keep
   `MATERIALIZED`, QA pass/fail, human approval and `LOCKED` visibly distinct.
8. Serve private media through authenticated, app-owned same-origin routes that
   authorize the current lifecycle state and exact artifact before and after
   private-byte readback. Blob coordinates, provider URLs and private authority
   locators never enter browser projections.
9. On mobile, keep the media/result stage persistent and place contextual
   controls in the adaptive bottom surface. On wider/usable canvases, move the
   same surface beside the stage without remounting workflow state.
10. If server composition, migration, authority or canvas preflight is not
    ready, show the exact zero-spend blocker. Do not expose a decorative
    Generate button or simulate a production transition.

## Non-negotiable rules

1. **Real identity first.** Real Lulu face references are the primary identity authority. Generated JUW faces are translation guidance only.
2. **Body canon is authoritative.** Do not reinterpret Lulu's body from descriptive words such as “curvy,” “hourglass,” or “full.” Use the approved body canon and its accepted geometry.
3. **The atelier is the approved light catalogue room.** The accepted Garment 001/002 imagery defines its layout, warm-neutral colour temperature, ambience, props and camera family. Never replace it with a dark showroom, reception counter, mirror, backroom, shelving, spotlight board or any newly designed boutique.
4. **Brand references control the icon only.** The wall mark is the small standalone canonical JUW icon. Never add `justurban`, `wears`, `BY LULU`, substitute lettering, circles, triangles, approximate geometry, or use a full logo-lockup image as room authority.
5. **Garment references control the garment only.** They have no authority over identity, body, room, branding, camera, pose, or styling unless explicitly granted.
6. **View grammar is fixed.** `05 = FRONT MASTER`; `06 = LEFT PROFILE`; `07 = RIGHT REAR 3Q`, never a complete back view.
7. **Accepted means immutable.** A locked layer may not be regenerated to fix another layer. A local correction must list the exact mutable region and preserve all other accepted pixels/concepts.
8. **One clean full image at a time.** Do not produce triptychs, contact sheets, labels, footers, measurements, cards, crops, or presentation boards unless explicitly requested.
9. **Never promote a rejected candidate.** Rejected outputs cannot become parents, authorities, or packet contents.
10. **Stop rather than guess.** If required reference media is unavailable to the actual operation, report the binding failure before generating.
11. **Compile authority; never drop it.** Provider reference limits may be met only with a deterministic or attested private pack that records every constituent ID and hash. Never omit identity, body, garment, angle or room authority to fit a provider.
12. **Persist paid bytes before policy.** Store every returned raw image and its accounting before cost, decode, normalization or semantic gates. Missing/over-cap cost quarantines a private artifact; it does not discard it.
13. **No direct provider routes.** Studio routes and UI dispatch engine commands. Only the approved server-side adapter/execution service may invoke a paid image model.
14. **Locked pixels are app-owned.** A model may generate a transparent subject layer, but it may not repaint a pixel-locked room. Gate the subject layer first, then composite over the exact room bytes with deterministic app code.
15. **Materialized is not approved.** An Atelier execution state of `COMPLETE` means paid bytes were durably materialized. It does not mean semantic QA passed, the user approved, or the artifact is locked.
16. **Checkpoint paid work.** Persist the provider-invocation-started checkpoint before dispatch and the result-received checkpoint plus raw-result manifest immediately after return. If an invoked result cannot be reconciled, stop in an indeterminate state; never auto-spend again.
17. **Same-canvas room or stop.** Final-scene stages require an exact 1024x1536 approved room for the locked 1024x1536 transparent-subject profile. Never resize, stretch, crop, pad, extend or regenerate a different-sized locked room.
18. **Review the exact final bytes.** Transparent-subject stages materialize the deterministic COMPOSITE before technical QA, semantic QA and human review. `Keep` and `LOCKED` bind that exact hash; no post-approval image creation is allowed.
19. **Closed QA only.** Technical and semantic evaluators must return the strict versioned evidence schemas, bind the exact review artifact, record rubric/evaluator/threshold versions and use the G001/G004/G005/G009/G023/G024 multi-era baseline. Their ID, version, policy revision, qualification-suite version and qualification-receipt SHA-256 must exactly match the server-owned descriptor; URL, Blob and filesystem locator syntax is invalid. Production callers may not inject evaluator functions or declare qualification PASS. Until the internal resolver has a canonical six-case PASS receipt, independent-review receipt and the receipt-bound evaluator bundle, construction fails `QUALIFICATION_NOT_PASSED`. Semantic QA v2 also binds G004 to the exact version-locked derivative readback receipt and decoded-pixel hash for the stage-specific positive target. The engine derives PASS/FAIL and the evaluation hash; a free-form pass object is invalid.
20. **Hidden until semantic pass.** A materialized, technically passed or failed candidate is not operator-readable media. Only the exact content-addressed artifact in `SEMANTIC_PASS`, `USER_APPROVED` or `LOCKED` may cross the authenticated review-media boundary.
21. **Correct once in private.** Evaluate `GARMENT -> FACE -> BODY -> ROOM -> FINAL_INTEGRATION` in order, mark later applicable gates `NOT_EVALUATED` after failure, permit at most one server-derived correction per semantic root and repeat the complete chain before disclosure.
22. **One engine owns 01-07.** Views 01-04 are independent root operations through the same facade and lifecycle, never a candidate chain. All four same-garment locks are required before subject synthesis; accepted 05 alone parents independent 06 and 07.
23. **G004 is evaluator-only positive guidance.** The exact derivative calibration in `docs/virtual-atelier/g004-positive-target-calibration.v1.json` may measure declared camera, room, scale, pose/view and secondary translation axes only. It may never enter a provider reference, parent lock, direct identity/body/current-garment truth or styling transfer. Canonical and derivative IDs/hashes and exact decoded pixels are denied in operation and transport bindings. The separately hash-bound `g004-provider-visual-denial.v1.json` policy also rejects calibrated full-frame duplicates after lossy codec, colour, tiny alignment, mirror and small geometric changes before provider intent or dispatch. Its v1 scope does not claim arbitrary-subimage, large-warp or untrusted-mosaic detection; raw constituents must be checked before app-owned composition. The missing canonical originals remain missing; neither derivative manifest impersonates or restores them. Missing, substituted or undecodable calibration bytes block an applicable operation before paid dispatch and again before semantic QA.

## Current private-authority gate

As verified by private Blob readback on 2026-08-26, all 11 operational Lulu V4
authority assets are present under revision `LULU_V4_2026-08-25.7`; each
declared SHA-256, byte size, MIME type and dimension matched, and every asset
explicitly declares `ACCEPTED_OPERATIONAL_AUTHORITY` plus `LOCKED_IMMUTABLE`.
The private readback manifest is 9,338 bytes with SHA-256
`d245096f4582e6638bbc9ab1c9abe41df9aa447736372824cdc6803d651824bb`.

That verification does **not** clear final-scene production. The approved
`juw.atelier.empty-plate.v1` is 1024x1280, while the locked output/composite
canvas is 1024x1536. Production `ROOM_FINAL_05`, `SIBLING_06`,
`SIBLING_07_CORE` and `SIBLING_07_RECOVERY` must preflight-block before claim,
dispatch or spend until a separately approved exact 1024x1536 room is uploaded,
hashed, read back and resolved by a new trusted authority revision.

G004 has a separate evaluator-only calibration status. Its canonical private
05/06/07 originals and packet are unavailable, so they are not claimed as
restored. The three live 1120x1400 Shop WebP derivatives are deliberately locked
as revision `g004-positive-target-shop-derivatives-2026-08-26.1`; manifest
SHA-256 is `451368db5dd7845fc716dbb661d7bd9153297a99802f6f8f1c441babda8aa635`
and the exact container-plus-decoded-pixel readback receipt is
`516438224ef2117c328baffde236fb7d8e3565ea6d8477147754b6de77773dc0`.
Provider transport denial is separately locked as
`g004-provider-visual-denial-2026-08-26.1`, manifest SHA-256
`360cbf8ab42d7ca344c4296d87d28f112f809ce6952069ab664731044c0ad1d3`.
It covers calibrated full-frame lossy duplicates only and carries the explicit
v1 non-claims above.
This clears only the declared G004 positive-comparison target, never canonical
original recovery, provider input, parenting or direct truth authority.

## Required operation declaration

Every legacy manual generation or edit must first pass the governing
reproduction-record validator. A Studio engine run instead accepts only the
strict `juw.studio-atelier-declaration.v1` declaration; it does not require a
worker to hand-author a second legacy operation file. The implemented,
versioned compiler combines that declaration with server-owned file
verification, current state, exact private manifest, garment truth and durable
lock projection, then derives `juw.atelier-operation.v1` and persists both
source receipts and hashes. Neither receipt nor the compiled semantic operation
is a caller-authored DTO.

The durable lifecycle persists the canonical operation, semantic/root hash,
execution intent, crash checkpoints, raw and normalized artifacts, append-only
hash-linked events and the compare-and-swap projection. Only a `LOCKED`
projection may resolve as a parent. `COMPLETE` execution remains materialized,
not approved.

Every governing operation record contains:

- `operationId`
- `garmentId`
- `view`
- `parentAssets`
- `authorityStack`
- `changeSet`
- `immutableSet`
- `outputContract`
- `failureGates`

The operation is invalid if any required authority is unresolved.

Provider prompt prose must be produced by the versioned engine prompt compiler
from that semantic contract and its exact ordered bindings. Routes, UI and
workers may not inject a free-form paid execution prompt.

The only approved paid adapter policy is exact `openai/gpt-image-2` through
Vercel AI Gateway with OpenAI-only routing, no fallback, no SDK retry and a
server-owned cost/privacy policy. Subject stages may produce opaque JPEGs.
Final-scene stages must produce a same-canvas transparent PNG subject, pass
alpha gates, and be composited over exact room bytes by app code before
technical QA, semantic QA and human review. Approval and `LOCKED` must promote
that exact reviewed composite; lock may verify it by deterministic
recomposition but may never create different post-approval bytes.

Read `docs/virtual-atelier/G024-FUSED-QUALIFICATION-2026-08-26.json` before
changing the G024/07 recovery path. It proves the fused three-reference
transport works and also proves that one-pass scene regeneration fails semantic
QA. G024 and every other prior garment are calibration-only for this engine.
Do not repeat that paid shape, create a G024 runtime branch or use its rejected
output as a parent.

## Media privacy

The repository is public. Never commit real face photographs, body plates, WhatsApp source archives, private garment evidence, or unapproved generated identity media. Local private media belongs under `/storage/`, which is gitignored. Sandbox storage is a transient working cache, not a durable archive.

## State discipline

User approval is authoritative. After each approval or rejection, update `docs/virtual-atelier/state/current.json` before beginning another operation. Do not rely on conversational memory to carry state.

## Catalogue publication recovery

Before declaring a Shop database release blocked, read `docs/operations/LOCAL-ACCESS.md`, then `docs/data/SHOP_DATABASE.md`. The access guide is the canonical route for authenticated Neon and Vercel sessions, fresh direct database connections, public/private Blob tokens, temporary environment files, login codes and any exceptional token minting. The database guide owns target guards and release execution. Do not search predecessor chats or improvise a credential path first.

Vercel CLI exports may replace protected values with `[SENSITIVE]`; that placeholder is not a database outage and is not a usable credential. Resolve the canonical `justurbanwears-db` project through the authenticated Neon connector, or through the authenticated Neon CLI fallback documented in the guide when the connector itself has a schema/transport fault. Verify the production project/branch/database identity, and use a fresh direct non-pooler connection only through a mode-`0600` temporary environment file. Never print, paste into tracked files, or commit a connection string, token, login code or provider profile.

Predecessor tasks are emergency audit evidence, not the operating procedure. The checked-in database guide, current manifest, garment brief, and durable state must contain everything required for the next release. A release is not `LIVE_VERIFIED` until the guarded atomic database apply, exact manifest verification, affected-SKU availability checks, and production smoke all pass.
