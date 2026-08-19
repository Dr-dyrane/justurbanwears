# Virtual Atelier runbook

## A. Start or restart a garment

1. Read `AGENTS.md`, `OPERATING-CONTRACT.md`, `state/current.json`, the garment brief, and `assets/current.json`.
2. Confirm every required logical asset is `available` and the actual operation can see it.
3. Create the operation declaration.
4. Start with one clean `05 FRONT MASTER` only.
5. Do not discuss or generate `06` or `07` until `05` is accepted.
6. Review the candidate against every acceptance gate.
7. Record `ACCEPTED` or `REJECTED` in state before proceeding.

## B. Generate view 05

Required authority stack:

```text
real face authority
+ body canon
+ accepted 001/002/003 translation lineage
+ locked atelier
+ canonical standalone icon
+ current garment evidence
+ 05 front-view grammar
```

Mutable layer: garment only, unless the current state explicitly says the model baseline itself is being rebuilt.

Default output: one clean full-body image, no labels or composite layout.

## C. Derive view 06

Precondition: current garment `05` is accepted and locked.

Required authority stack:

```text
accepted current-garment 05
+ accepted 06 pose/body authority
+ real side-body canon
+ locked global layers
```

Mutable layer: pose/angle only.

`06` means strict full-body LEFT PROFILE. It is not another front pose, a three-quarter front, or a labelled panel.

## D. Derive view 07

Precondition: current garment `05` and `06` are accepted and locked.

Required authority stack:

```text
accepted current-garment 05 and 06
+ accepted 07 pose authority
+ real rear/three-quarter body canon
+ locked global layers
```

Mutable layer: pose/angle only.

`07` means full-body RIGHT REAR 3Q. It is not a complete back view.

## E. Local correction

Use this path when the user asks to fix one element.

1. Name the failing layer.
2. Name the exact accepted parent.
3. List the mutable region/property.
4. List every immutable layer.
5. Confirm the tool can actually isolate the edit.
6. If isolation is unavailable, stop. Do not perform a full regeneration and call it a local correction.

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

## F. Packaging

After 05, 06, and 07 pass:

1. Export three separate clean full-resolution images.
2. Optionally create a contact sheet only as a secondary diagnostic artifact.
3. Generate a packet manifest with SHA-256 hashes.
4. Record authority lineage and accepted operation IDs.
5. Mark the garment `PACKETED` in state.
6. Never place rejected candidates in the packet.

## G. Operation template

```yaml
operation_id: g004-v05-r001
garment_id: "004"
view: "05"
status: READY
parent_assets:
  - translation.g001.05
  - translation.g002.05
  - translation.g003.05
authority_stack:
  identity:
    - lulu.face.real.primary
    - lulu.face.real.contact
  body:
    - lulu.body.canon.v4
  translation:
    - translation.g001.05
    - translation.g002.05
    - translation.g003.05
  atelier:
    - juw.atelier.canon
  brand:
    - juw.icon.canonical
  garment:
    - garment.004.front-a
    - garment.004.front-b
    - garment.004.full
  pose:
    - view.05.front
change_set:
  - garment transfer
immutable_set:
  - identity
  - body
  - atelier
  - wall icon
  - camera
  - lighting
  - 05 pose
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
  - cropped body
```
