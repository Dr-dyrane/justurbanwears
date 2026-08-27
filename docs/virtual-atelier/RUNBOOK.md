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

For a portable-machine restore, verify the minimal immutable authority kit plus the active garment packet instead of requiring all historical garments:

```bash
npm run atelier:verify:portable -- --garment 024
```

The verifier checks the committed private Blob manifest against the explicit approval/lock overlay, local authority bytes, direct garment source manifest, locked views and generation operation records. A new provider/model/adapter revision must also pass `docs/virtual-atelier/provider-calibration.v1.json` before production routing.

Do not accept an evaluator or qualification claim from a route, browser or
composition caller. Confirm the internal qualified-evaluator resolver holds one
canonical six-case PASS receipt, its independent-review receipt and both exact
receipt-bound descriptors. If it returns no bundle, stop at
`QUALIFICATION_NOT_PASSED`; this is a zero-spend release blocker, not a reason
to install a test evaluator or literal PASS declaration.

## 1. Canonical production hierarchy

Every garment follows this exact authority order:

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
3. Resolve the garment intake first. When a required side or rear construction fact is absent, run a bounded reverse-image or exact-product search before declaring the view inferred. Prefer official maker or retailer evidence, archive exact matched bytes privately with URL/access time/hash/dimensions/match basis, and transfer only the missing construction facts. If no exact match is verified, record the unsuccessful search and retain conservative inferred-presentation status; brand, fibre, size, care, condition, price and seller provenance never transfer.
4. Run `GARMENT_01_FRONT`, `GARMENT_02_BACK`,
   `GARMENT_03_MANNEQUIN` and `GARMENT_04_DETAIL` as four independent root
   operations through the same durable four-command facade. They use direct
   garment evidence, not one another, as authority.
5. Review and lock each exact 01-04 artifact. Do not begin subject synthesis
   until all four same-garment locks resolve; preserve inferred-rear status on
   02 when direct rear evidence is absent.
6. Resolve face authority from the raw photographs, real-photo front lock and F01–F10 multi-angle contact; use accepted 001/05 and 004/05 only as translation guidance.
7. Run the face gate. If identity fails, stop before body.
8. Resolve body evidence and the V4 modeled geometry controls.
9. Run the body gate while preserving the accepted face.
10. Resolve the locked room and run the room/scale/icon gate without regenerating Lulu.
11. Create one clean `05 FRONT MASTER` only.
12. Do not generate `06` or `07` until `05` is accepted.
13. After `05` passes, either `06` or `07` may be produced next; they do not depend on one another.
14. Review each disclosed candidate against every acceptance gate and record `ACCEPTED` or `REJECTED` before proceeding.

### A0. Private agent-mode gate

This work happens behind the Studio progress surface. Do not send a candidate
URL, preview, thumbnail or `Keep` control to the browser merely because paid
bytes were returned.

1. Derive the semantic operation identity from the validated operation,
   workflow revision and exact authority/parent hashes. A typed or remembered
   operation label is not the idempotency key.
2. Materialize at most once under the durable claim/fence and persist every raw
   returned byte before policy. On an uncertain provider outcome, reconcile;
   never automatically re-invoke.
3. Compare the exact private review artifact in order: garment, real face,
   body, room, then final integration/realism. Use the versioned multi-era
   baseline rather than only the immediately preceding garment. Record a gate
   excluded by the declared stage as `NOT_APPLICABLE`.
4. When one applicable gate fails, stop. Record all later applicable gates as
   `NOT_EVALUATED`; never let a later apparent pass dilute or overrule the
   earlier failure.
5. If the private evidence identifies one bounded correction, create one new
   semantic correction operation, preserve every earlier passing layer, and
   run the entire ordered gate chain again. There is no third paid attempt.
6. A second failure, unclassified failure or indeterminate provider result
   remains private and blocks for user direction without another spend.
7. Keep the app-owned review-media route unreadable in every earlier or failed
   state; omitting a URL from the projection is insufficient. Reveal only the
   exact content-addressed artifact at `SEMANTIC_PASS`, after authenticated
   state and hash verification before and after private readback.
8. The user then chooses `Keep`, `Fix one thing`, or `Reject`; only `Keep` may
   authorize an immutable lock of those exact reviewed bytes. Offer `Fix one
   thing` only if the hidden loop did not already consume the one correction
   budget.

The ordered comparison and the provider input stack are deliberately not the
same thing. `SUBJECT_A`/`SUBJECT_B` establishes garment, real-face and body
truth, in that order, and `Keep` locks the resulting subject bytes. Final
`ROOM_FINAL_05` then receives that exact subject lock, the current-garment
safeguard and the exact locked room. It must not re-inject face or body
references and thereby reopen already accepted subject pixels. The private
evaluator still compares final 05 to garment, real face, body, room and final
integration in that order before disclosure.

### A1. Durable independent garment views 01–04

Each of the first four semantic views follows the same public command rhythm:

```text
prepare -> generate once -> review -> lock/reuse
```

| Stage | View | Required output | Parent rule |
| --- | --- | --- | --- |
| `GARMENT_01_FRONT` | 01 | source-faithful clean front | no stage parent |
| `GARMENT_02_BACK` | 02 | direct rear or conservative inferred rear | no stage parent |
| `GARMENT_03_MANNEQUIN` | 03 | anonymous neutral mannequin, no source-room reconstruction | no stage parent |
| `GARMENT_04_DETAIL` | 04 | genuine close source-visible detail, no fibre claim | no stage parent |

All four resolve the server-owned `DIRECT_GARMENT_EVIDENCE` binding and the
same garment truth. Generate each from that truth rather than rotating,
restaging or editing another candidate. A semantically passed early view is
still not a parent until the user keeps it and `lock/reuse` returns its exact
immutable lock. Subject work requires the exact same-garment front, back,
mannequin and detail locks.

### A2. Holistic subject synthesis

Use this only when the intended output is a new garment-specific full-frame subject master, not a pixel-local edit.

1. Resolve and lock the same garment's independent `01 GARMENT_FRONT`,
   `02 GARMENT_BACK`, `03 MANNEQUIN_FRONT`, `04 FABRIC_DETAIL` and the body
   target first.
2. Declare `HOLISTIC_SUBJECT_SYNTHESIS`.
3. Preflight the exact version-locked G004 positive-target calibration. Read and
   verify all three derivative containers and decoded pixel hashes before paid
   dispatch. Select G004/05 for subject/front work, G004/06 for 06, and G004/07
   for 07. Never put a G004 calibration frame in the provider reference stack.
   Before provider packing or intent, apply
   `g004-provider-visual-denial-2026-08-26.1` at manifest SHA-256
   `360cbf8ab42d7ca344c4296d87d28f112f809ce6952069ab664731044c0ad1d3`
   to every raw constituent. It denies calibrated full-frame lossless and lossy
   duplicates after the declared normalization, mirror/alignment and small-
   geometry checks. V1 does not claim arbitrary-subimage, large-warp or
   untrusted-mosaic detection; compose only after each constituent passes.
   This derivative-only denial never restores the missing canonical originals.
4. Run PASS A with the accepted body target, F01–F10 contact, raw frontal face, raw open-eye three-quarter face, and approved V4 translation lock.
5. In Studio, use the single PASS-B-equivalent correction only when the private
   closed evaluator derives one bounded reason and target. It retains the
   accepted body target, PASS A as translation context, F01–F10 contact, raw
   frontal face and raw open-eye three-quarter face.
6. Keep the centre-parted low bun unchanged unless the user explicitly unlocks hair.
7. Run the private ordered garment, face, body, room and final-integration gates
   against the exact candidate. At final integration, re-read the calibrated
   G004 bytes and record the exact stage-specific positive-target comparison.
   Real identity/body and current-garment evidence always outrank G004. Any
   G004 mismatch blocks without a correction spend, even beside another mutable
   finding. If PASS B was needed for a non-G004 failure, repeat every gate; do
   not inherit PASS claims from PASS A.
8. Only after those private gates pass, reveal the exact candidate and ask the user to judge the complete person and frame: identity, body balance, garment fit, pose, hands, legs, footwear, and styling.
9. If the user accepts all subject layers, Studio records `Keep` and
   `lock/reuse` promotes the same exact reviewed bytes as the garment-specific
   subject lock; a legacy manual run copies those unchanged bytes into the
   private `locked/` directory. If the user accepts everything except one named
   accessory, record a `SUBJECT_CORE_LOCK`, exclude that accessory from its
   authority, and defer only that accessory to the next styling/ROOM/`05`
   operation.
10. Rebase downstream authority on that exact lock. Do not demand pixel identity with the pre-synthesis body target after the user has approved the new holistic frame.
11. Preserve all four pre-subject garment locks through ROOM/final-`05`
    composition.
12. ROOM and `05` may change only the explicitly declared environment/accessory layers; the accepted subject lock remains the parent.
13. The pre-atelier subject lock cannot directly parent `06` or `07`; only an accepted final `05` can.

Garment 005 established this pattern with `g005-face-r002`: PASS A supplied a
useful face translation, the manual operator showed the PASS A/PASS B frames
during that historical run, and PASS B was explicitly accepted by the user as
the complete Lulu/Garment 005 subject master. Its failed local-edit review and
candidate disclosure remain audit history; the user-approved result is
classified separately as a full-frame subject master.

Do not reproduce that disclosure timing in Studio. PASS A and any
PASS-B-equivalent correction run behind the private gate. A failed PASS A is
not shown for comparison. Only whichever exact artifact completes the full
ordered chain at `SEMANTIC_PASS` becomes readable and eligible for the user's
whole-frame judgment. Historical G005 approval overrode a pixel-difference
objection for the deliberate rebase; it did not waive a closed semantic
failure and is not authority to expose `SEMANTIC_FAIL`.

The checked-in manual operation validator and its
`g001-g024-multi-era-v1` receipt remain historical bookkeeping preflight only.
They cannot attest G004 pixel access, satisfy production semantic QA v2 or
authorize a G004-bound comparison claim. Only the durable server readback and
closed v2 evidence above can do that.

## B. Resolve Fashion Nova accessory styling and generate view 05

Before composing the room, resolve footwear and restrained accessories. For every `05`:

1. Inspect a current official Fashion Nova product or collection styling page matching the closest proven garment family.
2. Record the requested URL, resolved canonical URL, page title, access date, matched garment facts, selected direction, and `KEEP`, `REFINE`, `REPLACE`, or `NO_CLOSE_MATCH` decision in the private operation record. `NO_CLOSE_MATCH` requires an empty match list plus a written search/no-match reason and means retain the strongest garment-faithful JUW styling instead of forcing an unrelated look.
3. Treat the result as styling guidance only. It may not alter garment construction, identity, body, hair, pose, room, icon, camera, or lighting and must not imply Fashion Nova provenance for the JUW garment.
4. Pass only the recorded JUW styling decision into generation. Never place a Fashion Nova page, screenshot, image, URL or page asset in `referenceStack` or `authorityStack`.
5. If the subject was accepted as a `SUBJECT_CORE_LOCK`, change only the explicitly deferred accessory while placing the otherwise immutable subject in the locked room.
6. Close the styling choice through the final whole-frame `05` review. Views `06` and `07` inherit that accepted styling unless the user explicitly unlocks it.

Final-05 materialization palette:

```text
exact accepted SUBJECT_A or SUBJECT_B lock
+ exact current-garment front safeguard
→ one transparent subject layer
+ exact approved 1024×1536 atelier plate (including its locked icon pixels)
→ app-owned deterministic final composite
```

Real face and body canon remain mandatory private comparison authority, but
they are not new provider inputs for `ROOM_FINAL_05`. Reintroducing them there
would dilute the accepted subject. The exact-room size check happens before the
claim/fence; the current 1024×1280 room therefore blocks 05 without a spend.

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

This authority core is mandatory, while reference ordering and truth-preserving packaging remain adaptive. Do not replace the BACK crop or direct real-body evidence with a generic translation image. If no direct garment-back capture exists, first apply the exact-product search gate in section A. A verified exact commercial match may supply narrowly bounded rear construction authority; otherwise rear construction remains conservative inferred presentation and can never become direct evidence.

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
6. Change one variable and allow at most one bounded correction for the semantic root.
7. The durable engine, not the browser/manual caller, derives the correction
   from the exact failed or reviewed receipt, binds every preserved asset/hash
   tuple and acquires a distinct execution claim.
8. If isolation is unavailable or the correction fails, stop for user
   direction. Do not perform a full regeneration and call it a local correction.

Example:

```json
{
  "stage": "ROOM_FINAL_05",
  "changeSet": [
    {
      "mutableLayer": "FOOTWEAR",
      "region": "footwear only",
      "intendedDelta": "Apply the one recorded styling correction."
    }
  ],
  "immutableSet": [
    "identity",
    "body",
    "garment",
    "hair",
    "pose",
    "hands",
    "atelier",
    "brand icon",
    "camera",
    "lighting",
    "output geometry"
  ]
}
```

The locked room and brand icon are never correction targets for
`ROOM_FINAL_05`; a room-authority failure blocks instead of spending again.

### E1. Built-in manual-chat moderation context and no-output recovery

For an identity-preserving built-in manual-chat operation, do not declare the
workflow terminally blocked until the invocation has received the complete
production context in both the private operation record and the prompt. State
all of the following together and truthfully:

- the subject is an adult and the user has authorized the private virtual
  fitting;
- the purpose is a conventional, fully clothed professional ecommerce
  catalogue candidate for private review and approval;
- generation is not publication, endorsement or public release, which remain
  separately gated;
- real identity/body references and generated masters remain private and
  gitignored;
- each supplied image has one precise authority role, with explicit
  zero-authority exclusions; and
- the complete applicable stack is present: real-face operation board, body
  canon, accepted full-frame structure, garment/on-form authority and exact
  room or accepted-pixel parent for the requested stage.

A no-output moderation response creates no candidate and does not consume the
one bounded correction allowance. Record its category and request ID, release
the reservation, and retain no invented output metadata. A later attempt is
permitted only when it uses a materially different capability or context stack;
rewriting or replaying the same request is not a new operation.

The full context does not override provider policy or guarantee an output. If
the fully contextualized stack also produces no candidate, preserve the audit
record and change capability or use an exact accepted-pixel parent rather than
repeating prompt-only retries.

G029 is the durable recovery example: PRE_ROOM r001-r003 produced no candidate
at output moderation; r004 succeeded only after the adult-subject,
user-authorized private fitting, fully clothed ecommerce purpose, private
retention, approval boundary and per-reference authority separation were
supplied together with the full accepted visual stack. That successful output
still required ordinary identity, connected-body, garment, realism and user
review; context recovery is not visual acceptance.

### E2. Reuse the committed recovery pattern, not a generic approximation

When the failure matches a prior garment, inspect the exact committed operation
before retrying. Two distinct successful patterns are durable:

- **Too-slim front-body rebase — G023, commit `f0c84a7`, operation
  `g023-body-rebase-v05-r002`:** pass exactly the rejected front target, complete
  real-face board, dedicated `lulu.body.canon.v4.front` crop, direct
  `lulu.body.real.angle-contact.v4` evidence and accepted current-garment `01`.
  The front crop and direct real evidence must be present together; a generic
  BODY render or whole-body board is not an equivalent substitution.
- **Moderation recovery through an accepted same-view pixel parent — G018,
  commit `0ef5d0a`, operation `g018-v07-r004-edit-parent`:** use a fully clothed
  accepted same-view person/body/pose/camera/scene pixel parent, the current
  garment-and-styling reference, complete real-face authority and the dedicated
  body canon plus direct real-body evidence. Change only clothing/footwear.

These are capability patterns, not guarantees. Record the provider request ID
when an exact replay still creates no bytes; provider moderation state can
change even when authority, prompt structure and references match a committed
success. Do not misreport an exact historical replay as a missing-consent or
missing-context problem.

### E3. Garment-output isolation without implicit replay

G027 and G028 show that provider output moderation has sometimes varied across
identical invocations. That historical observation is not authority to replay a
terminal no-output operation. The operating contract remains binding: record
the no-byte result, release the claim, stop at `BLOCKED_USER_DIRECTION`, and do
not make another provider call implicitly. An identical repeat is audit-only
and adds no capability evidence.

After explicit user direction, a materially different current-authority-
eligible capability may be prepared as a new canonical semantic operation. For
a garment that repeatedly triggers output moderation, use this diagnostic
ladder rather than asking for consent again or guessing at anatomy:

1. Verify the adult-subject, authorized private-review and authority-separation
   context from E1.
2. Verify the exact accepted BODY parent, complete face authority, dedicated
   body canon and direct real-body evidence. Never use a historical parent whose
   current state says `mayParent:false`.
3. Search for and privately archive an exact official model-worn product image
   when one exists. It may control garment construction/arrangement only; the
   commercial model has zero Lulu identity, body, pose, styling, camera or room
   authority.
4. With explicit user direction, test one BODY-parent garment transfer and, if
   materially justified, one reverse exact-garment pixel-parent Lulu rebase.
   Each direction requires its own canonical semantic identity.
5. With explicit user direction, use one strict two-image accepted-person plus
   exact-garment edit as the final reference-density isolation test. Keep the
   complete private face/body stack as the acceptance gate even when it is not
   transported to the provider.
6. If an accepted mannequin presentation exists, explicit user direction may
   authorize one accepted-mannequin garment pixel-parent test. Preserve its
   garment pixels and replace the mannequin, crop and backdrop with the
   accepted person authorities. This isolates commercial-model input from the
   finished-output boundary and requires its own canonical semantic identity.

If the current-authority full stack, exact model-worn transfer, reverse
pixel-parent rebase and strict two-image isolation each produce one no-byte
result, record a provider output-classifier block on the proposed finished
garment image. This is evidence against missing consent, source, body evidence,
model-worn evidence or prompt/reference density; it is not proof that every
future provider capability is exhausted. Prefer a user-supplied candidate.
Otherwise resume only after explicit user direction and a materially different
capability or demonstrable provider-state change. Do not switch to a paid
provider, API key or external generation route without separate user authority.

Preserve evidence boundaries exactly. A response without an exact prompt hash
or ordered-reference receipt must not be described as an exact replay. A trial
that used a currently forbidden parent remains audit-only. Multiple provider
reference arrangements under one semantic identity are also audit-only until
each arrangement has its own valid operation record.

G030 is the durable isolation example. Its official Fashion Nova model-worn
front and rear images proved the orange halter mini dress is conventional
retail apparel and resolved its on-body construction. Eight current-authority-
eligible single-invocation operations still produced no PRE_ROOM candidate;
the strict two-image result isolates provider reference density, the direct
real-Lulu source pixel-parent result rules out the generated BODY parent itself
as the trigger, the accepted-mannequin garment pixel-parent result rules out
commercial-model input as a necessary cause, and r009 shows that a one-image
transparent-background extraction can hit the same output boundary. Eight
other responses are retained audit-only: two used an unavailable G028 parent,
and six were identical repeats. Exact prompt hashes exist for G030 r003-r009;
r001-r002 preserve semantic records and request IDs without exact prompt
receipts.

G030/05 adds a final-scene no-byte precedent. On 2026-08-27 the user explicitly
authorized a G030-only exception to use the existing 1024x1280 room as manual
ImageGen visual authority for 05-07; this did not change the global deterministic
engine contract. The 05 root used exact accepted PRE_ROOM, accepted 01 as a
garment safeguard and the existing room. The materially different bounded
follow-up used the same accepted subject's fully rendered direct source as the
edit target plus only the existing room. Both were rejected at output
moderation before bytes existed (`fe0f0d09-58be-4a30-a423-fde5c472a489`, then
`86aabc51-cc19-49bd-9a99-eddf9c73ea74`). Preserve both prompt/stack receipts,
release the serialized claim and stop. With no accepted 05, independent 06 and
07 remain unavailable. A user-supplied acceptable 05 can be handled later as a
new hash-and-review intake decision; do not call the provider again implicitly.

That later intake occurred for G030. The user accepted every pixel of the
supplied fully clothed front frame except its malformed wallmark. Treat this as
a local-correction contract, not a new generation: declare one wallmark-only
ROI, use the exact canonical room as the sole patch source, preserve the base
canvas and encoding dimensions, and prove that decoded-pixel differences
outside the ROI equal zero. Feathering and a bounded tonal adjustment are
permitted only inside the declared ROI. Review the canonical central silhouette,
both mirrored lower-L cutouts, double-logo/source residue, patch seams and tonal
coherence. Only after that review passes may the corrected bytes be locked as
05 and parent independent 06 and 07. G030's accepted example changed 43,529
pixels inside `[190,40,390,280]`, changed zero outside, and locked SHA-256
`88ffaf6452bab09fd2f648e418bd9289f362be1d8037112316533ad6e7a3c873`.

### E4. Same-provider success and offline alpha fallback

A user may supply a successful image and clarify that it came from the same
built-in Imagegen capability that rejected a later operation. Record that
accurately. If the original request/job receipt is unavailable, classify the
provenance as `USER_ATTESTED_BUILT_IN_IMAGEGEN_OUTPUT_REQUEST_RECEIPT_UNAVAILABLE`,
not as provider-verified execution and not as Nano Banana. A successful source
frame beside a rejected edit means the output boundary is request/candidate
dependent; it does not make either result fictitious and does not authorize
unlimited replay.

When the supplied successful frame has the wrong room but an otherwise usable
complete subject, use this bounded recovery only after explicit user direction:

1. Hash and archive the exact source privately. Grant its person, garment,
   styling, pose and framing only the authority the user actually approved;
   grant every supplied room pixel zero atelier authority.
2. Declare and validate one provider-neutral local alpha-only operation before
   execution. Keep the exact canvas and decoded subject RGB immutable. No
   network, provider call, generated pixels, repaint, resize, crop or relight is
   permitted.
3. Materialize a separate PNG with genuine alpha and preserve the mask and an
   execution receipt. Verify dimensions, alpha presence, transparent corners,
   foreground bounds and zero opaque RGB differences.
4. Review the result on a checkerboard at original resolution. Hair, hands,
   fingers, garment edges and ties, legs, straps, toes and heels must all remain
   complete. Any room island, coloured fringe, hard cut, erosion or soft halo
   fails.
5. Preserve a failed root audit-only. At most one bounded alpha-mask correction
   may follow; record it under the same serialized claim and consume the single
   correction budget. If it also fails, release the claim and stop. Neither
   candidate may parent ROOM/05 unless the user explicitly accepts the exact
   reviewed bytes despite the recorded failure.
6. Keep room attachment as a separate gate. A clean transparent subject does
   not waive the exact approved-room hash or canvas contract.

G030 r010 is the negative edge-quality precedent: the coarse person mask
preserved opaque RGB but retained warm room fringe and eroded a lower tie-tail
edge; its single foreground-instance correction preserved the complete subject
but introduced a broader halo. Both exact outputs and the independent review
remain audit history. The user later explicitly accepted the exact root bytes,
so those bytes—not the correction—were promoted unchanged to PRE_ROOM and may
parent ROOM/05 only. That acceptance supersedes the root visual failure for the
named stage; it does not erase the review, authorize another correction, waive
the room-canvas gate or grant publication authority. The lesson is to
distinguish successful provider synthesis, provider edit moderation, local
extraction quality and final user acceptance instead of labelling the issue as
a different model or repeatedly asking for consent.

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

### F1. Resolve release identity without repeating old questions

Before export, inspect the latest live-verified garment briefs and the Git commits that introduced their catalogue rows. Reserve the next immutable SKU, use the evidence-backed garment name and normalized slug, and reuse a seller-supplied price when present.

If publication is explicitly authorized but no seller price exists, apply the binding closest-live-comparable rule in `OPERATING-CONTRACT.md`: select the two closest live-verified Drop 02 garments by category, length, visible construction and complexity; midpoint their checked-in prices; map to the nearest existing live price tier with ties downward; and record the comparators and calculation. Never infer a price premium from unverified fibre, brand, size or condition. Do not interrupt the established release solely to ask for a simulated price once this evidence is available.

The garment brief is the durable release-identity record. The work ledger may summarize it but must not contradict the accepted packet, current publication authority or the pricing calculation.

Before every release push, assume another Codex task may have advanced the shared checkout or remote. Run `git fetch origin`, inspect `git status --short`, and compare `main...origin/main` with `git rev-list --left-right --count`. Identify every unrelated tracked or untracked path and exclude it from the release commit. If origin advanced, reconcile the committed release work onto the fetched main without overwriting another task, then rerun the affected gate before pushing. Never wait for a rejected push to discover concurrent work.

### F2. Complete the database release without guessing

After deterministic media export, Blob sync, catalogue integration, commit and deployment, use `docs/data/SHOP_DATABASE.md` as the executable database authority. Do not search old tasks first and do not treat a Vercel-exported `[SENSITIVE]` value as a usable URL or a Neon outage.

1. Confirm a clean committed release checkout and compute the current manifest revision, row count and checksum locally.
2. Resolve the authenticated Neon project named `justurbanwears-db`; verify its canonical project ID, primary branch and `neondb` database against `docs/data/SHOP_DATABASE.md`.
3. Obtain a fresh direct non-pooler connection through the Neon connector. If connector search confirms the exact project but a connector parameter-schema or transport fault blocks describe/connection retrieval, use the already authenticated `neonctl` fallback in `docs/operations/LOCAL-ACCESS.md`; do not replay an old environment value. Keep the fresh connection only in a mode-`0600` temporary environment file outside the repository; never echo it, place it on a command line, save it in conversation, or write it to `.env.production.local`.
4. Run the read-only schema check with exact target host/database guards. Pending checked-in migrations are expected input to the atomic release, not a reason to run a standalone migration command.
5. Run the single guarded atomic release with the exact manifest checksum, production confirmation and committed release Git SHA. Do not retry a successful apply; the ledger makes an identical revision a no-op, but repeated writes add no value.
6. Run the read-only catalogue verification, wait for the server catalogue cache to expire, then require `CONFIRMED` from `/api/shop/catalogue/availability` for every newly released SKU using its exact checked-in tagged size.
7. Require the affected product pages to show the expected price, `data-state="available"` and the purchase action, then run `npm run smoke:production` once.
8. Delete the temporary credential file, update the garment briefs and `state/current.json`, and report one exact state: `live-verified` only if every gate above passed; otherwise `deployed-unverified` with the precise failed gate.

If neither the Neon connector nor the authenticated Neon CLI session can see the canonical project, use the authenticated Vercel Marketplace SSO link for the existing `justurbanwears-db` integration as the fallback. Stop if the resolved project identity differs; never substitute another visible Neon project. Vercel login/link/environment pulls, Blob-token routing, secure Neon CLI capture, local credential staging, cleanup and token-minting rules are in `docs/operations/LOCAL-ACCESS.md`; exact database guards and release commands are in `docs/data/SHOP_DATABASE.md`.

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

## H. Portable replay checkpoint

Before operating on another machine or through another provider:

1. Restore the private authority revision named in `lib/server/private-asset-manifests/lulu-v4.json`.
2. Verify every private object's SHA-256, byte size, decoded dimensions and MIME type.
3. Confirm an unauthenticated request cannot read the private objects.
4. Run `node scripts/virtual-atelier/verify-assets.mjs` and resolve every required failure before generation.
5. Resolve the active garment brief, source manifest, accepted garment 01 and any accepted parent locks.
6. Bind every reference by semantic authority role, not provider slot number.
7. Confirm the provider can carry the complete mandatory stack without dropping, merging or weakening authority.
8. Verify the exact G004 derivative manifest and readback receipt, including all
   three container and decoded-pixel hashes. Do not substitute the missing
   canonical originals or reuse their asset IDs.
9. Qualify a new provider/model/adapter/calibration revision against the cases in `docs/virtual-atelier/MODUS-OPERANDI.md` before new-garment production.
10. Record provider execution separately from the provider-neutral semantic operation.
11. Keep exact user acceptance as the final lock authority.

`storage/` alone is not a portable archive. A replay environment is invalid if it has unverified loose media, an unresolved manifest mismatch, no exact accepted parent bytes or no durable operation/decision record.

The G001–G024 evidence and known restore defects are recorded in `docs/virtual-atelier/audits/G001-G024-WORKFLOW-AND-SEMBLANCE-AUDIT.md`.

## I. Operation template

Use the checked-in, validator-tested camelCase JSON shape in
`docs/virtual-atelier/MANUAL-OPERATION-EXAMPLE.json`. It is deliberately a
`ROOM_FINAL_05` semantic-preflight example so the most dilution-sensitive
boundary is visible in one place: one accepted subject parent, one garment
safeguard and one room authority; no reopened face/body provider inputs.

The record has two phases:

1. The declaration phase records `workflowRevision`, exact `stage`/`view`,
   parent/reference IDs and hashes, semantic roles, change/immutable sets,
   output and failure contracts, correction budget and the derived
   `semanticIdentity`. Changing any semantic fact changes the operation ID and
   hash.
2. The server execution phase appends the compiler-produced prompt, execution
   hash, claim/fence, invocation checkpoints, raw/normalized artifact receipts,
   accounting and closed ordered-gate receipt. A browser or manual caller may
   not author those fields.

The validator reports `PASS SEMANTIC_PREFLIGHT_ONLY`. It never grants paid
dispatch and always returns `paidInvocationAllowed: false`; only the durable
engine may dispatch after acquiring/reconciling its execution claim. Manual
correction records are historical/read-only. Studio derives the single allowed
correction from the exact failed server receipt and enforces ordinal uniqueness
in durable storage.

To instantiate the example, copy it under the private operation directory,
replace every example ID/path/hash and styling fact, derive the new canonical
identity, then run the validator with real file checks. `--no-file-check` is for
tests/template inspection only and never qualifies production media.
