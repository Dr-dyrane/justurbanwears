# Virtual Atelier operating contract

This is the normative contract for JUW model-reference generation. When another document conflicts with this file, this file and `state/current.json` govern.

## 0. Canonical production hierarchy

Every garment follows this exact order:

```text
GARMENT INTAKE
→ REAL FACE AUTHORITY
→ BODY CANON
→ LOCKED ROOM
→ 05 FRONT MASTER
→ 06 OR 07 AS INDEPENDENT SIBLING VIEWS
```

The garment ID is the first input to the main flow. It resolves the garment construction before identity, body, room or view generation begins.

`05` is the front translation master for the current garment.

`06` and `07` are sibling branches from the accepted `05` and the same canonical stack:

```text
                    ┌→ 06
GARMENT→FACE→BODY→ROOM→05
                    └→ 07
```

Neither sibling may parent the other. `06 → 07` and `07 → 06` are forbidden production lineages. An accepted sibling may be inspected later for collection coherence, but it has no generation authority over the other sibling.

The authority gates are sequential:

```text
face fails                         → stop before body
face passes, body fails            → preserve face; correct body only
face and body pass, room fails      → preserve Lulu; correct room only
face, body and room pass            → create or lock the garment view
```

Later stages may not rewrite an earlier accepted gate.

## 1. Authority layers

### Garment intake

The current garment evidence is resolved first and controls:

- garment identity and ID
- construction
- neckline
- sleeve/strap structure
- seams and panels
- waist placement
- hem and length
- fabric behavior
- color and surface details

For example, `004` always means the same long black gown with the white folded neckline. A change of view does not create a new garment.

Garment evidence has zero authority over Lulu, her body, the room, the plaque, camera, pose, styling, or lighting unless the operation declaration explicitly grants it.

### Identity

Primary authority: real Lulu face material.

Controls facial width, cheek fullness, lower-face breadth, jaw/chin taper, nose geometry, lip geometry, eye relationship, complexion, hairline, natural asymmetry, and skin texture.

The V4 face packet has four evidence layers:

1. `FACE_PRIMARY_CONTACT.jpg` — verified F01–F10 multi-angle identity invariance across natural, polished, frontal and three-quarter images.
2. The recovered pre-001 raw frontal and open-eye three-quarter photographs — morphology, depth, complexion and natural feature relationships.
3. `LULU_V4_FACE_FRONT_LOCK.png` — a real-photo frontal geometry and polished-styling lock.
4. Accepted `001/05` and `004/05` — JUW translation guidance only.

The close frontal photograph has closed eyes and strong near-camera perspective. It controls brows, nose, lips, cheek fullness, texture and complexion, but not open-eye geometry or total head proportions. The open-eye three-quarter photograph and contact sheet control those relationships.

Accepted generated JUW faces are secondary translation references only. They show how Lulu has previously translated into JUW catalogue photography; they may not override the real identity. V3 remains a legacy comparison, not active V4 facial authority. Any new neutral V4 face lock remains a review candidate until the user explicitly approves it.

### Body

Primary authority: approved Lulu V4 body canon and real multi-angle body material.

Controls torso-to-leg ratio, shoulder and arm volume, bust, waist position, waist-to-hip transition, hip breadth, upper-thigh volume, glute shape/projection, overall stature, and natural posture.

Real Lulu photographs remain body evidence truth. `LULU_V4_BODY_CANON_SOURCE.png` and `LULU_V4_BODY_THREE_VIEW_CANON.png` are user-approved modeled silhouette and garment-transfer controls, not verified measurements or direct photographic identity evidence. The front/side/back crop files are operational slices of the three-view plate, not independent authorities. Printed height or weight on any source card must not enter canon metadata.

Do not convert the canon into prose such as “make her curvier.” Use the approved plate as a balanced geometric control. Do not enlarge one characteristic at the expense of proportional balance.

### Atelier

The atelier is a locked environment and permanent building:

- warm cream/beige wall
- restrained warm directional light with natural falloff
- one ceramic vase and restrained dried branches at left
- one small standalone coral JUW icon plaque in the upper-left zone
- slim brass rail at right
- sparse black, cream, taupe, and rust garments on wooden hangers
- one rounded cream ottoman at lower right
- neutral floor and rug relationship
- generous negative space

The atelier is not “a boutique aesthetic.” It is a specific recurring set. No new architecture, extra props, wordmarks, mirrors, bright showroom lighting, second vase, or rail restaging.

### Brand icon

The wall plaque contains the exact standalone JUW icon only:

- two mirrored coral wardrobe panels
- central female/hourglass negative space
- two lower `L` forms

Forbidden on the wall: `justurban`, `wears`, `BY LULU`, `JUW`, `JW`, circles, triangles, altered lower cutouts, substituted silhouettes, or any approximate lettering.

Brand campaign references control brand geometry only. They do not control room composition or permit a full lockup on the wall.

### JUW translation lineage

Accepted Garments 001, 002, and 003 demonstrate the catalogue's stable photographic family: recognizable Lulu, body balance, camera distance, posture, lighting, accessories, and room composition across different garments.

Garment `001/05` was the precursor method. It combined one generated polished identity/body anchor with three real garment references, the two recovered raw face photographs, and four real silhouette references. That anchor remains historical translation/body guidance only; it is not real-person evidence. Garment `004/05` refined the method into explicit `GARMENT → FACE GATE → BODY GATE → ROOM GATE`, which is now canonical because each accepted stage can be preserved while the next stage is corrected.

For the active garment, accepted `05` is the garment-specific front translation master.

Accepted `06` and `07` remain sibling outputs. Neither is a translation authority for generating the other.

### View grammar

- `05` — clean full-body FRONT MASTER
- `06` — clean full-body SOFT LEFT PROFILE / SLIGHT 3Q
- `07` — clean full-body RIGHT REAR 3Q with look-back where established; never a complete back view

A view number is a production instruction, not a label to render into the image.

### Semantic media roles

Working production slots use:

| Slot | Semantic role |
| --- | --- |
| `01` | `GARMENT_FRONT` |
| `02` | `GARMENT_BACK` |
| `03` | `MANNEQUIN_FRONT` |
| `04` | `FABRIC_DETAIL` |
| `05` | `MODEL_FRONT` |
| `06` | `MODEL_LEFT_PROFILE` |
| `07` | `MODEL_REAR_THREE_QUARTER` |

Historical Drop 01 Shop filenames used `04` for model front, `05` for model rear three-quarter, `06` for fabric detail, and `07` for model left profile. Numeric positions are therefore not authority. Database sync and public export must map by semantic role, never by number alone.

## 2. Immutable-state rule

Once a layer passes human review, it is immutable until the user explicitly unlocks that layer.

Examples:

- Fixing the face may not regenerate body, garment, atelier, icon, pose, or lighting.
- Fixing the icon may not regenerate Lulu or the room.
- Creating `06` changes only the view-specific pose after `05` passes.
- Creating `07` changes only the view-specific pose after `05` passes; `06` is not its parent or precondition.
- A garment detail correction may not restyle the garment or change accessories.

If the available tool cannot isolate the requested change, stop and disclose the limitation before generation. Do not simulate a local edit with a full-scene synthesis while calling the other layers “locked.”

Each candidate receives at most one bounded correction with one changed variable. If that correction fails, reject the candidate and begin a new declared operation rather than accumulating invisible drift.

## 3. Operation declaration

Before execution, resolve:

```yaml
operation_id: gNNN-vVV-rNNN
garment_id: NNN
view: "05 | 06 | 07"
parent_assets: []
authority_stack:
  garment: []
  identity: []
  body: []
  translation: []
  atelier: []
  brand: []
  pose: []
change_set: []
immutable_set: []
output_contract: []
failure_gates: []
```

No operation proceeds with unresolved required assets.

For `06` and `07`, the sibling view must not appear in `parent_assets` or any authority list.

## 4. Output contract

Default output is exactly one clean full-resolution image.

Unless the user explicitly requests otherwise:

- no triptych
- no contact sheet
- no labels or view numbers
- no footer
- no measurements
- no model card
- no text overlay
- no presentation board
- no crop that removes any part of the required full-body frame

## 5. Acceptance gates

An output passes only if all applicable gates pass simultaneously.

### Garment gate

Construction matches the garment authority. No simplification, redesign, recoloring, couture upgrade, or mannequin-room inheritance.

### Identity gate

Immediately reads as Lulu. No generic editorial substitution, facial narrowing, beautification, ethnicity drift, complexion drift, or age drift.

### Body gate

Matches the canon as a balanced whole. No elongated torso, reduced thighs, caricatured waist, isolated glute exaggeration, inflated arms, or runway-model reinterpretation.

### Atelier gate

Same locked JUW room, not a newly generated interpretation of a warm boutique.

### Brand gate

Exact standalone canonical icon only.

### View gate

The requested 05/06/07 grammar is unambiguous and complete.

### Lineage gate

`06` and `07` must each descend from `05` and the canonical stack, never from each other.

### Format gate

One clean full image with no unrequested text, labels, panels, or crops.

A failure in any gate rejects the candidate.

## 6. State transitions

```text
DRAFT
→ READY
→ GENERATED
→ REVIEW
→ ACCEPTED → LOCKED → PACKETED
          ↘ REJECTED
```

Rejected assets never become parents. Acceptance and rejection must be written to `state/current.json` before another operation begins.

## 7. Privacy and provenance

Real identity and body material is private. Never commit it to this public repository.

The private operational authority is recorded in `storage/models/konan/canon/v4/authority-manifest.json`. Its pixels and manifest remain gitignored; this public contract records only logical roles and verified hashes.

Provenance remains one of:

- `DIRECT_CAPTURE`
- `DERIVED_FROM_DIRECT`
- `MODEL_REFERENCE`

Human approval changes status and role, not provenance.
