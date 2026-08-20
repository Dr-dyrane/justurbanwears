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
→ LOCKED ROOM
→ 05 FRONT MASTER
→ 06 OR 07 AS INDEPENDENT SIBLING VIEWS
```

The garment ID is the first input to the flow. For example, `004` always resolves to the same black floor-length gown with the white folded neckline.

`06` and `07` are sibling outputs. They both branch from the accepted `05` plus the canonical garment, face, body, room and their own pose grammar.

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

## B. Generate view 05

Required authority stack:

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

Default output: one clean full-body image, no labels or composite layout.

## C. Generate view 06 — sibling branch

Precondition: current garment `05` is accepted and locked.

Required authority stack:

```text
current garment intake
+ real face authority
+ body canon
+ locked atelier plate
+ accepted current-garment 05
+ accepted 06 pose grammar
```

Do not use `07` as a parent.

Mutable layer: view-specific pose, chin angle, shoulder openness, hand position and weight distribution, while preserving the garment story and all canonical layers.

`06` means a soft left profile / slight three-quarter catalogue view, not a rigid orthographic side cut, another front pose, or a labelled panel.

## D. Generate view 07 — sibling branch

Precondition: current garment `05` is accepted and locked. `06` is not a precondition.

Required authority stack:

```text
current garment intake
+ real face authority
+ body canon
+ locked atelier plate
+ accepted current-garment 05
+ accepted 07 pose grammar
```

Do not use `06` as a parent.

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

## G. Packaging

After 05, 06, and 07 pass:

1. Export three separate clean full-resolution images.
2. Optionally create a contact sheet only as a secondary diagnostic artifact.
3. Generate a packet manifest with SHA-256 hashes.
4. Record authority lineage and accepted operation IDs.
5. Mark the garment `PACKETED` in state.
6. Never place rejected candidates in the packet.

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
failure_gates:
  - identity drift
  - body drift
  - garment redesign
  - atelier drift
  - icon mutation
  - wrong view
  - cropped or malformed body
```
