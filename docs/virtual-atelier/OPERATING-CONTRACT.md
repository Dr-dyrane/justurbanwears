# Virtual Atelier operating contract

This is the normative contract for JUW model-reference generation. When another document conflicts with this file, this file and `state/current.json` govern.

## 0. Canonical production hierarchy

Every garment follows this exact order:

```text
GARMENT INTAKE
→ INDEPENDENT 01 + 02 + 03 + 04 LOCKS
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

These authority roles are mandatory; their ordering and any truth-preserving packaged reference are adaptive. The validator checks membership and lineage, closed semantic QA runs first, and subsequent human review decides whether a passing frame should be kept.

Final-scene canvas compatibility is profile-bound, not a loose percentage
tolerance. The provider still returns one exact 1024x1536 transparent subject.
The locked room may be exact 1024x1536, or the approved 1024x1280 native 4:5
profile may copy the central `x=0,y=128,w=1024,h=1280` subject window one-to-one
over unchanged room bytes. Under the 4:5 profile, all nonzero alpha must remain
inside the additional 16-pixel inner guard (`x=16..1007`, `y=144..1391`). Any
visible spill fails before disclosure; the engine never resizes the room,
interpolates the retained subject, or silently crops Lulu.

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
garment fails                              → stop before face
garment passes, face fails                 → preserve garment; stop before body
garment and face pass, body fails          → preserve garment + face; correct body only
garment, face and body pass, room authority fails
                                            → hard block; do not spend to invent/fix authority
room authority passes, final integration fails
                                            → one stage-safe bounded correction or block
all applicable gates pass                  → reveal exact bytes for human review
```

Later stages may not rewrite an earlier accepted gate. Reveal is not lock:
only the user's subsequent `Keep` locks the exact reviewed bytes.

### Private background gate and disclosure boundary

The sequential authority gates run privately. Materialized provider bytes are
not a reviewable candidate. Studio may show progress, but it must not return an
artifact URL, image bytes, thumbnail, gallery row or `Keep` action while an
operation is `DRAFT`, `MATERIALIZED`, `TECHNICAL_PASS`, `TECHNICAL_FAIL` or
`SEMANTIC_FAIL`. This is a media-access invariant, not only a projection-shape
rule: the authenticated app-owned review-media service must refuse the bytes in
those states, then re-authorize the same operation and content-addressed
artifact after private readback before returning anything.

The private evaluator records the gates in this exact order against the exact
same artifact and the versioned multi-era audit baseline:

```text
GARMENT → FACE → BODY → ROOM → FINAL INTEGRATION
```

Every declared stage records the five positions in that order. A position the
stage contract excludes is `NOT_APPLICABLE`. If one applicable gate fails,
every later applicable gate is `NOT_EVALUATED`. It is invalid to claim a body,
room or final result after face failure, or a room/final result after body
failure. One server-derived `FIX_ONE_THING` may create one new semantic
correction operation. That correction is not an implicit retry: it has its own
operation identity and must repeat the complete gate chain. It consumes the
single correction budget for the semantic root. A second failure, an
unclassified failure or an uncertain provider outcome stops at
`BLOCKED_USER_DIRECTION` or its equivalent without another provider call.

Provider moderation is outside the semantic correction budget. Immediately
before prompt compilation and paid intent, the engine must verify a hash-bound,
server-owned safety-context receipt for the exact operation. Garment-only
stages declare no real-person output; subject and final-scene stages require a
verified adult, authorized and consented likeness, fully clothed non-sexual
retail-fashion purpose. The compiler states that factual context plainly. It
does not claim that wording can override provider policy.

An exact provider `moderation_blocked` response is not an indeterminate
dispatch. Record it as a determinate terminal no-output failure with the stable
provider code, input/output/unknown stage, allowlisted coarse categories,
request identifiers and a content-hashed private failure manifest. Produce no
artifact, QA candidate, parent or correction authorization; repeated Generate
must reuse the terminal execution without a provider call. The operator-safe
projection remains generic. Never lower moderation strictness, churn
euphemistic prompts or switch provider/model automatically; any such policy
change is a new qualified adapter revision.

Only `SEMANTIC_PASS` makes the exact private artifact reviewable;
`USER_APPROVED` and `LOCKED` retain access to that same artifact. The user's
subsequent `Keep` decision authorizes locking those exact reviewed bytes; it
does not authorize a post-review regeneration. A human `Fix one thing` is
available only when the root correction budget remains. `06`, `07`, export and
publication remain unavailable until the required parent is `LOCKED`.

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

When the private intake omits a required side or rear construction angle, a bounded reverse-image or exact-product search is required before any inferred render. An official maker or retailer page is preferred. Online evidence may become angle-specific construction authority only when distinctive visible front details establish an exact commercial match and the exact evidence is archived with its URL, access time, hash, dimensions and match basis. That authority does not transfer brand, fibre, size, care, condition, price or seller provenance, and the private source remains colour and physical-item authority. If no exact match is verified, record the search and retain conservative inferred-presentation classification. A generated inference may never substitute for this search or become direct evidence.

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

### G004 positive-target calibration boundary

G004 is a special **positive evaluation target**, not merely one label in the
multi-era anchor list. Its canonical private 05/06/07 PNG originals and packet
could not be recovered from the checkout, Git object database or recorded
71-object private Blob audit. They therefore remain unavailable and may not be
claimed as restored, presently readable, qualified or available as a live
lock. Their historical accepted/locked ledger record remains intact.

The exact already-public 1120x1400 Shop WebP derivatives are deliberately
version-locked as the separate evaluator-only revision
`g004-positive-target-shop-derivatives-2026-08-26.1` in
`g004-positive-target-calibration.v1.json`. Manifest SHA-256 is
`451368db5dd7845fc716dbb661d7bd9153297a99802f6f8f1c441babda8aa635`;
the container-plus-decoded-pixel readback receipt is
`516438224ef2117c328baffde236fb7d8e3565ea6d8477147754b6de77773dc0`.
This derivative revision does not inherit the missing originals' asset IDs and
does not alter their historical hashes.

Stage binding is exact:

- `SUBJECT_A`, `SUBJECT_B`, and `ROOM_FINAL_05` compare against derivative 05;
- `SIBLING_06` compares against derivative 06;
- `SIBLING_07_CORE` and `SIBLING_07_RECOVERY` compare against derivative 07;
- `GARMENT_01_FRONT` through `GARMENT_04_DETAIL` record G004 as
  `NOT_APPLICABLE`, because G004 predates the canonical independent 01–04 set.

Before applicable paid dispatch and again before semantic QA, the server must
read all three content-addressed containers and verify MIME, byte size,
1120x1400 geometry, SHA-256 and decoded sRGB RGBA pixel SHA-256. The evaluator
receives the candidate bytes and a fresh copy of only the stage-selected G004
target; the engine verifies that copy again after evaluation. The durable QA
event records only safe hashes, target/view, positive axes and transfer
exclusions; it never records media bytes or a storage pathname.

G004/05 may measure front camera/room family, subject scale, front grammar,
scene integration and secondary identity translation. G004/06 may measure
left-profile grammar, heel-aware stature, poise and scene integration. G004/07
may measure right-rear-three-quarter grammar, look-back poise, heel-aware
stature and scene integration. All three are subordinate to real Lulu identity
and body material and the current garment's direct evidence. They must never
become provider references, parent locks, direct identity/body/current-garment
truth or sources of garment colour, construction, jewellery, footwear or
styling. Known canonical/derivative IDs and hashes plus exact derivative decoded
pixels are denied before provider transport. The normalized full-frame visual
denial policy is separately locked as
`g004-provider-visual-denial-2026-08-26.1`, manifest SHA-256
`360cbf8ab42d7ca344c4296d87d28f112f809ce6952069ab664731044c0ad1d3`;
it also denies calibrated lossy-codec, colour, mirror, tiny-alignment and small
geometric duplicates before provider intent or dispatch. V1 does not claim
arbitrary-subimage, large-warp or untrusted-mosaic detection, so every raw
constituent is checked before an app-owned board or composite is assembled.
Neither denial manifest restores or impersonates the unavailable canonical
originals. Any G004 mismatch dominates the failure reason and blocks without
speculative correction spend, even when the same evaluation names a mutable
gate.

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

Production evaluator authority is internal and receipt-bound. A route or
composition caller may provide infrastructure implementations, but never a
technical/semantic evaluator function, evaluator descriptor or qualification
PASS declaration. The internal bundle must bind the exact six calibration-case
evidence hashes, independent-review receipt, evaluator descriptors, transparent
subject profile, native-room canvas policy, compositor revision and every
supported room-profile/stage evidence hash to one canonical qualification
receipt. No passing bundle is currently installed;
production therefore fails `QUALIFICATION_NOT_PASSED` before any evaluator,
execution intent or provider call.

Public derivatives must preserve the locked master's aspect ratio. Never force a private portrait into the Shop frame by independently resizing width and height. Use the checked-in semantic exporter only after `01–07` are accepted and locked; it contains the intact source with one isotropic scale and fills any remaining `1120×1400` canvas area from a softened copy of that same image. Private masters remain immutable and authoritative.

### Durable independent garment stages 01–04

This is the mandatory production architecture, not a deployed-cutover claim.
The durable Atelier routes and production cutover must remain held until their
authenticated repository, evaluator, review-media and migration composition
are qualified as one release atom. The existing manual Intake routes remain an
independent supported recovery lane during that transition; their availability
does not enable or disable Atelier. In the composed durable engine, views 01–04
are not handed to a separate generator. They use the same strict declaration compiler,
four-command facade, paid
claim/fence, immutable artifact ledger, private ordered QA, review decision and
lock lifecycle as subject and model stages:

| Engine stage | Result | Parent rule | Truth boundary |
| --- | --- | --- | --- |
| `GARMENT_01_FRONT` | `GARMENT_FRONT` / view `01` | no stage parent | direct visible front construction |
| `GARMENT_02_BACK` | `GARMENT_BACK` / view `02` | no stage parent | direct rear when present; otherwise quarantined inferred presentation |
| `GARMENT_03_MANNEQUIN` | `MANNEQUIN_FRONT` / view `03` | no stage parent | anonymous neutral mannequin; source environment and distinctive source mannequin have no authority |
| `GARMENT_04_DETAIL` | `FABRIC_DETAIL` / view `04` | no stage parent | close source-visible construction/material response; never fibre proof |

All four operations resolve the server-owned `DIRECT_GARMENT_EVIDENCE` stack
and garment truth. They are independent roots: an output or candidate from one
view is not a provider reference, parent or authority for another. Accepted
locks may be compared together only for set-level consistency after generation.

Subject synthesis is blocked until the same garment has exact immutable
`GARMENT_FRONT_LOCK`, `GARMENT_BACK_LOCK`, `MANNEQUIN_FRONT_LOCK` and
`FABRIC_DETAIL_LOCK` parents. The back lock retains its direct-versus-inferred
classification; locking it never upgrades inferred rear construction to direct
evidence. These are semantic recipes, not garment-number branches. Every new
garment provides data to the same four stages.

## 2. Immutable-state rule

Once a layer passes human review, it is immutable until the user explicitly unlocks that layer.

Examples:

- Fixing the face may not regenerate body, garment, atelier, icon, pose, or lighting.
- Fixing the icon may not regenerate Lulu or the room.
- Creating `06` changes the view-specific pose after `05` passes and may use the side crop or combined body control according to which gives the more realistic complete frame.
- Creating `07` changes the view-specific pose after `05` passes and may use the back crop or combined body control; an inferred back guide never becomes direct evidence, and `06` is not its parent or precondition.
- A garment detail correction may not restyle the garment or change accessories.

If the available tool cannot isolate the requested change, stop and disclose the limitation before generation. Do not simulate a local edit with a full-scene synthesis while calling the other layers “locked.”

Each semantic root receives at most one bounded correction with one changed variable. If that correction fails, block for user direction rather than accumulating invisible drift. A later user-authorized restart is a new declared root, never an automatic third attempt.

### Holistic subject synthesis and rebase

The pixel-preservation rule above applies to a declared local correction. It does not forbid a deliberately declared **holistic subject synthesis** whose purpose is to resolve face, body, garment fit, hair, pose, hands, footwear, and neutral staging into one new full-frame subject master.

Use this mode only when all of the following are true:

1. the same garment's independent 01, 02, 03 and 04 artifacts plus the body
   target have already been explicitly accepted and locked;
2. the complete independent real-face authority stack is present;
3. the operation is declared as `HOLISTIC_SUBJECT_SYNTHESIS`, not a local face edit;
4. the user reviews the entire frame, not only the face; and
5. the accepted output is rebased as a new garment-specific subject lock.

### G005 legacy disclosure history versus Studio execution

The following two-pass recipe is preserved because it is what the authorized
manual G005 operation actually did. PASS A and PASS B were exposed during that
manual session so the user could make the recorded whole-frame judgment. That
disclosure is audit history, not a Studio engine instruction and not permission
to expose a failed or merely materialized candidate.

For a five-image generation boundary, the historical manual recipe was:

```text
LEGACY MANUAL PASS A
accepted body target
+ F01–F10 real-face contact
+ raw frontal morphology
+ raw open-eye three-quarter geometry
+ approved V4 translation lock
→ face-translated full-frame candidate

LEGACY MANUAL PASS B — one bounded correction
accepted body target
+ PASS A candidate as translation donor
+ F01–F10 real-face contact
+ raw frontal morphology
+ raw open-eye three-quarter geometry
→ review candidate
```

The contact sheet includes the real polished frontal lock, so its separate crop is represented without displacing an independent authority input. Hair remains unchanged unless the user explicitly unlocks it.

In Studio, PASS A is simply the first private semantic operation. If it passes
the complete closed gate chain, that exact artifact may be revealed. If it
fails and the evidence identifies one bounded repair, the server may create the
PASS-B-equivalent correction privately and must repeat the entire chain. The
user sees only the exact artifact that reaches `SEMANTIC_PASS`; the interface
does not show failed PASS A beside PASS B for comparison. The historical G005
approval superseded a pixel-difference objection for a deliberately rebased
whole frame; it did not waive garment truth, identity, body, provenance or
other closed semantic failures, and it does not authorize a Studio user to
override `SEMANTIC_FAIL`.

After `SEMANTIC_PASS`, human acceptance makes the reviewed frame immutable.
Downstream ROOM/`05` work must parent that exact subject lock and may not return
to PASS A, the earlier body target, or a rejected correction as the visual
parent.

The 01–04 garment-set gate precedes subject synthesis; all four locks remain
immutable while the subject is built and composed into the room. The subject
lock may parent only the current garment's ROOM/final-`05` operation; it does
not directly parent `06` or `07`. Only the accepted room-composited `05` may
parent those sibling views.

If the user explicitly accepts every subject layer except footwear or another named accessory, record a `SUBJECT_CORE_LOCK` rather than claiming whole-frame acceptance. The exact subject pixels may parent ROOM/`05`, but the deferred accessory is excluded from its authority and must be the only person-layer change declared for the styling/ROOM/`05` operation. The final `05` requires whole-frame approval and closes the deferred styling decision. Identity, body, garment, hair, pose, hands, and framing remain immutable throughout that operation.

This exception never converts a generated subject lock into direct identity or garment evidence. Real face photographs and direct garment captures retain higher truth authority.

## 3. Operation declaration

Before handing a declaration to the engine, resolve the exact camelCase JSON
contract represented by `docs/virtual-atelier/MANUAL-OPERATION-EXAMPLE.json`.
The checked-in test loads that literal example, so documentation and validator
cannot silently drift into incompatible snake_case/camelCase shapes.

`stage` is mandatory and must map exactly:

| Stage | View |
| --- | --- |
| `GARMENT_01_FRONT` | `01` |
| `GARMENT_02_BACK` | `02` |
| `GARMENT_03_MANNEQUIN` | `03` |
| `GARMENT_04_DETAIL` | `04` |
| `SUBJECT_A`, `SUBJECT_B` | `SUBJECT` |
| `ROOM_FINAL_05` | `05` |
| `SIBLING_06` | `06` |
| `SIBLING_07_CORE`, `SIBLING_07_RECOVERY` | `07` |

No operation proceeds with unresolved required assets or an incomplete
`renderQualityContract`. A `ROOM_FINAL_05` operation also requires a complete
`fashionNovaCheck` and exactly one accepted subject parent plus the current
garment safeguard and exact room. It must not re-add face or body as provider
authority: those truths are already carried by the immutable subject lock and
remain private evaluator comparison authority.

Run the checked-in operation validator before engine preparation and record its
semantic pass:

```bash
npm run atelier:verify:operation -- storage/garments/drop-02/NNN/operations/<operation>.json
```

This command returns `PASS SEMANTIC_PREFLIGHT_ONLY`; it cannot grant paid
dispatch because it has no execution identity, durable claim or reconciliation
checkpoint. `paidInvocationAllowed` remains false. Only the server-owned engine
may compile prompt prose, persist execution identity, acquire the claim/fence
and dispatch once.

Every executed operation must persist the exact compiler-produced prompt—not
only a summary—together with the ordered reference paths, slot roles,
exclusions, adapter/model, execution identity and checkpoints, generated source
path when available, durable workspace output path, dimensions, byte size and
SHA-256. The server derives every bounded correction from the exact failed
receipt and records it as a distinct operation; a manual caller cannot create a
paid retry. Record independent review plus the user's exact acceptance or
rejection statement. A useful or accepted generation without this reproduction
record is incomplete and may not become canon.

For Studio `01`–`04`, `parentAssets` is empty and the exact direct garment
evidence is resolved as server-owned authority. One early-view candidate may
not appear in another early-view operation. For `06` and `07`, the sibling
view must not appear in `parentAssets` or any authority list.

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

The requested 01–07 semantic role is unambiguous and complete; 05/06/07 also obey their fixed model-view grammar.

### Lineage gate

`06` and `07` must each descend from `05` and the canonical stack, never from each other.

### Format gate

One clean full image with no unrequested text, labels, panels, or crops.

### Photographic realism and texture gate

Skin, garment, footwear and room read as one photograph. Natural skin detail remains visible; garment wash, folds, tension, fraying, stitching, drape and sheen follow the garment evidence and pose; lighting and contact shadows agree across the frame; perspective preserves Lulu's stature. Reject poreless or waxy skin, invented material texture, pasted detail, halos, synthetic HDR, CGI sheen, excessive smoothing or sharpening, and any cutout-like room integration.

No operation may claim `GATE_PASS`, `ACCEPTED` or `LOCKED` until every applicable `renderQualityReview` result is recorded as `PASS` and each stage-excluded result is explicitly non-applicable under its closed schema. A failure in any gate rejects the candidate.

### Semantic-role drift gate

View 03 fails if it reconstructs the private source environment rather than presenting an anonymous neutral mannequin. View 04 fails if it becomes a duplicate full-front hero rather than a close visible-detail presentation. Views 02 and 07 may not be promoted from inferred presentation to construction evidence without direct rear authority.

### Catalogue release identity and pricing

An explicit user instruction to publish authorizes deterministic Shop release work for the exact accepted private packet named by the user. It does not authorize substituting another garment, fabric, condition, size or construction fact.

Release identity must first reuse the next immutable `JUW-NNN` SKU, the garment brief's evidence-backed product name and a normalized slug. When the seller has not supplied a price and publication is explicitly authorized, do not stop merely to ask for a simulated catalogue price. Resolve it from Git history:

1. identify the two closest live-verified Drop 02 products by category, length, visible construction and visible complexity;
2. exclude inferred fibre, brand, condition, size and measurements from the comparison;
3. take the midpoint of their checked-in prices and map it to the nearest price tier already used by a live-verified Drop 02 product, breaking an exact tie downward;
4. label the result `Simulated price`; and
5. record both comparator garments, their prices and the calculation in the active garment brief and durable state.

A supplied seller price always overrides this fallback. A later explicit price correction requires a new catalogue revision and must preserve operational inventory truth.

## 6. State transitions

The legacy manual record uses:

```text
DRAFT
→ READY
→ GENERATED
→ REVIEW
→ ACCEPTED → LOCKED → PACKETED
          ↘ REJECTED
```

Rejected assets never become parents. Acceptance and rejection must be written to `state/current.json` before another operation begins.

The Studio engine uses the durable projection for every stage from
`GARMENT_01_FRONT` through `SIBLING_07_RECOVERY`:

```text
DRAFT
→ MATERIALIZED
→ TECHNICAL_PASS | TECHNICAL_FAIL
→ SEMANTIC_PASS | SEMANTIC_FAIL
→ USER_APPROVED | USER_REJECTED
→ LOCKED | SUPERSEDED | BLOCKED_USER_DIRECTION
```

Materialization and technical pass are private. The optional single correction
is a new linked semantic operation, not a backward state transition or a replay
of the same provider invocation.

## 7. Privacy and provenance

Real identity and body material is private. Never commit it to this public repository.

The private operational authority is recorded in `storage/models/konan/canon/v4/authority-manifest.json`. Its pixels and manifest remain gitignored; this public contract records only logical roles and verified hashes.

Provenance remains one of:

- `DIRECT_CAPTURE`
- `DERIVED_FROM_DIRECT`
- `MODEL_REFERENCE`

Human approval changes status and role, not provenance.
