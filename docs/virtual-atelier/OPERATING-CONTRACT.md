# Virtual Atelier operating contract

This is the normative contract for JUW model-reference generation. When another document conflicts with this file, this file and `state/current.json` govern.

## 0. Canonical production hierarchy

Every garment follows this exact order:

```text
GARMENT INTAKE
→ REAL FACE AUTHORITY
→ BODY CANON
→ FASHION NOVA ACCESSORY STYLING CHECK
→ LOCKED ROOM
→ 05 FRONT MASTER
→ 06 OR 07 AS INDEPENDENT SIBLING VIEWS
```

The garment ID is the first input to the main flow. It resolves the garment construction before identity, body, room or view generation begins.

`05` is the front translation master for the current garment.

`06` and `07` are sibling branches from the accepted `05`:

```text
                    ┌→ 06
GARMENT→FACE→BODY→ROOM→05
                    └→ 07
```

Neither sibling may parent the other. `06 → 07` and `07 → 06` are forbidden production lineages. An accepted sibling may be inspected later for collection coherence, but it has no generation authority over the other sibling.

Within the five-reference image-generation boundary, the identity/body/room core for sibling generation is mandatory:

- accepted current-garment `05` as sole visual parent
- the complete real-face operation board
- dedicated SIDE body canon for `06`, or dedicated BACK body canon for `07`
- direct real-Lulu angle contact
- the exact locked room

These authority roles are mandatory; their ordering and any truth-preserving packaged reference are adaptive. The validator checks membership and lineage, while human review decides whether the resulting frame is realistic.

Do not drop an angle-specific body crop to make room for a weaker translation convenience. Current-garment construction remains controlled by accepted `05`; unknown side or rear construction stays unknown. If a new garment exposes a direct angle-specific construction fact that cannot fit this boundary, stop and resolve a truthful packaged authority or a declared garment-only pass before model generation.

The final governing gate is holistic: real Lulu head to toe, convincing facial semblance, believable body balance, attitude, presence, pose, garment truth, and natural integration into the scene.

### Photographic realism and texture gate

Every `05`, `06`, and `07` operation must declare a `renderQualityContract` before invocation and pass it during whole-frame review. The post-generation record must also contain a separate `renderQualityReview` result for each category; a combined anatomy/room summary cannot substitute. It covers:

- **skin:** natural pores and microtexture, restrained tonal variation and believable highlight rolloff; no waxy, poreless, airbrushed or plastic face/body rendering
- **garment surface:** only source-supported texture, weave impression, wash, wear, fraying, stitching, folds, tension, drape and sheen; do not invent fibre or material facts
- **lighting integration:** Lulu, garment, footwear, floor and room share one plausible light field, colour temperature, contact shadow and material response
- **optics and scale:** level natural catalogue camera, believable focal-length perspective, preserved stature and no wide-angle body distortion or non-uniform scaling
- **artifact rejection:** no pasted texture, uniform noise overlay, haloed edges, over-sharpening, synthetic HDR, CGI sheen, beauty-filter smoothing or room/subject cutout appearance

Texture is judged as material behaviour, not added grit. A sharp image can still fail realism; a softly rendered image can pass when skin, cloth, light, depth and room integration remain photographic and garment-faithful.

### Fashion Nova accessory styling check

Footwear and restrained accessories are resolved after identity and body pass but before every room/`05` operation. Inspect a current official Fashion Nova product or collection styling page for the same or closest proven garment family and record the requested URL, resolved canonical URL, page title, access date, matched garment facts, selected direction, and resulting styling decision in the private operation record. If no sufficiently close garment family exists, record `NO_CLOSE_MATCH`, preserve an empty match list, write the search/no-match reason, and retain the strongest garment-faithful JUW styling rather than forcing an unrelated trend.

Fashion Nova is advisory styling evidence only. It may control footwear or accessory direction; it has zero authority over garment construction, Lulu's identity or body, hair, pose, room, brand icon, camera, or lighting. Never place a Fashion Nova page, screenshot, image, URL or page asset in `referenceStack` or `authorityStack`; generation receives only the concise recorded JUW styling decision. Never imply that the JUW garment is a Fashion Nova product.

The check may conclude `KEEP`, `REFINE`, `REPLACE`, or `NO_CLOSE_MATCH`. The final `05` whole-frame review decides whether the styling works on Lulu in the locked atelier. This check is mandatory for `05`; it does not recur for `06` or `07`, which inherit the accepted `05` styling unless the user explicitly unlocks it.

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

Public derivatives must preserve the locked master's aspect ratio. Never force a private portrait into the Shop frame by independently resizing width and height. Use the checked-in semantic exporter only after `01–07` are accepted and locked; it contains the intact source with one isotropic scale and fills any remaining `1120×1400` canvas area from a softened copy of that same image. Private masters remain immutable and authoritative.

## 2. Immutable-state rule

Once a layer passes human review, it is immutable until the user explicitly unlocks that layer.

Examples:

- Fixing the face may not regenerate body, garment, atelier, icon, pose, or lighting.
- Fixing the icon may not regenerate Lulu or the room.
- Creating `06` changes the view-specific pose after `05` passes and may use the side crop or combined body control according to which gives the more realistic complete frame.
- Creating `07` changes the view-specific pose after `05` passes and may use the back crop or combined body control; an inferred back guide never becomes direct evidence, and `06` is not its parent or precondition.
- A garment detail correction may not restyle the garment or change accessories.

If the available tool cannot isolate the requested change, stop and disclose the limitation before generation. Do not simulate a local edit with a full-scene synthesis while calling the other layers “locked.”

Each candidate receives at most one bounded correction with one changed variable. If that correction fails, reject the candidate and begin a new declared operation rather than accumulating invisible drift.

### Holistic subject synthesis and rebase

The pixel-preservation rule above applies to a declared local correction. It does not forbid a deliberately declared **holistic subject synthesis** whose purpose is to resolve face, body, garment fit, hair, pose, hands, footwear, and neutral staging into one new full-frame subject master.

Use this mode only when all of the following are true:

1. the garment front and body target have already been explicitly accepted;
2. the complete independent real-face authority stack is present;
3. the operation is declared as `HOLISTIC_SUBJECT_SYNTHESIS`, not a local face edit;
4. the user reviews the entire frame, not only the face; and
5. the accepted output is rebased as a new garment-specific subject lock.

For a five-image generation boundary, the established two-pass recipe is:

```text
PASS A
accepted body target
+ F01–F10 real-face contact
+ raw frontal morphology
+ raw open-eye three-quarter geometry
+ approved V4 translation lock
→ face-translated full-frame candidate

PASS B — one bounded correction
accepted body target
+ PASS A candidate as translation donor
+ F01–F10 real-face contact
+ raw frontal morphology
+ raw open-eye three-quarter geometry
→ review candidate
```

The contact sheet includes the real polished frontal lock, so its separate crop is represented without displacing an independent authority input. Hair remains unchanged unless the user explicitly unlocks it.

Human approval of PASS B supersedes automated pixel-difference objections for that holistic operation because the user is accepting the entire newly synthesized frame. The accepted frame then becomes immutable. Downstream ROOM/`05` work must parent that exact subject lock and may not return to PASS A, the earlier body target, or a rejected correction as the visual parent.

The subject lock does not waive the garment-set gate. Complete and approve `01–04` before composing the subject into the locked room. The subject lock may parent only the current garment's ROOM/final-`05` operation; it does not directly parent `06` or `07`. Only the accepted room-composited `05` may parent those sibling views.

If the user explicitly accepts every subject layer except footwear or another named accessory, record a `SUBJECT_CORE_LOCK` rather than claiming whole-frame acceptance. The exact subject pixels may parent ROOM/`05`, but the deferred accessory is excluded from its authority and must be the only person-layer change declared for the styling/ROOM/`05` operation. The final `05` requires whole-frame approval and closes the deferred styling decision. Identity, body, garment, hair, pose, hands, and framing remain immutable throughout that operation.

This exception never converts a generated subject lock into direct identity or garment evidence. Real face photographs and direct garment captures retain higher truth authority.

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
fashionNovaCheck:
  operationId: ""
  publisher: "Fashion Nova"
  officialUrl: ""
  resolvedOfficialUrl: ""
  pageTitle: ""
  accessedOn: "YYYY-MM-DD"
  matchedGarmentFacts: []
  decision: "KEEP | REFINE | REPLACE | NO_CLOSE_MATCH"
  noCloseMatchReason: "required only for NO_CLOSE_MATCH"
  selectedStylingDirection: ""
  authority: "ADVISORY_STYLING_ONLY"
  passedAsImageReference: false
renderQualityContract:
  photographicRealism: ""
  skinTexture: ""
  garmentTexture: ""
  lightingIntegration: ""
  opticsPerspective: ""
  artifactRejection: []
renderQualityReview:
  photographicRealism: "PASS | FAIL"
  skinTexture: "PASS | FAIL"
  garmentTexture: "PASS | FAIL"
  lightingIntegration: "PASS | FAIL"
  opticsPerspective: "PASS | FAIL"
  artifactRejection: "PASS | FAIL"
failure_gates: []
prompt_verbatim: ""
generation_tool: ""
output_path: ""
output_sha256: ""
```

No operation proceeds with unresolved required assets or an incomplete `renderQualityContract`. A `05` operation also requires a complete `fashionNovaCheck`. Before any `05`, `06`, or `07` invocation, run the checked-in operation validator and record its pass:

```bash
npm run atelier:verify:operation -- storage/garments/drop-02/NNN/operations/<operation>.json
```

Every executed operation must persist the exact prompt verbatim—not only a summary—together with the ordered reference paths, slot roles, exclusions, tool/mode, generated source path when available, durable workspace output path, dimensions, byte size and SHA-256. Record every bounded correction as its own operation/prompt, and record independent review plus the user's exact acceptance or rejection statement. A useful or accepted generation without this reproduction record is incomplete and may not become canon.

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

Evaluate profile and rear continuity as the connected relationship from torso through waist, pelvis, hip, rear contour and upper thigh. Normalize for pose, heel height, garment stiffness, camera distance and perspective. Passing the immediately preceding garment is insufficient: compare with direct real body evidence and the approved multi-era drift baseline defined in `docs/virtual-atelier/MODUS-OPERANDI.md`.

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

### Photographic realism and texture gate

Skin, garment, footwear and room read as one photograph. Natural skin detail remains visible; garment wash, folds, tension, fraying, stitching, drape and sheen follow the garment evidence and pose; lighting and contact shadows agree across the frame; perspective preserves Lulu's stature. Reject poreless or waxy skin, invented material texture, pasted detail, halos, synthetic HDR, CGI sheen, excessive smoothing or sharpening, and any cutout-like room integration.

A model-view operation may not claim `GATE_PASS`, `ACCEPTED` or `LOCKED` until every named `renderQualityReview` result is recorded as `PASS`. A failure in any gate rejects the candidate.

### Semantic-role drift gate

View 03 fails if it reconstructs the private source environment rather than presenting an anonymous neutral mannequin. View 04 fails if it becomes a duplicate full-front hero rather than a close visible-detail presentation. Views 02 and 07 may not be promoted from inferred presentation to construction evidence without direct rear authority.

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
