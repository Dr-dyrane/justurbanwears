# Virtual Atelier runbook

## 0. Preflight — mandatory before any generation

Hydrate the private media into a local/sandbox directory, then verify the exact files and hashes declared by the current operation.

```bash
JUW_ATELIER_MEDIA_ROOT=/mnt/data \
  node scripts/virtual-atelier/verify-assets.mjs
```

For a local clone using the gitignored workspace:

```bash
node scripts/virtual-atelier/verify-assets.mjs --root storage/virtual-atelier
```

The preflight must return `PASS`. A missing, mismatched, or unresolved authority blocks generation. The canonical wall mark resolves to `public/brand/icon.svg`; brand campaign boards and full wordmark lockups are not valid substitutes.

For private V4 work, also read and hash-check `storage/models/konan/canon/v4/authority-manifest.json`. The private manifest is authoritative for pixel paths, lineage and permissions; `docs/virtual-atelier/assets/current.json` is the public logical index.

## 1. Canonical production hierarchy

Every garment follows this exact authority order:

```text
GARMENT INTAKE
→ REAL FACE AUTHORITY
→ BODY CANON
→ FASHION NOVA ACCESSORY STYLING CHECK
→ LOCKED ROOM
→ 05 FRONT MASTER
→ 06 OR 07 AS INDEPENDENT SIBLING VIEWS
```

The garment ID is the first input to the flow. For example, `004` always resolves to the same black floor-length gown with the white folded neckline.

`06` and `07` are sibling outputs. They both branch from the accepted `05`; select face, body, room and garment references adaptively for the strongest realistic view.

```text
                    ┌→ 06
GARMENT→FACE→BODY→ROOM→05
                    └→ 07
```

Forbidden lineage:

```text
06 → 07
07 → 06
```

An accepted sibling view may be used after generation for collection-level QA, but it must not be passed as a parent, identity authority, body authority, garment authority or pose authority for the other sibling.

## A. Start or restart a garment

1. Read `AGENTS.md`, `OPERATING-CONTRACT.md`, `state/current.json`, the garment brief, and `assets/current.json`.
2. Run the preflight and confirm every required logical asset is present, hash-valid, and visible to the actual operation.
3. Resolve the garment intake first.
4. Resolve face authority from the raw photographs, real-photo front lock and F01–F10 multi-angle contact; use accepted 001/05 and 004/05 only as translation guidance.
5. Run the face gate. If identity fails, stop before body.
6. Resolve body evidence and the V4 modeled geometry controls.
7. Run the body gate while preserving the accepted face.
8. Resolve the locked room and run the room/scale/icon gate without regenerating Lulu.
9. Create one clean `05 FRONT MASTER` only.
10. Do not generate `06` or `07` until `05` is accepted.
11. After `05` passes, either `06` or `07` may be produced next; they do not depend on one another.
12. Review each candidate against every acceptance gate and record `ACCEPTED` or `REJECTED` before proceeding.

### A1. Holistic subject synthesis

Use this only when the intended output is a new garment-specific full-frame subject master, not a pixel-local edit.

1. Lock `01 GARMENT_FRONT` and the body target first.
2. Declare `HOLISTIC_SUBJECT_SYNTHESIS`.
3. Run PASS A with the accepted body target, F01–F10 contact, raw frontal face, raw open-eye three-quarter face, and approved V4 translation lock.
4. If needed, use the single correction for PASS B with the accepted body target, PASS A as the translation donor, F01–F10 contact, raw frontal face, and raw open-eye three-quarter face.
5. Keep the centre-parted low bun unchanged unless the user explicitly unlocks hair.
6. Ask the user to judge the complete person and frame: identity, body balance, garment fit, pose, hands, legs, footwear, and styling.
7. If the user accepts all subject layers, copy the exact bytes into the garment's private `locked/` directory and record the hash as a garment-specific subject lock. If the user accepts everything except one named accessory, record a `SUBJECT_CORE_LOCK`, exclude that accessory from its authority, and defer only that accessory to the next styling/ROOM/`05` operation.
8. Rebase downstream authority on that exact lock. Do not demand pixel identity with the pre-synthesis body target after the user has approved the new holistic frame.
9. Complete the garment's `01–04` set before ROOM/final-`05` composition.
10. ROOM and `05` may change only the explicitly declared environment/accessory layers; the accepted subject lock remains the parent.
11. The pre-atelier subject lock cannot directly parent `06` or `07`; only an accepted final `05` can.

Garment 005 established this pattern with `g005-face-r002`: PASS A supplied a useful face translation, and PASS B was explicitly accepted by the user as the complete Lulu/Garment 005 subject master. Its failed local-edit review remains audit history; the user-approved result is classified separately as a full-frame subject master.

## B. Resolve Fashion Nova accessory styling and generate view 05

Before composing the room, resolve footwear and restrained accessories. For every `05`:

1. Inspect a current official Fashion Nova product or collection styling page matching the closest proven garment family.
2. Record the requested URL, resolved canonical URL, page title, access date, matched garment facts, selected direction, and `KEEP`, `REFINE`, `REPLACE`, or `NO_CLOSE_MATCH` decision in the private operation record. `NO_CLOSE_MATCH` requires an empty match list plus a written search/no-match reason and means retain the strongest garment-faithful JUW styling instead of forcing an unrelated look.
3. Treat the result as styling guidance only. It may not alter garment construction, identity, body, hair, pose, room, icon, camera, or lighting and must not imply Fashion Nova provenance for the JUW garment.
4. Pass only the recorded JUW styling decision into generation. Never place a Fashion Nova page, screenshot, image, URL or page asset in `referenceStack` or `authorityStack`.
5. If the subject was accepted as a `SUBJECT_CORE_LOCK`, change only the explicitly deferred accessory while placing the otherwise immutable subject in the locked room.
6. Close the styling choice through the final whole-frame `05` review. Views `06` and `07` inherit that accepted styling unless the user explicitly unlocks it.

Starting reference palette:

```text
current garment intake
+ real face authority
+ body canon
+ locked atelier plate
+ canonical standalone icon
+ accepted JUW translation lineage
+ 05 front-view grammar
```

The accepted `05` becomes the current garment’s front translation master. It records how that garment, identity, body and styling resolve together.

Before invoking `05`, declare its garment-specific `renderQualityContract` and run `npm run atelier:verify:operation -- <operation-json>`. After generation, record separate `renderQualityReview` PASS/FAIL results for photographic realism, skin texture, garment texture, lighting integration, optics/perspective and artifact rejection. Do not combine them into one room/anatomy judgment.

Default output: one clean full-body image, no labels or composite layout.

## C. Generate view 06 — sibling branch

Precondition: current garment `05` is accepted and locked.

Required authority stack:

```text
accepted current-garment 05
+ complete real-face operation board
+ dedicated SIDE body canon
+ direct real-Lulu angle contact
+ locked atelier plate
```

Do not use `07` as a parent.

This authority core is mandatory, while reference ordering and truth-preserving packaging remain adaptive. Do not replace the SIDE crop or direct real-body evidence with a generic translation image. Current-garment construction is inherited from accepted `05`; unknown side facts stay unknown.

Before invocation, complete `renderQualityContract` and run `npm run atelier:verify:operation -- <operation-json>`. Judge likeness, head-to-toe body realism, attitude, presence, pose, garment truth, skin and material texture, natural optics and scene integration together.

After generation, record separate `renderQualityReview` PASS/FAIL results for photographic realism, skin texture, garment texture, lighting integration, optics/perspective and artifact rejection before claiming gate pass.

Mutable layer: view-specific pose, chin angle, shoulder openness, hand position and weight distribution, while preserving the garment story and all canonical layers.

`06` means a soft left profile / slight three-quarter catalogue view, not a rigid orthographic side cut, another front pose, or a labelled panel.

## D. Generate view 07 — sibling branch

Precondition: current garment `05` is accepted and locked. `06` is not a precondition.

Starting reference palette:

```text
accepted current-garment 05
+ complete real-face operation board
+ dedicated BACK body canon
+ direct real-Lulu angle contact
+ locked atelier plate
```

Do not use `06` as a parent.

This authority core is mandatory, while reference ordering and truth-preserving packaging remain adaptive. Do not replace the BACK crop or direct real-body evidence with a generic translation image. If no direct garment-back capture exists, rear construction remains conservative inferred presentation and can never become direct evidence.

Before invocation, complete `renderQualityContract` and run `npm run atelier:verify:operation -- <operation-json>`. Judge likeness, head-to-toe body realism, attitude, presence, pose, garment truth, skin and material texture, natural optics and scene integration together.

After generation, record separate `renderQualityReview` PASS/FAIL results for photographic realism, skin texture, garment texture, lighting integration, optics/perspective and artifact rejection before claiming gate pass.

Mutable layer: view-specific pose, head turn, shoulder openness, hand position and weight distribution, while preserving the garment story and all canonical layers.

`07` means full-body RIGHT REAR 3Q with enough look-back to preserve identity. It is not a complete back view.

## E. Local correction

Use this path when the user asks to fix one element.

1. Name the failing layer.
2. Name the exact accepted parent.
3. List the mutable region/property.
4. List every immutable layer.
5. Confirm the tool can actually isolate the edit.
6. Change one variable and allow at most one bounded correction for that candidate.
7. If isolation is unavailable or the correction fails, stop and reject the candidate. Do not perform a full regeneration and call it a local correction.

Example:

```yaml
operation_id: g004-v05-icon-r001
change_set:
  - wall-icon pixels only
immutable_set:
  - identity
  - body
  - garment
  - pose
  - camera
  - atelier outside icon region
  - lighting
  - accessories
  - output dimensions
```

## F. Semantic export mapping

Use semantic roles as the source of truth:

```text
01 GARMENT_FRONT
02 GARMENT_BACK
03 MANNEQUIN_FRONT
04 FABRIC_DETAIL
05 MODEL_FRONT
06 MODEL_LEFT_PROFILE
07 MODEL_REAR_THREE_QUARTER
```

Historical Shop filenames differ: model front was `04`, model rear three-quarter was `05`, fabric detail was `06`, and model left profile was `07`. Before database sync or public export, map by semantic role rather than copying numeric slots.

After all seven private views are user-accepted and locked, use the deterministic exporter:

```bash
npm run atelier:export:shop-media -- \
  --garment 009 \
  --slug black-cropped-tee-charcoal-cutoff-shorts-set

# After inspecting the dry-run plan:
npm run atelier:export:shop-media -- \
  --garment 009 \
  --slug black-cropped-tee-charcoal-cutoff-shorts-set \
  --write
```

The exporter refuses incomplete locks and mismatched private hashes. It uses one isotropic contain scale, never a forced width/height resize, then fills the `1120×1400` Shop canvas with a softened same-image edge extension. This preserves Lulu's body proportions and prevents the horizontal stretching previously corrected on Garment 007. Record the seven output hashes and dimensions in a private export operation before Blob sync.

## G. Packaging

After 05, 06, and 07 pass:

1. Export three separate clean full-resolution images.
2. Optionally create a contact sheet only as a secondary diagnostic artifact.
3. Generate a packet manifest with SHA-256 hashes.
4. Record authority lineage and accepted operation IDs.
5. Mark the garment `PACKETED` in state.
6. Never place rejected candidates in the packet.

For every generation—not only the final packet—write a private operation record before moving on. It must contain the exact prompt verbatim, ordered reference stack and per-slot roles, exclusions, tool/mode, generated source path when available, durable workspace path, dimensions, bytes and SHA-256. Add independent review and the user's exact acceptance/rejection statement. Summaries are useful indexes but never replace the verbatim prompt. Each correction keeps its own prompt and output history; never overwrite the recipe for a strong generation.

## H. Operation template

```yaml
operation_id: g004-v07-r001
garment_id: "004"
view: "07"
status: READY
parent_assets:
  - garment.004.front-a
  - garment.004.front-b
  - garment.004.full
  - garment.004.view.05.accepted
  - lulu.face.real.primary
  - lulu.face.real.v4.raw-frontal-closeup-eyes-closed
  - lulu.face.real.v4.raw-three-quarter-open-eyes
  - lulu.face.real.v4.front-lock
  - lulu.body.real.angle-contact.v4
  - lulu.body.canon.v4
  - lulu.body.canon.v4.three-view
  - juw.atelier.empty-plate.v1
  - view.07.pose
# An accepted 004/06 is intentionally absent.
authority_stack:
  garment:
    - garment.004.front-a
    - garment.004.front-b
    - garment.004.full
  identity:
    - lulu.face.real.primary
    - lulu.face.real.v4.raw-frontal-closeup-eyes-closed
    - lulu.face.real.v4.raw-three-quarter-open-eyes
    - lulu.face.real.v4.front-lock
    - garment.004.view.05.accepted
  body:
    - lulu.body.real.angle-contact.v4
    - lulu.body.canon.v4
    - lulu.body.canon.v4.three-view
  atelier:
    - juw.atelier.empty-plate.v1
  brand:
    - juw.icon.canonical
  pose:
    - view.07.right-rear-3q
change_set:
  - create independent 07 sibling view
immutable_set:
  - identity
  - body
  - garment construction
  - atelier
  - wall icon
  - camera family
  - lighting
output_contract:
  - one clean full-body image
  - no text
  - no labels
  - no triptych
fashionNovaCheck:
  operationId: g004-fashion-nova-styling-check-v001
  publisher: Fashion Nova
  officialUrl: https://www.fashionnova.com/products/<closest-current-garment-family>
  resolvedOfficialUrl: https://www.fashionnova.com/products/<resolved-current-garment-family>
  pageTitle: <official live page title>
  accessedOn: YYYY-MM-DD
  matchedGarmentFacts:
    - <evidence-backed garment-family match>
  decision: "KEEP | REFINE | REPLACE | NO_CLOSE_MATCH"
  noCloseMatchReason: <required only for NO_CLOSE_MATCH>
  selectedStylingDirection: <bounded footwear/accessory decision>
  authority: ADVISORY_STYLING_ONLY
  passedAsImageReference: false
renderQualityContract:
  photographicRealism: one coherent natural catalogue photograph
  skinTexture: natural pores, tonal variation and highlight rolloff
  garmentTexture: source-supported surface, folds, tension, drape and sheen only
  lightingIntegration: shared light field, contact shadow and material response
  opticsPerspective: level natural perspective with preserved stature
  artifactRejection:
    - plastic or poreless skin
    - pasted texture or uniform noise
    - cutout halos, synthetic HDR or CGI sheen
failure_gates:
  - identity drift
  - body drift
  - garment redesign
  - atelier drift
  - icon mutation
  - wrong view
  - cropped or malformed body
prompt_verbatim: |-
  <exact submitted prompt, without paraphrase>
generation_tool: built-in-imagegen
output_path: storage/garments/drop-02/NNN/candidates/...
output_sha256: <sha256>
renderQualityReview:
  photographicRealism: "PASS | FAIL"
  skinTexture: "PASS | FAIL"
  garmentTexture: "PASS | FAIL"
  lightingIntegration: "PASS | FAIL"
  opticsPerspective: "PASS | FAIL"
  artifactRejection: "PASS | FAIL"
```
