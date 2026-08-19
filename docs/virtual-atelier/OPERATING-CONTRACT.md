# Virtual Atelier operating contract

This is the normative contract for JUW model-reference generation. When another document conflicts with this file, this file and `state/current.json` govern.

## 1. Authority layers

### Identity

Primary authority: real Lulu face material.

Controls facial width, cheek fullness, lower-face breadth, jaw/chin taper, nose geometry, lip geometry, eye relationship, complexion, hairline, natural asymmetry, and skin texture.

Accepted generated JUW faces are secondary translation references only. They show how Lulu has previously translated into JUW catalogue photography; they may not override the real identity.

### Body

Primary authority: approved Lulu V4 body canon and real multi-angle body material.

Controls torso-to-leg ratio, shoulder and arm volume, bust, waist position, waist-to-hip transition, hip breadth, upper-thigh volume, glute shape/projection, overall stature, and natural posture.

Do not convert the canon into prose such as “make her curvier.” Use the canon as geometry. Do not enlarge one characteristic at the expense of proportional balance.

### JUW translation lineage

Accepted Garments 001, 002, and 003 demonstrate the catalogue's stable photographic family: recognizable Lulu, body balance, camera distance, posture, lighting, accessories, and room composition across different garments.

These are consensus examples, not substitutes for the real identity or body canon.

### Atelier

The atelier is a locked environment:

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

### Garment

Current garment evidence controls:

- garment construction
- neckline
- sleeve/strap structure
- seams and panels
- waist placement
- hem and length
- fabric behavior
- color and surface details

Garment evidence has zero authority over Lulu, her body, the room, the plaque, camera, pose, styling, or lighting unless the operation declaration explicitly grants it.

### View grammar

- `05` — clean full-body FRONT MASTER
- `06` — clean full-body LEFT PROFILE
- `07` — clean full-body RIGHT REAR 3Q with look-back where established; never a complete back view

A view number is a production instruction, not a label to render into the image.

## 2. Immutable-state rule

Once a layer passes human review, it is immutable until the user explicitly unlocks that layer.

Examples:

- Fixing the face may not regenerate body, garment, atelier, icon, pose, or lighting.
- Fixing the icon may not regenerate Lulu or the room.
- Creating `06` changes pose/angle only after `05` passes.
- A garment detail correction may not restyle the garment or change accessories.

If the available tool cannot isolate the requested change, stop and disclose the limitation before generation. Do not simulate a local edit with a full-scene synthesis while calling the other layers “locked.”

## 3. Operation declaration

Before execution, resolve:

```yaml
operation_id: gNNN-vVV-rNNN
garment_id: NNN
view: "05 | 06 | 07"
parent_assets: []
authority_stack:
  identity: []
  body: []
  translation: []
  atelier: []
  brand: []
  garment: []
  pose: []
change_set: []
immutable_set: []
output_contract: []
failure_gates: []
```

No operation proceeds with unresolved required assets.

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

### Identity gate

Immediately reads as Lulu. No generic editorial substitution, facial narrowing, beautification, ethnicity drift, complexion drift, or age drift.

### Body gate

Matches the canon as a balanced whole. No elongated torso, reduced thighs, caricatured waist, isolated glute exaggeration, inflated arms, or runway-model reinterpretation.

### Garment gate

Construction matches the garment authority. No simplification, redesign, recoloring, couture upgrade, or mannequin-room inheritance.

### Atelier gate

Same JUW set, not a newly generated interpretation of a warm boutique.

### Brand gate

Exact standalone canonical icon only.

### View gate

The requested 05/06/07 grammar is unambiguous and complete.

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

Provenance remains one of:

- `DIRECT_CAPTURE`
- `DERIVED_FROM_DIRECT`
- `MODEL_REFERENCE`

Human approval changes status and role, not provenance.
