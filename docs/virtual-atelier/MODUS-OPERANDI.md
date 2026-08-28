# Virtual Atelier portable manual modus operandi

Status: governing manual-production method, revision 2026-08-26

This document turns the successful Garment 001–024 manual Atelier practice into a provider-neutral procedure that another authorized operator can reproduce on another machine. It does not make stochastic image output byte-reproducible. It makes the authority, lineage, evidence, review and acceptance decisions reproducible.

The governing outcome is materially equivalent accepted truth:

- the image reads as adult Lulu, not a generic generated model;
- Lulu's identity and complete approved body geometry remain coherent at the requested angle;
- the garment preserves only source-proven construction and explicitly labels inferred views;
- the locked JUW atelier, icon, light and camera family remain intact;
- the semantic view is correct;
- the frame is photographically believable; and
- the exact accepted bytes, decision and lineage are recoverable.

Human approval remains the final semblance gate. A provider, similarity metric
or automated review cannot silently approve Lulu. In Studio this does not mean
the user inspects every attempt: the closed technical and semantic gates run in
private, and human review begins only after the exact artifact reaches
`SEMANTIC_PASS`.

## 1. Authority before prompt

Never begin from descriptive prompt language alone. Resolve the authority stack in this order:

1. direct garment evidence;
2. real Lulu identity evidence;
3. real Lulu body-angle evidence;
4. approved V4 translation controls;
5. locked atelier and standalone JUW icon;
6. accepted garment-specific parent locks;
7. view-specific camera and pose grammar; and
8. advisory styling evidence, which never overrides the layers above.

Conflicts resolve toward the earlier, more direct authority. A generated control helps translation but never becomes real-person evidence merely because it looks convincing.

## 2. Minimum private authority kit

The optimized Studio runtime kit is the private manifest at `lib/server/private-asset-manifests/lulu-v4.json`. The cross-machine restore contract is `docs/virtual-atelier/portable-authority-kit.v1.json`, which adds the raw real-face anchors required to re-establish identity if an optimized board or translation lock ever needs to be rebuilt. Both manifests are safe to commit because they contain identifiers, hashes, dimensions and private pathnames rather than private pixels. The media remain private.

| Logical asset | Required role | Used for |
| --- | --- | --- |
| `lulu.face.real.primary` | Complete real Lulu face contact | Raw identity truth and board reconstruction |
| `lulu.face.real.v4.raw-frontal-closeup-eyes-closed` | Direct raw frontal facial evidence | Holistic identity synthesis and facial geometry |
| `lulu.face.real.v4.raw-three-quarter-open-eyes` | Direct raw three-quarter facial evidence | Angle identity and open-eye truth |
| `lulu.face.real.v4.front-lock` | Direct real-photo front lock | Front identity comparison; never styling authority |
| `lulu.face.operation-board.full.v1` | Complete real-face operation board | Every 05–07 identity operation |
| `lulu.face.v4.front.lock.v1` | Approved generated V4 translation lock | Repeatable face translation; never primary identity |
| `lulu.body.canon.v4` | Approved whole-body silhouette control | Holistic subject and front-body continuity |
| `lulu.body.canon.v4.three-view` | Approved three-view transfer control | Cross-angle proportion check |
| `lulu.body.canon.v4.front` | Front operation control | 05 |
| `lulu.body.canon.v4.side` | Left-profile operation control | 06 |
| `lulu.body.canon.v4.back` | Rear-angle operation control | 07 |
| `lulu.body.real.angle-contact.v4` | Direct real side/rear evidence | 06 and 07; useful in 05 body review |
| `lulu.body.real.gym-rear-profile.v4` | Direct real rear/profile evidence | 07 and rear-silhouette review |
| `lulu.body.rear.operation-board.full.v1` | Packaged rear operation board | 07 when a provider has a limited reference budget |
| `juw.atelier.empty-plate.v1` | Locked room plate | 05–07 scene authority |

The manifest's `authorityRevision`, per-asset SHA-256, byte size, MIME type, width, height and private pathname are the restore contract. A packaged board is a transport convenience, not new evidence. If a provider cannot receive the mandatory authorities without omission, the operation is `BLOCKED_CAPABILITY`.

Private revision `LULU_V4_2026-08-25.7` closes the former schema ambiguity. All 11 assets declare `acceptance: ACCEPTED_OPERATIONAL_AUTHORITY` and `lockedStatus: LOCKED_IMMUTABLE`; the private manifest and every unchanged asset byte were read back and verified. A later revision may not weaken those fields or silently substitute pixels.

## 3. Private restore and preflight

On any authorized machine:

1. restore the private manifest and its 11 authority asset objects from private Blob or the approved encrypted backup;
2. verify every exact byte count and SHA-256 before use;
3. verify decoded dimensions and MIME type;
4. verify private access fails without authorization;
5. run `node scripts/virtual-atelier/verify-assets.mjs`;
6. resolve the active garment source manifest and locked parents; and
7. stop if a required authority is missing, mismatched or inaccessible.

`storage/` is an authorized local working archive, not the portable contract by itself. A copied directory without its manifest and hashes is not a valid restore.

The two G022 metadata-hash defects recorded by the original G001–G024 audit
were corrected in the tracked asset index without altering private source
pixels. Correct metadata does not prove that ignored private bytes are present;
a restored environment must still read back and verify the exact files.

## 4. Semantic view contract

Always name the semantic role before mapping it to a filename or provider slot.

| Working view | Semantic role | Truth boundary |
| --- | --- | --- |
| 01 | `GARMENT_FRONT` | Direct visible front construction only |
| 02 | `GARMENT_BACK` | Direct rear when available; otherwise conservative inferred presentation |
| 03 | `MANNEQUIN_FRONT` | Anonymous neutral mannequin; source room has no authority |
| 04 | `FABRIC_DETAIL` | Close visible construction/material response; never fibre proof |
| 05 | `MODEL_FRONT` / `FRONT_MASTER` | Accepted Lulu front master in the locked atelier |
| 06 | `MODEL_LEFT_PROFILE` | Independent sibling from accepted 05 with side canon |
| 07 | `MODEL_REAR_THREE_QUARTER` | Independent right-rear 3Q sibling from 05; never complete back view |

Historical Shop filenames map differently. Export only through `scripts/virtual-atelier/export-shop-media.mjs`; do not hand-map numeric filenames.

## 5. Manual production sequence

### 5.1 Intake and reserve

1. Copy private source media into the active garment's gitignored `source/` directory.
2. Hash and inventory every source before interpretation.
3. Write the garment brief with proven facts, unknown facts and prohibited inferences.
4. Reserve semantic views 01–07 and state whether direct rear or side evidence exists.
5. Update `docs/virtual-atelier/state/current.json` before invoking a model.

### 5.2 Establish garment views 01–04

Generate or isolate each view independently. No candidate may parent another candidate.

After the durable Atelier cutover, these are not a separate generation lane.
The same
`prepare -> generate once -> review -> lock/reuse` facade and durable lifecycle
run `GARMENT_01_FRONT`, `GARMENT_02_BACK`, `GARMENT_03_MANNEQUIN` and
`GARMENT_04_DETAIL`. Each is a parentless root over server-resolved
`DIRECT_GARMENT_EVIDENCE` and the same garment-truth receipt. The operation is
identified by its semantic facts and hashes, never by a garment-number branch.

Until that cutover is qualified and explicitly enabled, manual Intake remains
available as a separate recovery workflow. It does not clear Atelier readiness,
and a future period of dual availability must add a cross-engine ownership
fence before both lanes may claim the same garment stage.

- 01 is the working construction authority after acceptance.
- 02 is quarantined as inferred unless direct rear evidence supports it.
- 03 must remove the source environment and use an anonymous neutral presentation.
- 04 must be a genuine close visible-detail view, not a duplicate full-front hero.

Review garment construction before model work. Reject invented seams, closures, pockets, motifs, weave, fibre claims or source-room reconstruction.

Subject synthesis requires the exact same-garment `GARMENT_FRONT_LOCK`,
`GARMENT_BACK_LOCK`, `MANNEQUIN_FRONT_LOCK` and `FABRIC_DETAIL_LOCK`. Locking
an inferred 02 preserves its quarantine; it never upgrades the rear to direct
construction evidence.

### 5.3 Build one garment-specific subject

Studio begins only after the independent same-garment 01, 02, 03 and 04 locks
resolve. Use those locks, the complete real-face operation board, approved V4
face translation lock, whole-body canon and direct real-body evidence. Declare
this as a holistic subject synthesis rather than disguising it as a local face
edit.

The successful G005 method is the historical manual precedent:

1. create a full subject from the complete authorities;
2. if needed, run one bounded second pass using the first candidate as translation context while retaining all real authorities;
3. review the whole frame, not only the face;
4. obtain explicit user approval; and
5. lock the exact accepted bytes as the garment-specific subject parent.

During the actual manual G005 run, PASS A and PASS B were shown so the user
could make the recorded whole-frame judgment. Preserve that fact in the audit;
do not convert it into Studio disclosure behavior. In Studio the first attempt
and, if needed, its one server-derived bounded correction remain private. Each
must traverse `GARMENT -> FACE -> BODY -> ROOM -> FINAL_INTEGRATION` in order;
a stage-excluded gate is `NOT_APPLICABLE`, and later applicable gates are
`NOT_EVALUATED` after the first failure. The correction has a distinct semantic
identity and repeats the complete chain. A second, unclassified or
indeterminate failure blocks without another spend.

Only the exact artifact that reaches `SEMANTIC_PASS` is readable through the
authenticated app-owned media boundary and eligible for whole-frame user
review. The historical G005 approval overrode an automated pixel-difference
objection for its deliberate rebase. It did not override garment, identity,
body, provenance or another closed semantic failure. Conversely, apparent
likeness does not override construction or authority failure.

### 5.4 Resolve styling and create 05

Run the required official Fashion Nova advisory check and record `KEEP`, `REFINE`, `REPLACE` or `NO_CLOSE_MATCH`. It may guide footwear and restrained accessories only.

Place the intact accepted subject into the exact approved room authority. Preserve identity, body, garment, hair and accepted subject geometry. Create one clean, head-to-toe 05 front master. Review and lock it before either sibling begins.

The current `juw.atelier.empty-plate.v1` is exact 1024×1280 and is accepted by
the versioned native-room profile. GPT Image 2 still returns 1024×1536; all
visible alpha must fit the guarded central window (`x=16..1007`,
`y=144..1391`), then `x=0,y=128,w=1024,h=1280` is copied one-to-one over the
unchanged room. Do not resize, crop, pad, extend or regenerate the plate, and do
not silently discard visible subject pixels. The profile requires closed
qualification before paid cutover.

### 5.5 Create 06 and 07 as siblings

Both operations branch directly from accepted 05.

- 06 receives the face board, side body canon, direct angle evidence, exact room and garment safeguard.
- 07 receives the face board, rear operation board, direct rear/profile evidence, exact room and garment safeguard.
- The V4 translation control is explicit during holistic subject synthesis. Final 05 inherits it through the accepted subject; 06/07 inherit it through accepted 05 while still receiving direct face, angle and room truth. Do not add a fifth direct provider input or drop a governing role.
- 06 never receives 07, and 07 never receives 06.
- Neither inferred rotation becomes new garment-construction evidence.

The angle review must preserve the connected whole silhouette from shoulder and torso through waist, pelvis, hip, seat and upper thigh. Do not optimize, compress or enlarge one isolated region. Normalize for pose, heel height, garment stiffness, camera distance and perspective before calling a body drift.

### 5.6 Review, lock and publish

Run separate gates for:

- garment truth;
- identity;
- complete body geometry;
- atelier and icon;
- view grammar;
- sibling lineage;
- photographic realism and texture;
- full-frame format and artifacts; and
- privacy/provenance.

Record the exact user decision. For a legacy manual run, copy the reviewed accepted bytes unchanged into `locked/`. For every Studio stage, the facade projection contains no image bytes; its authenticated review-media service refuses all pre-semantic-pass and failed states, verifies the content-addressed artifact during readback and re-authorizes the current projection before returning it. For a Studio transparent-subject run, materialize and store the deterministic room composite before semantic and human review; `Keep` binds that exact composite hash, and lock promotes those same bytes without post-approval image creation. Update the private manifest and state, then export Shop derivatives. Publication requires catalogue/database verification, a READY deployment, affected-route smoke, seven-view gallery verification when seven views exist, and a clean console. A partial publication must explicitly omit unaccepted views; G017 is the precedent. See `ENGINE-GUIDE.md` for the engine-specific ledger and artifact order.

## 6. Operation record required for every invocation

Record before invocation:

- operation ID and workflow revision;
- garment ID and semantic view role;
- exact parent locks and hashes;
- ordered authority bindings by semantic role;
- change set and immutable set;
- proven garment facts, unknowns and prohibited inferences;
- scene, camera, pose and styling contract;
- output contract and failure gates;
- provider/model capability and privacy preflight; and
- correction budget.

Record after invocation:

- provider request/job ID and execution status;
- exact compiled prompt and reference packing;
- output path, bytes, dimensions and SHA-256;
- technical review and semantic review separately;
- user decision;
- accepted/rejected/superseded lineage; and
- release evidence if promoted.

ADR 0046 defines the provider-neutral semantic hash, execution hash and event ledger. The portable core is implemented in `scripts/virtual-atelier/operation-identity.mjs`; it derives canonical semantic and provider execution identities, fails closed on provider capability, separates artifact/evaluation identity and enforces lock reuse and unsafe-retry reconciliation. The private JSON operation record plus `state/current.json` remain the recovery authorities until Studio provider routing is cut over to the ledger.

The ledger, local claim/fence, raw-byte checkpoints and four-command facade are
the single implementation contract for independent 01–04, subject and 05–07
operations. The code, five authenticated route handlers and persistence
migrations were introduced at `a6ef79b`, remain present in current `main`, and
production migrations `0015` and `0016` are applied. This does not assert
operational readiness: the deployed
route runtime remains `ENGINE_DISABLED` and the canonical qualification bundle
is absent. The former room-dimension mismatch is resolved by the exact native
1024x1280 profile, but that new profile is not a substitute for route
composition or closed qualification. Until paid cutover is complete, the private JSON
operation record plus
`state/current.json` remain the production recovery authorities.

Before trusting a restored environment, run:

```bash
npm run atelier:verify:portable -- --garment 024
```

This verifies only the universal immutable Lulu/atelier kit, the selected garment's direct sources, locked views and generation operation records. It does not require every historical garment merely because that history exists locally.

## 7. Drift-control baseline

Do not compare a new candidate only with the immediately preceding garment. Use a small multi-era baseline:

- G001/05–07 for founding room and camera lineage;
- the exact version-locked G004/05–07 derivative calibration for positive
  front/profile/rear camera, scale, poise and view-grammar targets only;
- G005 for the approved holistic subject/rebase method;
- G009 for the angle-canon failure and correction lesson;
- G023 for source-safe 03 and too-slim body rebase;
- G024 for the latest accepted front/profile/rear balance; and
- the direct real face/body authorities, which outrank every generated precedent.

G004 is pixel-bound, not nominal. Its missing canonical private originals are
not restored. The deliberate evaluator-only derivative revision is
`g004-positive-target-shop-derivatives-2026-08-26.1`, with manifest SHA-256
`451368db5dd7845fc716dbb661d7bd9153297a99802f6f8f1c441babda8aa635`
and readback receipt
`516438224ef2117c328baffde236fb7d8e3565ea6d8477147754b6de77773dc0`.
Applicable stages preflight the exact three containers before spend and re-read
them for semantic QA. These pixels never enter generation, parenting, direct
truth or cross-garment styling/garment transfer.

Provider denial is independently versioned as
`g004-provider-visual-denial-2026-08-26.1`, manifest SHA-256
`360cbf8ab42d7ca344c4296d87d28f112f809ce6952069ab664731044c0ad1d3`.
Its normalized RGB NCC/MAE gate denies calibrated full-frame derivatives after
lossy codec, colour, mirror, tiny alignment and small geometric changes before
provider transport. V1 deliberately does not claim arbitrary-subimage,
large-warp or untrusted-mosaic detection; every raw constituent is checked
before app-owned composition. It binds only the derivative calibration and
does not recover or impersonate the unavailable canonical originals.

Review 01–04 and 05–07 separately. A visually attractive frame can still fail its semantic role, and a correct role can still fail likeness or garment truth.

## 8. Failure atlas

| Pattern | Evidence | Rule carried forward |
| --- | --- | --- |
| Garment work began before 01–04 lock | G005 premature attempts | Lock garment truth before identity/body/room work |
| Automated review passed a deficient angle | G009 initial 06/07 | Dedicated angle canon and direct evidence are mandatory; user review overrides a false pass |
| Generated reference transferred jewellery | G009 subject R001 | Translation references cannot transfer styling unless granted |
| Unsupported material motif survived | G013 | A one-garment user exception is not validator precedent |
| Provider returned no bytes after output moderation | G017 and G023 rear attempts | Consent and valid authority do not override provider moderation; record no-output terminally and change capability, not euphemisms |
| Provider returned pixels but failed truth | G017 Gateway comparison | Returned pixels are not progress unless identity, body, garment, room, format and realism pass |
| Source environment leaked into 03 | G023 first public 03 | 03 is neutral and source-safe; replace only the defective semantic view |
| Subject became too slim across model views | G023 first 05–07 | Rebase the complete silhouette from direct canon; never patch one isolated contour |
| Rear/profile continuity remained weak | G024 direction | Use the complete rear board and direct evidence; assess the connected silhouette |
| Accepted record exists but locked byte is absent | G005/01 local archive | Acceptance needs a restorable exact file, manifest entry and verified hash |

## 9. Portability acceptance checklist

The workflow is portable only when all answers are yes:

- Can the operator restore and hash-verify the private authority kit?
- Can every authority be identified by semantic role rather than image number?
- Are garment facts, unknowns and inferred views explicit?
- Can the provider carry the complete mandatory stack without silently dropping it?
- Can 05, 06 and 07 lineage be reconstructed exactly?
- Are rejected and no-output attempts prevented from parenting?
- Can the exact accepted bytes and user decision be recovered?
- Can a new provider be calibrated before production use?
- Can the exact G004 derivative containers and decoded pixels reproduce the
  versioned manifest/readback receipt without pretending the originals exist?
- Can publication be tied to an exact deployment and live smoke?
- Can all private identity/body/source media remain outside public Git and browser DTOs?

If any answer is no, the environment is not production-ready even if it can generate an image.

Provider qualification uses `docs/virtual-atelier/provider-calibration.v1.json`.
A provider/model/adapter/calibration revision must pass the exact G004 positive
comparison target, G005 identity synthesis, the G009 angle false-pass
correction, G017 terminal provider failure, G023 source-room/body correction
and the complete G024 sequence. Qualification never auto-approves a generated
Lulu candidate. Production accepts this result only through the internal
qualified-evaluator resolver: one canonical receipt must bind all six case
evidence hashes, an independent-review receipt and both exact evaluator
descriptors. Caller evaluator functions and literal PASS declarations have no
authority. With no installed bundle, construction stops zero-spend at
`QUALIFICATION_NOT_PASSED`.
